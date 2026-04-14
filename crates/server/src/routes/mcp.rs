use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

use chrono::{NaiveDate, TimeZone, Utc};
use reqwest::Client;
use uuid::Uuid;

use crate::extension_registry::{ExtensionStatus, RegisteredExtension, RegisteredMcpTool};
use crate::task_stream_facade;
use crate::work_thread_facade;
use crate::AppState;

const NONE_ROLE_MARKER: &str = "__none__";
const MCP_MODULE_KEY: &str = "module:mcp-integration:enabled";
const INSTALLED_REGISTRY_KEY: &str = "plugin:_system:installed_registry";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PermissionLevel {
    Read,
    Create,
    Full,
}

impl PermissionLevel {
    fn from_setting(s: &str) -> Self {
        match s {
            "full" => PermissionLevel::Full,
            "create" => PermissionLevel::Create,
            _ => PermissionLevel::Read,
        }
    }

    fn rank(self) -> u8 {
        match self {
            PermissionLevel::Read => 0,
            PermissionLevel::Create => 1,
            PermissionLevel::Full => 2,
        }
    }
}

#[derive(Clone)]
enum RoleAcl {
    All,
    Restricted(HashSet<String>),
}

fn tool_min_rank(name: &str) -> u8 {
    match name {
        "get_overview"
        | "list_tasks"
        | "get_task"
        | "list_stream"
        | "search"
        | "get_roles"
        | "list_projects"
        | "get_project_progress"
        | "work_thread.list"
        | "work_thread.get" => 0,
        "create_task"
        | "add_stream"
        | "work_thread.create"
        | "work_thread.checkpoint"
        | "work_thread.append_event" => 1,
        "update_task"
        | "delete_task"
        | "update_stream_entry"
        | "manage_role"
        | "work_thread.update"
        | "work_thread.set_status"
        | "work_thread.delete" => 2,
        _ => 0,
    }
}

fn task_role_ids(v: &Value) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(arr) = v.get("role_ids").and_then(|x| x.as_array()) {
        for id in arr.iter().filter_map(|value| value.as_str()) {
            let id = id.to_string();
            if !id.is_empty() && !out.contains(&id) {
                out.push(id);
            }
        }
    } else if let Some(s) = v.get("role_ids").and_then(|x| x.as_str()) {
        if let Ok(arr) = serde_json::from_str::<Vec<String>>(s) {
            for id in arr {
                if !id.is_empty() && !out.contains(&id) {
                    out.push(id);
                }
            }
        }
    }
    if let Some(primary_role) = v.get("primary_role").and_then(|x| x.as_str()) {
        let primary_role = primary_role.to_string();
        if !primary_role.is_empty() && !out.contains(&primary_role) {
            out.insert(0, primary_role);
        }
    } else {
        let r = v
            .get("role")
            .or_else(|| v.get("role_id"))
            .and_then(|x| x.as_str());
        if let Some(rid) = r {
            if !rid.is_empty() && !out.contains(&rid.to_string()) {
                out.push(rid.to_string());
            }
        }
    }
    out
}

fn task_primary_role(v: &Value) -> Option<String> {
    v.get("primary_role")
        .and_then(|value| value.as_str())
        .map(String::from)
        .or_else(|| task_role_ids(v).into_iter().next())
}

fn json_string_array(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|item| item.as_str().map(String::from))
            .collect(),
        Some(Value::String(s)) => serde_json::from_str::<Vec<String>>(s).unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn stream_role_id(v: &Value) -> Option<String> {
    v.get("role_id")
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .map(String::from)
}

fn task_matches_acl(acl: &RoleAcl, v: &Value) -> bool {
    match acl {
        RoleAcl::All => true,
        RoleAcl::Restricted(set) => {
            let ids = task_role_ids(v);
            if ids.is_empty() {
                return set.contains(NONE_ROLE_MARKER);
            }
            ids.iter().any(|id| set.contains(id))
        }
    }
}

fn stream_matches_acl(acl: &RoleAcl, v: &Value) -> bool {
    match acl {
        RoleAcl::All => true,
        RoleAcl::Restricted(set) => match stream_role_id(v) {
            None => set.contains(NONE_ROLE_MARKER),
            Some(rid) => set.contains(&rid),
        },
    }
}

fn role_allowed_for_write(acl: &RoleAcl, role_opt: Option<&str>) -> bool {
    match acl {
        RoleAcl::All => true,
        RoleAcl::Restricted(set) => match role_opt {
            None | Some("") => set.contains(NONE_ROLE_MARKER),
            Some(rid) => set.contains(rid),
        },
    }
}

fn role_ids_allowed_for_write(acl: &RoleAcl, role_ids: &[String]) -> bool {
    match acl {
        RoleAcl::All => true,
        RoleAcl::Restricted(set) => {
            if role_ids.is_empty() {
                return set.contains(NONE_ROLE_MARKER);
            }
            role_ids.iter().all(|role_id| set.contains(role_id))
        }
    }
}

async fn mcp_plugin_enabled(state: &AppState, user_id: &str) -> bool {
    match state.db.get_setting(user_id, MCP_MODULE_KEY).await {
        Ok(Some(v)) => v != "false",
        _ => true,
    }
}

async fn get_permission_level(state: &AppState, user_id: &str) -> PermissionLevel {
    match state.db.get_setting(user_id, "mcp-permission-level").await {
        Ok(Some(s)) => PermissionLevel::from_setting(&s),
        _ => PermissionLevel::Read,
    }
}

async fn get_role_acl(state: &AppState, user_id: &str) -> RoleAcl {
    match state.db.get_setting(user_id, "mcp-allowed-roles").await {
        Ok(Some(s)) => {
            if let Ok(arr) = serde_json::from_str::<Vec<String>>(&s) {
                if arr.is_empty() {
                    return RoleAcl::All;
                }
                return RoleAcl::Restricted(arr.into_iter().collect());
            }
            RoleAcl::All
        }
        _ => RoleAcl::All,
    }
}

fn filter_tasks_acl(mut tasks: Vec<Value>, acl: &RoleAcl) -> Vec<Value> {
    if matches!(acl, RoleAcl::All) {
        return tasks;
    }
    tasks.retain(|t| task_matches_acl(acl, t));
    tasks
}

fn data_partition(state: &AppState, auth_user_id: &str) -> String {
    let _ = state;
    auth_user_id.to_string()
}

fn normalize_task_for_mcp(mut v: Value) -> Value {
    if let Some(obj) = v.as_object_mut() {
        if let Some(ddl) = obj.get("ddl").cloned() {
            if !ddl.is_null() {
                if let Some(ms) = ddl.as_i64() {
                    obj.insert("ddl".into(), json!(ms_to_iso_z(ms)));
                } else if let Some(ms) = ddl.as_f64() {
                    obj.insert("ddl".into(), json!(ms_to_iso_z(ms as i64)));
                }
            }
        }
        if let Some(pa) = obj.get("planned_at").cloned() {
            if !pa.is_null() {
                if let Some(ms) = pa.as_i64() {
                    obj.insert("planned_at".into(), json!(ms_to_iso_z(ms)));
                } else if let Some(ms) = pa.as_f64() {
                    obj.insert("planned_at".into(), json!(ms_to_iso_z(ms as i64)));
                }
            }
        }
    }
    v
}

fn ms_to_iso_z(ms: i64) -> String {
    Utc.timestamp_millis_opt(ms)
        .single()
        .map(|dt| dt.to_rfc3339())
        .unwrap_or_default()
}

fn parse_iso_to_ms(s: &str) -> Option<i64> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.timestamp_millis());
    }
    let prefix = if s.len() >= 10 { &s[..10] } else { s };
    chrono::NaiveDate::parse_from_str(prefix, "%Y-%m-%d")
        .ok()
        .map(|d| d.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp_millis())
}

fn time_hms_from_ms(ms: i64) -> String {
    Utc.timestamp_millis_opt(ms)
        .single()
        .map(|dt| dt.format("%H:%M:%S").to_string())
        .unwrap_or_else(|| "00:00:00".into())
}

// ── JSON-RPC 2.0 Types ─────────────────────────────────────────

#[derive(Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Option<Value>,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Serialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Serialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

fn ok_response(id: Option<Value>, result: Value) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".into(),
        id,
        result: Some(result),
        error: None,
    }
}

fn err_response(id: Option<Value>, code: i32, message: &str) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".into(),
        id,
        result: None,
        error: Some(JsonRpcError {
            code,
            message: message.into(),
            data: None,
        }),
    }
}

fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    chrono_lite_timestamp(secs as i64)
}

fn chrono_lite_timestamp(epoch_secs: i64) -> String {
    const SECS_PER_DAY: i64 = 86400;
    const DAYS_OFFSET: i64 = 719_468; // days from 0000-03-01 to 1970-01-01

    let secs_of_day = ((epoch_secs % SECS_PER_DAY) + SECS_PER_DAY) % SECS_PER_DAY;
    let days = (epoch_secs - secs_of_day) / SECS_PER_DAY + DAYS_OFFSET;

    let era = if days >= 0 { days } else { days - 146096 } / 146097;
    let doe = (days - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    let h = secs_of_day / 3600;
    let min = (secs_of_day % 3600) / 60;
    let s = secs_of_day % 60;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z",
        y, m, d, h, min, s
    )
}

fn today_date_key() -> String {
    let ts = now_iso();
    ts[..10].to_string()
}

fn generate_task_id() -> String {
    format!("se-{}", Uuid::new_v4())
}

fn days_overdue(ddl_iso: &str) -> Option<i64> {
    let today = today_date_key();
    let ddl_date = ddl_iso.get(..10)?;
    let t = NaiveDate::parse_from_str(&today, "%Y-%m-%d").ok()?;
    let d = NaiveDate::parse_from_str(ddl_date, "%Y-%m-%d").ok()?;
    let diff = t.signed_duration_since(d).num_days();
    if diff > 0 {
        Some(diff)
    } else {
        None
    }
}

fn days_left_until(ddl_iso: &str) -> Option<i64> {
    let today = today_date_key();
    let ddl_date = ddl_iso.get(..10)?;
    let t = NaiveDate::parse_from_str(&today, "%Y-%m-%d").ok()?;
    let d = NaiveDate::parse_from_str(ddl_date, "%Y-%m-%d").ok()?;
    let diff = d.signed_duration_since(t).num_days();
    if diff >= 0 {
        Some(diff)
    } else {
        None
    }
}

fn preview_text(s: &str, max: usize) -> String {
    let t = s.trim();
    if t.chars().count() <= max {
        return t.to_string();
    }
    t.chars().take(max).collect::<String>() + "…"
}

// ── MCP Handler ─────────────────────────────────────────────────

pub async fn handle_mcp(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(req): Json<JsonRpcRequest>,
) -> (StatusCode, Json<JsonRpcResponse>) {
    if !mcp_plugin_enabled(&state, &user_id).await {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(err_response(req.id, -32000, "MCP integration is disabled")),
        );
    }
    let resp = match req.method.as_str() {
        "initialize" => handle_initialize(req.id),
        "notifications/initialized" => {
            return (StatusCode::OK, Json(ok_response(req.id, json!({}))));
        }
        "tools/list" => handle_tools_list(&state, &user_id, req.id).await,
        "tools/call" => handle_tools_call(&state, &user_id, req.id, &req.params).await,
        "resources/list" => handle_resources_list(req.id),
        "resources/read" => handle_resources_read(&state, &user_id, req.id, &req.params).await,
        _ => err_response(req.id, -32601, &format!("Method not found: {}", req.method)),
    };
    (StatusCode::OK, Json(resp))
}

fn handle_initialize(id: Option<Value>) -> JsonRpcResponse {
    ok_response(
        id,
        json!({
            "protocolVersion": "2025-03-26",
            "capabilities": {
                "tools": { "listChanged": false },
                "resources": { "listChanged": false },
            },
            "serverInfo": {
                "name": "my-little-todo",
                "version": "0.7.0",
            },
        }),
    )
}

async fn get_disabled_tools(state: &AppState, user_id: &str) -> HashSet<String> {
    match state.db.get_setting(user_id, "mcp-disabled-tools").await {
        Ok(Some(json_str)) => serde_json::from_str(&json_str).unwrap_or_default(),
        _ => HashSet::new(),
    }
}

fn all_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "get_overview",
            "description": "全局概览：任务计数、今日/进行中/逾期/即将到期、最近完成、角色、日程、今日流预览、专注会话。首选入口。",
            "inputSchema": { "type": "object", "properties": {} },
        }),
        json!({
            "name": "list_tasks",
            "description": "列出任务（轻量摘要，无正文）。支持分页、父任务子任务、按标签与排序。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "status": { "type": "string", "enum": ["inbox", "active", "today", "completed", "archived", "cancelled"], "description": "按状态筛选" },
                    "primary_role": { "type": "string", "description": "按主角色筛选" },
                    "role_ids": { "type": "array", "items": { "type": "string" }, "description": "按任务角色集合筛选，任一匹配即可" },
                    "parent_id": { "type": "string", "description": "父任务 ID，仅列出直接子任务" },
                    "tags": { "type": "array", "items": { "type": "string" }, "description": "按标签过滤（任一匹配）" },
                    "sort": { "type": "string", "enum": ["priority", "ddl", "created"], "description": "排序，默认 created" },
                    "offset": { "type": "integer", "description": "分页偏移，默认0" },
                    "limit": { "type": "integer", "description": "每页条数，默认20，最大50" },
                },
            },
        }),
        json!({
            "name": "get_task",
            "description": "单个任务完整信息（含正文）。含子任务与父任务摘要。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "任务ID" },
                },
                "required": ["id"],
            },
        }),
        json!({
            "name": "list_projects",
            "description": "列出标记为「项目」的任务（非 completed/archived），可选按角色筛选；含子树完成进度。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "primary_role": { "type": "string", "description": "按主角色筛选" },
                    "role_ids": { "type": "array", "items": { "type": "string" }, "description": "按任务角色集合筛选" },
                },
            },
        }),
        json!({
            "name": "get_project_progress",
            "description": "单个项目任务的子树完成进度（统计所有后代任务，不含根项目自身）。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "项目任务ID" },
                },
                "required": ["id"],
            },
        }),
        json!({
            "name": "get_roles",
            "description": "角色列表及统计（活跃数、今日/逾期）。",
            "inputSchema": { "type": "object", "properties": {} },
        }),
        json!({
            "name": "create_task",
            "description": "创建任务，默认 inbox。ddl_type: hard/commitment/soft。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "任务标题" },
                    "body": { "type": "string", "description": "正文/笔记" },
                    "ddl": { "type": "string", "description": "截止时间 ISO 8601" },
                    "ddl_type": { "type": "string", "enum": ["hard", "commitment", "soft"] },
                    "planned_at": { "type": "string", "description": "计划处理时间 ISO 8601" },
                    "role_ids": { "type": "array", "items": { "type": "string" }, "description": "任务角色集合" },
                    "primary_role": { "type": "string", "description": "可选；若同时提供 role_ids，则必须等于 role_ids[0]" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "parent_id": { "type": "string", "description": "父任务 ID" },
                    "task_type": { "type": "string", "enum": ["task", "project"], "description": "任务或项目容器" },
                },
                "required": ["title"],
            },
        }),
        json!({
            "name": "update_task",
            "description": "更新任务。status=completed 完成；可附 note。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "任务ID" },
                    "title": { "type": "string" },
                    "body": { "type": "string", "description": "正文" },
                    "status": { "type": "string", "enum": ["inbox", "active", "today", "completed", "archived", "cancelled"] },
                    "ddl": { "type": "string", "description": "新截止时间 ISO 8601" },
                    "ddl_type": { "type": "string", "enum": ["hard", "commitment", "soft"] },
                    "planned_at": { "type": "string", "description": "计划时间 ISO 8601" },
                    "role_ids": { "type": "array", "items": { "type": "string" }, "description": "新的任务角色集合" },
                    "primary_role": { "type": "string", "description": "可选；若同时提供 role_ids，则必须等于 role_ids[0]" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "note": { "type": "string", "description": "变更备注" },
                    "task_type": { "type": "string", "enum": ["task", "project"], "description": "设为 project 表示项目容器；task 表示普通任务" },
                },
                "required": ["id"],
            },
        }),
        json!({
            "name": "delete_task",
            "description": "删除任务。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "任务ID" },
                },
                "required": ["id"],
            },
        }),
        json!({
            "name": "add_stream",
            "description": "添加流记录。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "content": { "type": "string", "description": "内容（markdown）" },
                    "role_id": { "type": "string", "description": "stream 主角色" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "entry_type": { "type": "string", "enum": ["spark", "task", "log"], "description": "条目类型，默认 spark" },
                },
                "required": ["content"],
            },
        }),
        json!({
            "name": "list_stream",
            "description": "列出流记录，支持分页与按角色/类型过滤。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "days": { "type": "integer", "description": "回溯天数，默认7" },
                    "limit": { "type": "integer", "description": "每页条数，默认20，最大50" },
                    "offset": { "type": "integer", "description": "分页偏移，默认0" },
                    "role_id": { "type": "string", "description": "按 stream 主角色筛选" },
                    "entry_type": { "type": "string", "enum": ["spark", "task", "log"], "description": "条目类型" },
                },
            },
        }),
        json!({
            "name": "update_stream_entry",
            "description": "更新流记录内容、角色或类型。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "流条目ID" },
                    "content": { "type": "string" },
                    "role_id": { "type": "string", "description": "stream 主角色" },
                    "entry_type": { "type": "string", "enum": ["spark", "task", "log"] },
                    "tags": { "type": "array", "items": { "type": "string" } },
                },
                "required": ["id"],
            },
        }),
        json!({
            "name": "manage_role",
            "description": "创建、更新或删除角色。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "action": { "type": "string", "enum": ["create", "update", "delete"] },
                    "id": { "type": "string", "description": "角色ID（update/delete）" },
                    "name": { "type": "string", "description": "名称（create）" },
                    "color": { "type": "string" },
                    "icon": { "type": "string" },
                },
                "required": ["action"],
            },
        }),
        json!({
            "name": "search",
            "description": "在任务 title/body 与流 content 上结构化子串搜索（不扫整段 JSON）。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "关键词" },
                    "scope": { "type": "string", "enum": ["all", "tasks", "stream"], "description": "默认 all" },
                    "limit": { "type": "integer", "description": "最大结果数，默认10，上限100" },
                },
                "required": ["query"],
            },
        }),
    ]
}

fn work_thread_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "work_thread.list",
            "description": "列出工作线程，按 updatedAt 倒序返回。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "limit": { "type": "integer", "description": "最大返回数量，默认 50，上限 200" }
                }
            }
        }),
        json!({
            "name": "work_thread.get",
            "description": "读取单个工作线程，并可附带最近事件。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "线程 ID" },
                    "include_events": { "type": "boolean", "description": "是否附带最近事件，默认 true" },
                    "event_limit": { "type": "integer", "description": "事件数量上限，默认 30，上限 300" }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "work_thread.create",
            "description": "创建工作线程。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "mission": { "type": "string" },
                    "lane": { "type": "string", "enum": ["general", "execution", "research", "infrastructure", "meta"] },
                    "status": { "type": "string", "enum": ["running", "ready", "waiting", "blocked", "sleeping", "done", "archived"] },
                    "roleId": { "type": "string" },
                    "docMarkdown": { "type": "string" }
                }
            }
        }),
        json!({
            "name": "work_thread.update",
            "description": "更新工作线程顶层字段与 resumeCard/schedulerMeta/syncMeta。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "patch": { "type": "object", "description": "需要合并进线程对象的 patch" }
                },
                "required": ["id", "patch"]
            }
        }),
        json!({
            "name": "work_thread.set_status",
            "description": "设置工作线程状态。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "status": { "type": "string", "enum": ["running", "ready", "waiting", "blocked", "sleeping", "done", "archived"] }
                },
                "required": ["id", "status"]
            }
        }),
        json!({
            "name": "work_thread.checkpoint",
            "description": "保存线程 checkpoint，并更新最近 checkpoint 时间。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "title": { "type": "string" }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "work_thread.append_event",
            "description": "向工作线程追加时间线事件。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "type": { "type": "string" },
                    "actor": { "type": "string", "enum": ["user", "ai", "system"] },
                    "title": { "type": "string" },
                    "detailMarkdown": { "type": "string" },
                    "payload": { "type": "object" }
                },
                "required": ["id", "title"]
            }
        }),
        json!({
            "name": "work_thread.delete",
            "description": "删除工作线程及其事件。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" }
                },
                "required": ["id"]
            }
        }),
    ]
}

async fn handle_tools_list(state: &AppState, user_id: &str, id: Option<Value>) -> JsonRpcResponse {
    let disabled = get_disabled_tools(state, user_id).await;
    let level = get_permission_level(state, user_id).await;
    let mut all_tools = all_tool_definitions();
    if work_thread_facade::work_thread_enabled(state.db.as_ref(), user_id).await {
        all_tools.extend(work_thread_tool_definitions());
    }
    let mut tools: Vec<Value> = all_tools
        .into_iter()
        .filter(|t| {
            let name = t.get("name").and_then(|n| n.as_str()).unwrap_or("");
            !disabled.contains(name) && level.rank() >= tool_min_rank(name)
        })
        .collect();
    tools.extend(
        plugin_tool_definitions(state, user_id, &disabled, level.rank())
            .await
            .into_iter(),
    );
    ok_response(id, json!({ "tools": tools }))
}

async fn handle_tools_call(
    state: &AppState,
    user_id: &str,
    id: Option<Value>,
    params: &Value,
) -> JsonRpcResponse {
    let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let args = params.get("arguments").cloned().unwrap_or(json!({}));

    if let Some(provider_error) = plugin_provider_error(state, user_id, tool_name).await {
        return err_response(id, -32601, &provider_error);
    }

    if tool_name.starts_with("work_thread.")
        && !work_thread_facade::work_thread_enabled(state.db.as_ref(), user_id).await
    {
        return err_response(id, -32601, "Tool provider 'work-thread' is disabled");
    }

    let plugin_tool = if tool_name.starts_with("plugin.") {
        state.extension_registry.find_tool(tool_name).await
    } else {
        None
    };

    let level = get_permission_level(state, user_id).await;
    let min_rank = plugin_tool
        .as_ref()
        .map(|(_, tool)| tool.permission.rank())
        .unwrap_or_else(|| tool_min_rank(tool_name));
    if level.rank() < min_rank {
        return err_response(
            id,
            -32601,
            &format!(
                "Tool '{}' requires a higher permission level (current: {:?})",
                tool_name, level
            ),
        );
    }

    let disabled = get_disabled_tools(state, user_id).await;
    if disabled.contains(tool_name) {
        return err_response(
            id,
            -32601,
            &format!("Tool '{}' is disabled by user settings", tool_name),
        );
    }

    if tool_name.starts_with("plugin.") {
        let Some((extension, tool)) = plugin_tool else {
            return err_response(id, -32601, &format!("Unknown tool: {}", tool_name));
        };
        return match proxy_plugin_tool_call(&extension, tool_name, &tool, &args).await {
            Ok(result) => ok_response(id, result),
            Err(error) => err_response(id, -32000, &error),
        };
    }

    let result = match tool_name {
        "get_overview" => tool_overview(state, user_id).await,
        "list_tasks" => tool_list_tasks(state, user_id, &args).await,
        "get_task" => tool_get_task(state, user_id, &args).await,
        "list_projects" => tool_list_projects(state, user_id, &args).await,
        "get_project_progress" => tool_get_project_progress(state, user_id, &args).await,
        "get_roles" => tool_get_roles_stats(state, user_id).await,
        "create_task" => tool_create_task(state, user_id, &args).await,
        "update_task" => tool_update_task(state, user_id, &args).await,
        "delete_task" => tool_delete_task(state, user_id, &args).await,
        "add_stream" => tool_add_stream_entry(state, user_id, &args).await,
        "list_stream" => tool_list_stream(state, user_id, &args).await,
        "update_stream_entry" => tool_update_stream_entry(state, user_id, &args).await,
        "manage_role" => tool_manage_role(state, user_id, &args).await,
        "search" => tool_search(state, user_id, &args).await,
        "work_thread.list" => tool_list_work_threads(state, user_id, &args).await,
        "work_thread.get" => tool_get_work_thread(state, user_id, &args).await,
        "work_thread.create" => tool_create_work_thread(state, user_id, &args).await,
        "work_thread.update" => tool_update_work_thread(state, user_id, &args).await,
        "work_thread.set_status" => tool_set_work_thread_status(state, user_id, &args).await,
        "work_thread.checkpoint" => tool_checkpoint_work_thread(state, user_id, &args).await,
        "work_thread.append_event" => tool_append_work_thread_event(state, user_id, &args).await,
        "work_thread.delete" => tool_delete_work_thread(state, user_id, &args).await,
        _ => Err(format!("Unknown tool: {}", tool_name)),
    };

    match result {
        Ok(content) => ok_response(
            id,
            json!({
                "content": [{
                    "type": "text",
                    "text": serde_json::to_string(&content).unwrap_or_default(),
                }],
            }),
        ),
        Err(e) => ok_response(
            id,
            json!({
                "content": [{ "type": "text", "text": e }],
                "isError": true,
            }),
        ),
    }
}

async fn plugin_tool_definitions(
    state: &AppState,
    user_id: &str,
    disabled: &HashSet<String>,
    current_rank: u8,
) -> Vec<Value> {
    let mut tools = Vec::new();
    for extension in state.extension_registry.all().await {
        if extension.status != ExtensionStatus::Running {
            continue;
        }
        if plugin_installation_state(state, user_id, &extension.plugin_id).await
            != PluginInstallState::Runnable
        {
            continue;
        }
        for tool in &extension.mcp_tools {
            let full_name = prefixed_plugin_tool_name(&extension, tool);
            if disabled.contains(&full_name) || current_rank < tool.permission.rank() {
                continue;
            }
            tools.push(json!({
                "name": full_name,
                "description": tool.description,
                "inputSchema": {
                    "type": "object",
                    "properties": {}
                }
            }));
        }
    }
    tools
}

async fn proxy_plugin_tool_call(
    extension: &RegisteredExtension,
    full_tool_name: &str,
    tool: &RegisteredMcpTool,
    args: &Value,
) -> Result<Value, String> {
    let client = Client::new();
    let payload = json!({
        "name": normalized_plugin_tool_name(full_tool_name, &extension.plugin_id, &tool.name),
        "fullName": full_tool_name,
        "arguments": args,
    });
    let mut request = client.post(format!(
        "{}/mcp/tools/call",
        extension.proxy_base_url.trim_end_matches('/')
    ));
    if let Some(token) = &extension.runner_token {
        request = request.header("x-mlt-plugin-token", token);
    }
    let response = request
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Plugin MCP proxy failed: {}", e))?;
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|e| format!("Plugin MCP proxy returned invalid JSON: {}", e))?;
    if !status.is_success() {
        return Err(body
            .get("error")
            .and_then(|value| value.as_str())
            .map(String::from)
            .unwrap_or_else(|| format!("Plugin MCP proxy returned {}", status)));
    }
    Ok(body)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PluginInstallState {
    Unknown,
    Disabled,
    Unavailable,
    Runnable,
}

async fn plugin_provider_error(state: &AppState, user_id: &str, tool_name: &str) -> Option<String> {
    if !tool_name.starts_with("plugin.") {
        return None;
    }
    let plugin_id = plugin_id_from_tool_name(tool_name)?;
    match plugin_installation_state(state, user_id, &plugin_id).await {
        PluginInstallState::Disabled => Some(format!("Tool provider '{}' is disabled", plugin_id)),
        PluginInstallState::Unavailable => {
            Some(format!("Tool provider '{}' is unavailable", plugin_id))
        }
        PluginInstallState::Unknown => {
            Some(format!("Tool provider '{}' is not registered", plugin_id))
        }
        PluginInstallState::Runnable => {
            if state
                .extension_registry
                .find_tool(tool_name)
                .await
                .is_none()
            {
                Some(format!(
                    "Tool '{}' is not registered by provider '{}'",
                    tool_name, plugin_id
                ))
            } else {
                None
            }
        }
    }
}

async fn plugin_installation_state(
    state: &AppState,
    user_id: &str,
    plugin_id: &str,
) -> PluginInstallState {
    let raw = match state.db.get_setting(user_id, INSTALLED_REGISTRY_KEY).await {
        Ok(value) => value,
        Err(_) => return PluginInstallState::Unknown,
    };
    let Some(raw) = raw else {
        return PluginInstallState::Unknown;
    };
    let parsed = match serde_json::from_str::<Value>(&raw) {
        Ok(value) => value,
        Err(_) => return PluginInstallState::Unknown,
    };
    let Some(record) = parsed.get(plugin_id) else {
        return PluginInstallState::Unknown;
    };
    if !record
        .get("enabled")
        .and_then(|value| value.as_bool())
        .unwrap_or(true)
    {
        return PluginInstallState::Disabled;
    }
    if record
        .get("manifest")
        .and_then(|value| value.get("server"))
        .is_none()
    {
        return PluginInstallState::Unknown;
    }
    if !record
        .get("serverApproved")
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
    {
        return PluginInstallState::Disabled;
    }
    match record
        .get("serverStatus")
        .and_then(|value| value.as_str())
        .unwrap_or("unavailable")
    {
        "running" => PluginInstallState::Runnable,
        _ => PluginInstallState::Unavailable,
    }
}

fn plugin_id_from_tool_name(tool_name: &str) -> Option<String> {
    let mut parts = tool_name.splitn(4, '.');
    if parts.next()? != "plugin" {
        return None;
    }
    Some(parts.next()?.to_string())
}

fn normalized_plugin_tool_name(full_name: &str, plugin_id: &str, declared_name: &str) -> String {
    let prefix = format!("plugin.{}.", plugin_id);
    if let Some(stripped) = full_name.strip_prefix(&prefix) {
        return stripped.to_string();
    }
    if let Some(stripped) = declared_name.strip_prefix(&prefix) {
        return stripped.to_string();
    }
    declared_name.to_string()
}

fn prefixed_plugin_tool_name(extension: &RegisteredExtension, tool: &RegisteredMcpTool) -> String {
    let prefix = format!("plugin.{}.", extension.plugin_id);
    if tool.name.starts_with(&prefix) {
        tool.name.clone()
    } else {
        format!("{}{}", prefix, tool.name)
    }
}

fn handle_resources_list(id: Option<Value>) -> JsonRpcResponse {
    ok_response(
        id,
        json!({
            "resources": [
                {
                    "uri": "tasks://active",
                    "name": "Active Tasks",
                    "description": "Currently active (non-completed) tasks summary",
                    "mimeType": "application/json",
                },
                {
                    "uri": "tasks://today",
                    "name": "Today's Tasks",
                    "description": "Tasks due today",
                    "mimeType": "application/json",
                },
                {
                    "uri": "roles://list",
                    "name": "Roles",
                    "description": "List of all user roles",
                    "mimeType": "application/json",
                },
            ]
        }),
    )
}

async fn handle_resources_read(
    state: &AppState,
    user_id: &str,
    id: Option<Value>,
    params: &Value,
) -> JsonRpcResponse {
    let uri = params.get("uri").and_then(|v| v.as_str()).unwrap_or("");

    let result = match uri {
        "tasks://active" => resource_active_tasks(state, user_id).await,
        "tasks://today" => resource_today_tasks(state, user_id).await,
        "roles://list" => tool_list_roles(state, user_id).await,
        _ => Err(format!("Unknown resource: {}", uri)),
    };

    match result {
        Ok(content) => ok_response(
            id,
            json!({
                "contents": [{
                    "uri": uri,
                    "mimeType": "application/json",
                    "text": serde_json::to_string_pretty(&content).unwrap_or_default(),
                }],
            }),
        ),
        Err(e) => err_response(id, -32000, &e),
    }
}

// ── Helpers ──────────────────────────────────────────────────────

async fn load_role_map(
    state: &AppState,
    user_id: &str,
) -> HashMap<String, (String, Option<String>)> {
    let raw = state.db.get_setting(user_id, "roles").await.ok().flatten();
    let mut map = HashMap::new();
    if let Some(data) = raw {
        if let Ok(parsed) = serde_json::from_str::<Value>(&data) {
            if let Some(roles) = parsed.get("roles").and_then(|v| v.as_array()) {
                for r in roles {
                    if let (Some(id), Some(name)) = (
                        r.get("id").and_then(|v| v.as_str()),
                        r.get("name").and_then(|v| v.as_str()),
                    ) {
                        let color = r.get("color").and_then(|v| v.as_str()).map(String::from);
                        map.insert(id.to_string(), (name.to_string(), color));
                    }
                }
            }
        }
    }
    map
}

#[allow(dead_code)]
fn enrich_task_with_role(task: &mut Value, role_map: &HashMap<String, (String, Option<String>)>) {
    if let Some(role_id) = task_primary_role(task) {
        if let Some((name, _)) = role_map.get(&role_id) {
            task.as_object_mut()
                .map(|obj| obj.insert("primary_role_name".to_string(), json!(name)));
        }
    }
}

// ── Tool Implementations ────────────────────────────────────────

fn subtask_progress_line(task: &Value, all_tasks: &[Value]) -> Option<String> {
    let ids = json_string_array(task.get("subtask_ids"));
    if ids.is_empty() {
        return None;
    }
    let mut done = 0u32;
    for id in &ids {
        if let Some(st) = all_tasks.iter().find(|t| {
            t.get("id")
                .and_then(|x| x.as_str())
                .map(|tid| tid == id.as_str())
                .unwrap_or(false)
        }) {
            let s = st.get("status").and_then(|x| x.as_str()).unwrap_or("");
            if s == "completed" || s == "cancelled" || s == "archived" {
                done += 1;
            }
        }
    }
    Some(format!("{}/{}", done, ids.len()))
}

fn task_summary_line(
    task: &Value,
    role_map: &HashMap<String, (String, Option<String>)>,
    extra: Value,
) -> Value {
    let mut t = extra;
    if let Some(role_id) = task_primary_role(task) {
        t.as_object_mut().map(|o| {
            o.insert("primary_role".into(), json!(role_id));
            if let Some((name, _)) = role_map.get(&role_id) {
                o.insert("primary_role_name".into(), json!(name));
            }
        });
    }
    t
}

async fn tool_overview(state: &AppState, user_id: &str) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    let mut tasks = load_all_tasks(state, user_id).await?;
    tasks = filter_tasks_acl(tasks, &acl);
    let role_map = load_role_map(state, user_id).await;
    let today = today_date_key();
    let week_end = today_plus_days(7);

    let mut counts: HashMap<String, u32> = HashMap::new();
    for task in &tasks {
        let status = task
            .get("status")
            .and_then(|s| s.as_str())
            .unwrap_or("unknown");
        *counts.entry(status.to_string()).or_insert(0) += 1;
    }

    let mut today_tasks: Vec<Value> = Vec::new();
    let mut active_tasks: Vec<Value> = Vec::new();
    let mut overdue: Vec<Value> = Vec::new();
    let mut upcoming_ddl: Vec<Value> = Vec::new();

    for task in &tasks {
        let status = task.get("status").and_then(|s| s.as_str()).unwrap_or("");
        let id = task.get("id").cloned().unwrap_or(json!(null));
        let title = task.get("title").cloned().unwrap_or(json!(""));
        let ddl = task.get("ddl").and_then(|d| d.as_str()).unwrap_or("");
        let ddl_type = task.get("ddl_type").cloned();

        if status == "today" {
            let prog = subtask_progress_line(task, &tasks);
            let mut row = json!({
                "id": id,
                "title": title,
                "ddl": ddl,
                "ddl_type": ddl_type,
                "status": status,
            });
            if let Some(p) = prog {
                row.as_object_mut()
                    .map(|o| o.insert("subtask_progress".into(), json!(p)));
            }
            today_tasks.push(task_summary_line(task, &role_map, row));
        }
        if status == "active" && active_tasks.len() < 20 {
            active_tasks.push(task_summary_line(
                task,
                &role_map,
                json!({
                    "id": id,
                    "title": title,
                    "ddl": ddl,
                }),
            ));
        }
        let terminal = status == "completed" || status == "cancelled" || status == "archived";
        if !terminal && !ddl.is_empty() && ddl.len() >= 10 {
            if let Some(od) = days_overdue(ddl) {
                overdue.push(task_summary_line(
                    task,
                    &role_map,
                    json!({
                        "id": id,
                        "title": title,
                        "ddl": ddl,
                        "ddl_type": ddl_type,
                        "days_overdue": od,
                    }),
                ));
            } else if ddl.len() >= 10 {
                let dd = &ddl[..10];
                if dd > today.as_str() && dd <= week_end.as_str() {
                    if let Some(dl) = days_left_until(ddl) {
                        upcoming_ddl.push(task_summary_line(
                            task,
                            &role_map,
                            json!({
                                "id": id,
                                "title": title,
                                "ddl": ddl,
                                "ddl_type": ddl_type,
                                "days_left": dl,
                            }),
                        ));
                    }
                }
            }
        }
    }

    upcoming_ddl.sort_by(|a, b| {
        let da = a.get("ddl").and_then(|v| v.as_str()).unwrap_or("");
        let db = b.get("ddl").and_then(|v| v.as_str()).unwrap_or("");
        da.cmp(db)
    });
    upcoming_ddl.truncate(10);

    let cutoff = Utc::now().timestamp_millis() - 48 * 3600 * 1000;
    let mut completed_pool: Vec<Value> = Vec::new();
    for task in &tasks {
        if task.get("status").and_then(|s| s.as_str()) != Some("completed") {
            continue;
        }
        let ca = task
            .get("completed_at")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        if ca >= cutoff {
            completed_pool.push(json!({
                "id": task.get("id"),
                "title": task.get("title"),
                "completed_at": ms_to_iso_z(ca),
            }));
        }
    }
    completed_pool.sort_by(|a, b| {
        let ca = a.get("completed_at").and_then(|v| v.as_str()).unwrap_or("");
        let cb = b.get("completed_at").and_then(|v| v.as_str()).unwrap_or("");
        cb.cmp(ca)
    });
    let recent_completed: Vec<Value> = completed_pool.into_iter().take(10).collect();

    let mut roles_json: Vec<Value> = Vec::new();
    for (rid, (name, color)) in &role_map {
        if let RoleAcl::Restricted(set) = &acl {
            if !set.contains(rid) {
                continue;
            }
        }
        let active = tasks
            .iter()
            .filter(|t| {
                let s = t.get("status").and_then(|v| v.as_str()).unwrap_or("");
                task_role_ids(t).iter().any(|task_role| task_role == rid)
                    && s != "completed"
                    && s != "cancelled"
                    && s != "archived"
            })
            .count();
        let today_c = tasks
            .iter()
            .filter(|t| {
                t.get("status").and_then(|v| v.as_str()) == Some("today")
                    && task_role_ids(t).iter().any(|task_role| task_role == rid)
            })
            .count();
        let overdue_c = tasks
            .iter()
            .filter(|t| {
                let s = t.get("status").and_then(|v| v.as_str()).unwrap_or("");
                if s == "completed" || s == "cancelled" || s == "archived" {
                    return false;
                }
                task_role_ids(t).iter().any(|task_role| task_role == rid)
                    && t.get("ddl")
                        .and_then(|d| d.as_str())
                        .and_then(days_overdue)
                        .is_some()
            })
            .count();
        let mut r = json!({
            "id": rid,
            "name": name,
            "active_count": active,
            "today_count": today_c,
            "overdue_count": overdue_c,
        });
        if let Some(c) = color {
            r.as_object_mut()
                .map(|o| o.insert("color".into(), json!(c)));
        }
        roles_json.push(r);
    }

    let schedule_raw = state
        .db
        .get_setting(user_id, "schedule-blocks")
        .await
        .map_err(|e| e.to_string())?;
    let schedule: Value = schedule_raw
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(json!([]));

    let p = data_partition(state, user_id);
    let stream_rows = state
        .db
        .list_stream_day_json(&p, &today)
        .await
        .unwrap_or_default();
    let mut stream_latest: Vec<Value> = Vec::new();
    let mut stream_count = 0u32;
    for raw in stream_rows {
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            if stream_matches_acl(&acl, &v) {
                stream_count += 1;
                if stream_latest.len() < 5 {
                    let ts = v.get("timestamp").and_then(|x| x.as_i64()).unwrap_or(0);
                    let content = v.get("content").and_then(|x| x.as_str()).unwrap_or("");
                    stream_latest.push(json!({
                        "time": time_hms_from_ms(ts),
                        "content": preview_text(content, 80),
                    }));
                }
            }
        }
    }

    let focus_session = state
        .db
        .get_setting(user_id, "focus-session")
        .await
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| {
            let tid = v.get("taskId").and_then(|x| x.as_str())?;
            let started_ms = v
                .get("startedAt")
                .and_then(|x| x.as_str())
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|d| d.timestamp_millis())
                .or_else(|| v.get("startedAt").and_then(|x| x.as_i64()))?;
            let started_iso = ms_to_iso_z(started_ms);
            let elapsed = (Utc::now().timestamp_millis() - started_ms).max(0) / 60000;
            Some(json!({
                "task_id": tid,
                "started_at": started_iso,
                "elapsed_min": elapsed,
            }))
        });

    Ok(json!({
        "date": today,
        "counts": counts,
        "today_tasks": today_tasks,
        "active_tasks": active_tasks,
        "overdue": overdue,
        "upcoming_ddl": upcoming_ddl,
        "recent_completed": recent_completed,
        "roles": roles_json,
        "schedule": schedule,
        "stream_today": {
            "count": stream_count,
            "latest": stream_latest,
        },
        "focus_session": focus_session,
    }))
}

fn today_plus_days(n: u32) -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        + (n as u64 * 86400);
    let ts = chrono_lite_timestamp(secs as i64);
    ts[..10].to_string()
}

async fn load_all_tasks(state: &AppState, user_id: &str) -> Result<Vec<Value>, String> {
    let p = data_partition(state, user_id);
    let tasks = task_stream_facade::list_tasks(state.db.as_ref(), &p).await?;
    Ok(tasks.into_iter().map(normalize_task_for_mcp).collect())
}

fn task_tags_match(task: &Value, wanted: &[String]) -> bool {
    if wanted.is_empty() {
        return true;
    }
    let tags = json_string_array(task.get("tags"));
    let lower: Vec<String> = wanted.iter().map(|t| t.to_lowercase()).collect();
    tags.iter().any(|t| lower.contains(&t.to_lowercase()))
}

fn sort_tasks_list(tasks: &mut [Value], sort: &str) {
    match sort {
        "ddl" => {
            tasks.sort_by(|a, b| {
                let da = a
                    .get("ddl")
                    .and_then(|v| v.as_str())
                    .unwrap_or("9999-99-99");
                let db = b
                    .get("ddl")
                    .and_then(|v| v.as_str())
                    .unwrap_or("9999-99-99");
                da.cmp(db)
            });
        }
        "priority" => {
            tasks.sort_by(|a, b| {
                let pa = a.get("priority").and_then(|v| v.as_i64()).unwrap_or(-1);
                let pb = b.get("priority").and_then(|v| v.as_i64()).unwrap_or(-1);
                pb.cmp(&pa)
            });
        }
        _ => {
            tasks.sort_by(|a, b| {
                let ca = a.get("created_at").and_then(|v| v.as_i64()).unwrap_or(0);
                let cb = b.get("created_at").and_then(|v| v.as_i64()).unwrap_or(0);
                cb.cmp(&ca)
            });
        }
    }
}

fn is_descendant_of_project(
    task: &Value,
    project_id: &str,
    id_map: &HashMap<String, &Value>,
) -> bool {
    let mut cur = task.get("parent_id").and_then(|p| p.as_str());
    while let Some(pid) = cur {
        if pid == project_id {
            return true;
        }
        cur = id_map
            .get(pid)
            .and_then(|t| t.get("parent_id"))
            .and_then(|p| p.as_str());
    }
    false
}

fn project_descendant_stats(project_id: &str, all: &[Value]) -> (usize, usize) {
    let id_map: HashMap<String, &Value> = all
        .iter()
        .filter_map(|t| {
            t.get("id")
                .and_then(|x| x.as_str())
                .map(|id| (id.to_string(), t))
        })
        .collect();
    let mut total = 0usize;
    let mut completed = 0usize;
    for t in all {
        let id = match t.get("id").and_then(|x| x.as_str()) {
            Some(s) => s,
            None => continue,
        };
        if id == project_id {
            continue;
        }
        if is_descendant_of_project(t, project_id, &id_map) {
            total += 1;
            if t.get("status").and_then(|s| s.as_str()) == Some("completed") {
                completed += 1;
            }
        }
    }
    (total, completed)
}

async fn tool_list_projects(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    let tasks = load_all_tasks(state, user_id).await?;
    let tasks = filter_tasks_acl(tasks, &acl);
    let primary_role_filter = args.get("primary_role").and_then(|v| v.as_str());
    let role_ids_filter: Vec<String> = args
        .get("role_ids")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|value| value.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let mut projects: Vec<Value> = Vec::new();
    for t in &tasks {
        if t.get("task_type").and_then(|x| x.as_str()) != Some("project") {
            continue;
        }
        if let Some(rid) = primary_role_filter {
            if task_primary_role(t).as_deref() != Some(rid) {
                continue;
            }
        }
        if !role_ids_filter.is_empty()
            && !task_role_ids(t)
                .iter()
                .any(|role_id| role_ids_filter.contains(role_id))
        {
            continue;
        }
        let status = t.get("status").and_then(|s| s.as_str()).unwrap_or("");
        if status == "completed" || status == "archived" {
            continue;
        }
        let id = t.get("id").and_then(|x| x.as_str()).unwrap_or("");
        let (desc_total, desc_done) = project_descendant_stats(id, &tasks);
        projects.push(json!({
            "id": id,
            "title": t.get("title"),
            "status": status,
            "role_ids": t.get("role_ids").cloned().unwrap_or_else(|| json!([])),
            "primary_role": t.get("primary_role").cloned().unwrap_or(Value::Null),
            "descendants_total": desc_total,
            "descendants_completed": desc_done,
        }));
    }
    let n = projects.len();
    Ok(json!({ "projects": projects, "count": n }))
}

async fn tool_get_project_progress(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let project_id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;
    let acl = get_role_acl(state, user_id).await;
    let p = data_partition(state, user_id);
    let v = task_stream_facade::get_task(state.db.as_ref(), &p, project_id)
        .await?
        .ok_or_else(|| format!("Task not found: {}", project_id))?;
    let v = normalize_task_for_mcp(v);
    if !task_matches_acl(&acl, &v) {
        return Err("Task not found or access denied".into());
    }
    if v.get("task_type").and_then(|x| x.as_str()) != Some("project") {
        return Err("task_type is not project".into());
    }
    let tasks = load_all_tasks(state, user_id).await?;
    let tasks = filter_tasks_acl(tasks, &acl);
    let (desc_total, desc_done) = project_descendant_stats(project_id, &tasks);
    let pct = if desc_total > 0 {
        (desc_done as f64 / desc_total as f64) * 100.0
    } else {
        0.0
    };
    Ok(json!({
        "id": project_id,
        "title": v.get("title"),
        "descendants_total": desc_total,
        "descendants_completed": desc_done,
        "percent_done": pct,
    }))
}

async fn tool_list_tasks(state: &AppState, user_id: &str, args: &Value) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    let mut tasks = load_all_tasks(state, user_id).await?;
    tasks = filter_tasks_acl(tasks, &acl);

    if let Some(primary_role) = args.get("primary_role").and_then(|v| v.as_str()) {
        tasks.retain(|t| task_primary_role(t).as_deref() == Some(primary_role));
    }
    if let Some(arr) = args.get("role_ids").and_then(|v| v.as_array()) {
        let wanted: Vec<String> = arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();
        if !wanted.is_empty() {
            tasks.retain(|t| {
                let roles = task_role_ids(t);
                roles.iter().any(|role_id| wanted.contains(role_id))
            });
        }
    }
    if let Some(status) = args.get("status").and_then(|v| v.as_str()) {
        tasks.retain(|t| t.get("status").and_then(|s| s.as_str()) == Some(status));
    }
    if let Some(pid) = args
        .get("parent_id")
        .or_else(|| args.get("parent"))
        .and_then(|v| v.as_str())
    {
        tasks.retain(|t| t.get("parent_id").and_then(|p| p.as_str()) == Some(pid));
    }
    if let Some(arr) = args.get("tags").and_then(|v| v.as_array()) {
        let wanted: Vec<String> = arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();
        if !wanted.is_empty() {
            tasks.retain(|t| task_tags_match(t, &wanted));
        }
    }

    let sort = args
        .get("sort")
        .and_then(|v| v.as_str())
        .unwrap_or("created");
    sort_tasks_list(&mut tasks, sort);

    let total = tasks.len();
    let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(20)
        .clamp(1, 50) as usize;
    let end = (offset + limit).min(total);
    let page: Vec<Value> = if offset < total {
        tasks[offset..end].to_vec()
    } else {
        vec![]
    };

    let mut out = page;
    for task in &mut out {
        task.as_object_mut().map(|obj| obj.remove("body"));
    }

    Ok(json!({
        "tasks": out,
        "count": out.len(),
        "total": total,
        "has_more": offset + out.len() < total,
    }))
}

async fn tool_get_task(state: &AppState, user_id: &str, args: &Value) -> Result<Value, String> {
    let task_id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;

    let acl = get_role_acl(state, user_id).await;
    let p = data_partition(state, user_id);
    let task = task_stream_facade::get_task(state.db.as_ref(), &p, task_id)
        .await?
        .ok_or_else(|| format!("Task not found: {}", task_id))?;
    if !task_matches_acl(&acl, &task) {
        return Err("Task not found or access denied".into());
    }
    let mut t = normalize_task_for_mcp(task);
    let all_tasks = filter_tasks_acl(load_all_tasks(state, user_id).await?, &acl);

    if let Some(ids) = t.get("subtask_ids").and_then(|x| x.as_array()) {
        let mut subtasks = Vec::new();
        for sid in ids.iter().filter_map(|value| value.as_str()) {
            if let Some(st) = all_tasks.iter().find(|task| task["id"] == sid) {
                subtasks.push(json!({
                    "id": st.get("id"),
                    "title": st.get("title"),
                    "status": st.get("status"),
                }));
            }
        }
        t.as_object_mut()
            .map(|o| o.insert("subtasks".into(), json!(subtasks)));
    }

    let parent_id_opt = t
        .get("parent_id")
        .and_then(|x| x.as_str())
        .map(String::from);
    if let Some(pid) = parent_id_opt {
        if let Some(parent) = all_tasks.iter().find(|task| task["id"] == pid) {
            t.as_object_mut().map(|o| {
                o.insert(
                    "parent".into(),
                    json!({
                        "id": pid,
                        "title": parent.get("title"),
                    }),
                )
            });
        }
    }

    Ok(t)
}

async fn tool_create_task(state: &AppState, user_id: &str, args: &Value) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    if args.get("role").is_some()
        || args.get("role_id").is_some()
        || args.get("source_stream_id").is_some()
    {
        return Err(
            "Legacy task fields `role`, `role_id`, and `source_stream_id` are not accepted".into(),
        );
    }
    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: title".to_string())?;

    let mut role_ids: Vec<String> = args
        .get("role_ids")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|value| value.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    if role_ids.is_empty() {
        if let Some(primary_role) = args.get("primary_role").and_then(|v| v.as_str()) {
            role_ids.push(primary_role.to_string());
        }
    }
    if !role_ids_allowed_for_write(&acl, &role_ids) {
        return Err("One or more role_ids are not allowed by MCP role ACL".into());
    }

    let id = generate_task_id();
    let now_ms = Utc::now().timestamp_millis();
    let ddl_ms = args
        .get("ddl")
        .and_then(|v| v.as_str())
        .and_then(parse_iso_to_ms);
    let ddl_type = args.get("ddl_type").and_then(|v| v.as_str());
    let planned_ms = args
        .get("planned_at")
        .and_then(|v| v.as_str())
        .and_then(parse_iso_to_ms);
    let body = args.get("body").and_then(|v| v.as_str()).unwrap_or("");
    let tags: Vec<String> = args
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let parent = args
        .get("parent_id")
        .or_else(|| args.get("parent"))
        .and_then(|v| v.as_str());
    let task_type_str: Option<&str> = args
        .get("task_type")
        .and_then(|v| v.as_str())
        .filter(|s| *s == "project" || *s == "task");

    let task = json!({
        "id": id,
        "title": title,
        "title_customized": 1,
        "description": null,
        "status": "inbox",
        "body": body,
        "created_at": now_ms,
        "updated_at": now_ms,
        "completed_at": null,
        "ddl": ddl_ms,
        "ddl_type": ddl_type,
        "planned_at": planned_ms,
        "role_ids": role_ids,
        "primary_role": args.get("primary_role").cloned().unwrap_or(Value::Null),
        "parent_id": parent,
        "priority": null,
        "promoted": null,
        "phase": null,
        "kanban_column": null,
        "task_type": task_type_str.unwrap_or("task"),
        "tags": tags,
        "subtask_ids": [],
        "resources": [],
        "reminders": [],
        "submissions": [],
        "postponements": [],
        "status_history": [],
        "progress_logs": [],
    });

    let p = data_partition(state, user_id);
    let created = task_stream_facade::put_task(state.db.as_ref(), &p, &id, &task).await?;
    Ok(normalize_task_for_mcp(created))
}

async fn tool_update_task(state: &AppState, user_id: &str, args: &Value) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    if args.get("role").is_some()
        || args.get("role_id").is_some()
        || args.get("source_stream_id").is_some()
    {
        return Err(
            "Legacy task fields `role`, `role_id`, and `source_stream_id` are not accepted".into(),
        );
    }
    let task_id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;

    let p = data_partition(state, user_id);
    let existing = task_stream_facade::get_task(state.db.as_ref(), &p, task_id)
        .await?
        .ok_or_else(|| format!("Task not found: {}", task_id))?;
    if !task_matches_acl(&acl, &existing) {
        return Err("Task not found or access denied".into());
    }

    let now_ms = Utc::now().timestamp_millis();
    let mut patch = json!({});
    let obj = patch.as_object_mut().ok_or("Invalid task patch")?;

    if let Some(title) = args.get("title").and_then(|v| v.as_str()) {
        obj.insert("title".into(), json!(title));
    }
    if let Some(body) = args.get("body").and_then(|v| v.as_str()) {
        obj.insert("body".into(), json!(body));
    }
    if let Some(pa) = args.get("planned_at").and_then(|v| v.as_str()) {
        if let Some(ms) = parse_iso_to_ms(pa) {
            obj.insert("planned_at".into(), json!(ms));
        }
    }
    if let Some(status) = args.get("status").and_then(|v| v.as_str()) {
        obj.insert("status".into(), json!(status));
        if status == "completed" {
            obj.insert("completed_at".into(), json!(now_ms));
        }
    }
    if let Some(ddl) = args.get("ddl").and_then(|v| v.as_str()) {
        if let Some(ms) = parse_iso_to_ms(ddl) {
            obj.insert("ddl".into(), json!(ms));
        }
    }
    if let Some(ddl_type) = args.get("ddl_type").and_then(|v| v.as_str()) {
        obj.insert("ddl_type".into(), json!(ddl_type));
    }
    if args.get("primary_role").is_some() && args.get("role_ids").is_none() {
        return Err("`primary_role` must be supplied together with `role_ids`".into());
    }
    if let Some(role_ids) = args.get("role_ids").and_then(|v| v.as_array()) {
        let role_ids: Vec<String> = role_ids
            .iter()
            .filter_map(|value| value.as_str().map(String::from))
            .collect();
        if !role_ids_allowed_for_write(&acl, &role_ids) {
            return Err("One or more role_ids are not allowed by MCP role ACL".into());
        }
        obj.insert("role_ids".into(), json!(role_ids));
        if let Some(primary_role) = args.get("primary_role") {
            obj.insert("primary_role".into(), primary_role.clone());
        }
    }
    if let Some(tags) = args.get("tags").and_then(|v| v.as_array()) {
        let tag_strs: Vec<String> = tags
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();
        obj.insert("tags".into(), json!(tag_strs));
    }
    if let Some(tt) = args.get("task_type").and_then(|v| v.as_str()) {
        if tt == "project" || tt == "task" {
            obj.insert("task_type".into(), json!(tt));
        }
    }

    if let Some(note_text) = args.get("note").and_then(|v| v.as_str()) {
        let status = args.get("status").and_then(|v| v.as_str()).unwrap_or("");
        let subs_key = if status == "completed" {
            "submissions"
        } else {
            "postponements"
        };
        let mut arr = existing
            .get(subs_key)
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default();
        let rec = if status == "completed" {
            json!({
                "timestamp": Utc::now().to_rfc3339(),
                "note": note_text,
                "onTime": true,
            })
        } else {
            json!({
                "timestamp": Utc::now().to_rfc3339(),
                "fromDate": Utc::now().to_rfc3339(),
                "toDate": Utc::now().to_rfc3339(),
                "reason": note_text,
            })
        };
        arr.push(rec);
        obj.insert(subs_key.into(), Value::Array(arr));
    }

    obj.insert("updated_at".into(), json!(now_ms));

    let updated = task_stream_facade::put_task(state.db.as_ref(), &p, task_id, &patch).await?;
    Ok(normalize_task_for_mcp(updated))
}

async fn tool_delete_task(state: &AppState, user_id: &str, args: &Value) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    let task_id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;

    let p = data_partition(state, user_id);
    let task = task_stream_facade::get_task(state.db.as_ref(), &p, task_id)
        .await?
        .ok_or_else(|| format!("Task not found: {}", task_id))?;
    if !task_matches_acl(&acl, &task) {
        return Err("Task not found or access denied".into());
    }

    task_stream_facade::delete_task(state.db.as_ref(), &p, task_id).await?;

    Ok(json!({ "id": task_id, "deleted": true }))
}

async fn tool_get_roles_stats(state: &AppState, user_id: &str) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    let tasks = filter_tasks_acl(load_all_tasks(state, user_id).await?, &acl);

    let raw = state
        .db
        .get_setting(user_id, "roles")
        .await
        .map_err(|e| e.to_string())?;

    let roles_arr: Vec<Value> = match raw {
        Some(data) => {
            let parsed: Value = serde_json::from_str(&data).unwrap_or(json!({ "roles": [] }));
            parsed
                .get("roles")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default()
        }
        None => vec![],
    };

    let mut out: Vec<Value> = Vec::new();
    for r in roles_arr {
        let id = r.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if id.is_empty() {
            continue;
        }
        if let RoleAcl::Restricted(set) = &acl {
            if !set.contains(id) {
                continue;
            }
        }
        let name = r.get("name").cloned().unwrap_or(json!(""));
        let color = r.get("color").cloned();
        let active = tasks
            .iter()
            .filter(|t| {
                let s = t.get("status").and_then(|v| v.as_str()).unwrap_or("");
                task_role_ids(t).iter().any(|role_id| role_id == id)
                    && s != "completed"
                    && s != "cancelled"
                    && s != "archived"
            })
            .count();
        let today_c = tasks
            .iter()
            .filter(|t| {
                t.get("status").and_then(|v| v.as_str()) == Some("today")
                    && task_role_ids(t).iter().any(|role_id| role_id == id)
            })
            .count();
        let overdue_c = tasks
            .iter()
            .filter(|t| {
                let s = t.get("status").and_then(|v| v.as_str()).unwrap_or("");
                if s == "completed" || s == "cancelled" || s == "archived" {
                    return false;
                }
                task_role_ids(t).iter().any(|role_id| role_id == id)
                    && t.get("ddl")
                        .and_then(|d| d.as_str())
                        .and_then(days_overdue)
                        .is_some()
            })
            .count();
        let mut row = json!({
            "id": id,
            "name": name,
            "active_count": active,
            "today_count": today_c,
            "overdue_count": overdue_c,
        });
        if let Some(c) = color {
            row.as_object_mut().map(|o| o.insert("color".into(), c));
        }
        out.push(row);
    }

    Ok(json!({ "roles": out }))
}

async fn tool_list_roles(state: &AppState, user_id: &str) -> Result<Value, String> {
    tool_get_roles_stats(state, user_id).await
}

async fn tool_add_stream_entry(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    let content = args
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: content".to_string())?;
    if args.get("role").is_some() {
        return Err("Legacy stream field `role` is not accepted; use `role_id`".into());
    }
    let role = args.get("role_id").and_then(|v| v.as_str());
    if !role_allowed_for_write(&acl, role) {
        return Err("Role not allowed by MCP role ACL".into());
    }

    let date_key = today_date_key();
    let id = format!("se-{}", Uuid::new_v4());
    let ts = Utc::now().timestamp_millis();

    let entry = json!({
        "id": id,
        "content": content,
        "entry_type": args.get("entry_type").cloned().unwrap_or_else(|| json!("spark")),
        "timestamp": ts,
        "date_key": date_key,
        "role_id": role,
        "tags": args.get("tags").cloned().unwrap_or_else(|| json!([])),
        "attachments": [],
    });

    let p = data_partition(state, user_id);
    task_stream_facade::put_stream_entry(state.db.as_ref(), &p, &id, &entry).await
}

async fn tool_list_stream(state: &AppState, user_id: &str, args: &Value) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    let days = args.get("days").and_then(|v| v.as_u64()).unwrap_or(7) as i32;

    let p = data_partition(state, user_id);
    let rows = state
        .db
        .list_stream_recent_json(&p, days)
        .await
        .map_err(|e| e.to_string())?;

    let mut filtered =
        task_stream_facade::list_stream_from_rows(state.db.as_ref(), &p, rows).await?;
    filtered.retain(|entry| stream_matches_acl(&acl, entry));
    let role_f = args.get("role_id").and_then(|v| v.as_str());
    let type_f = args
        .get("entry_type")
        .or_else(|| args.get("type"))
        .and_then(|v| v.as_str());

    if let Some(rid) = role_f {
        filtered.retain(|entry| entry.get("role_id").and_then(|x| x.as_str()) == Some(rid));
    }
    if let Some(et) = type_f {
        filtered.retain(|entry| entry.get("entry_type").and_then(|x| x.as_str()) == Some(et));
    }

    filtered.sort_by(|a, b| {
        let ta = a.get("timestamp").and_then(|x| x.as_i64()).unwrap_or(0);
        let tb = b.get("timestamp").and_then(|x| x.as_i64()).unwrap_or(0);
        tb.cmp(&ta)
    });

    let total = filtered.len();
    let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(20)
        .clamp(1, 50) as usize;
    let end = (offset + limit).min(total);
    let page: Vec<Value> = if offset < total {
        filtered[offset..end].to_vec()
    } else {
        vec![]
    };

    Ok(json!({
        "entries": page,
        "count": page.len(),
        "total": total,
        "has_more": offset + page.len() < total,
    }))
}

fn task_text_matches(task: &Value, query_lower: &str) -> bool {
    let title = task
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();
    let body = task
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_lowercase();
    title.contains(query_lower) || body.contains(query_lower)
}

async fn tool_search(state: &AppState, user_id: &str, args: &Value) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: query".to_string())?;
    let scope = args.get("scope").and_then(|v| v.as_str()).unwrap_or("all");
    let query_lower = query.to_lowercase();
    let max_n = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(10)
        .clamp(1, 100) as usize;

    let mut results = Vec::new();
    let p = data_partition(state, user_id);

    if scope == "all" || scope == "tasks" {
        let tasks = filter_tasks_acl(load_all_tasks(state, user_id).await?, &acl);
        for task in tasks {
            if results.len() >= max_n {
                break;
            }
            if !task_text_matches(&task, &query_lower) {
                continue;
            }
            results.push(json!({
                "type": "task",
                "id": task.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                "title": task.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                "status": task.get("status").and_then(|v| v.as_str()).unwrap_or(""),
                "primary_role": task.get("primary_role").cloned().unwrap_or(Value::Null),
            }));
        }
    }

    if (scope == "all" || scope == "stream") && results.len() < max_n {
        let remaining = max_n - results.len();
        let stream_rows = state
            .db
            .search_stream_json(&p, query, remaining as i64)
            .await
            .unwrap_or_default();
        let entries =
            task_stream_facade::list_stream_from_rows(state.db.as_ref(), &p, stream_rows).await?;
        for v in entries {
            if results.len() >= max_n {
                break;
            }
            if !stream_matches_acl(&acl, &v) {
                continue;
            }
            let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("");
            let date_key = v.get("date_key").and_then(|x| x.as_str()).unwrap_or("");
            let content = v.get("content").and_then(|x| x.as_str()).unwrap_or("");
            results.push(json!({
                "type": "stream",
                "id": id,
                "date": date_key,
                "content": content,
            }));
        }
    }

    Ok(json!({ "results": results, "count": results.len(), "query": query }))
}

async fn tool_update_stream_entry(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    if args.get("role").is_some() {
        return Err("Legacy stream field `role` is not accepted; use `role_id`".into());
    }
    let id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;
    let p = data_partition(state, user_id);
    let rows = state
        .db
        .list_all_stream_json(&p)
        .await
        .map_err(|e| e.to_string())?;
    let entry = task_stream_facade::list_stream_from_rows(state.db.as_ref(), &p, rows)
        .await?
        .into_iter()
        .find(|entry| entry.get("id").and_then(|value| value.as_str()) == Some(id))
        .ok_or_else(|| format!("Stream entry not found: {}", id))?;
    if !stream_matches_acl(&acl, &entry) {
        return Err("Stream entry not found or access denied".into());
    }
    let mut patch = json!({});
    let obj = patch.as_object_mut().ok_or("Invalid entry patch")?;
    if let Some(c) = args.get("content").and_then(|v| v.as_str()) {
        obj.insert("content".into(), json!(c));
    }
    if let Some(r) = args.get("role_id").and_then(|v| v.as_str()) {
        if !role_allowed_for_write(&acl, Some(r)) {
            return Err("Role not allowed by MCP role ACL".into());
        }
        obj.insert("role_id".into(), json!(r));
    }
    if let Some(et) = args.get("entry_type").and_then(|v| v.as_str()) {
        obj.insert("entry_type".into(), json!(et));
    }
    if let Some(tags) = args.get("tags").and_then(|v| v.as_array()) {
        let tag_strs: Vec<String> = tags
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();
        obj.insert("tags".into(), json!(tag_strs));
    }
    obj.insert("updated_at".into(), json!(Utc::now().timestamp_millis()));
    task_stream_facade::put_stream_entry(state.db.as_ref(), &p, id, &patch).await
}

async fn tool_manage_role(state: &AppState, user_id: &str, args: &Value) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    let action = args
        .get("action")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: action".to_string())?;

    let raw_default =
        r#"{"roles":[],"settings":{"maxRoles":8,"showCounts":false,"showLandingCard":true}}"#;
    let raw = state
        .db
        .get_setting(user_id, "roles")
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| raw_default.to_string());

    let mut parsed: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let roles_arr = parsed
        .get_mut("roles")
        .and_then(|v| v.as_array_mut())
        .ok_or_else(|| "Invalid roles data".to_string())?;

    match action {
        "create" => {
            let name = args
                .get("name")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Missing name for create".to_string())?;
            let max_order = roles_arr
                .iter()
                .filter_map(|r| r.get("order").and_then(|v| v.as_i64()))
                .max()
                .unwrap_or(-1);
            let id = format!("role-{}", Uuid::new_v4());
            let mut new_role = json!({
                "id": id,
                "name": name,
                "order": max_order + 1,
                "createdAt": Utc::now().to_rfc3339(),
            });
            if let Some(c) = args.get("color").and_then(|v| v.as_str()) {
                new_role
                    .as_object_mut()
                    .map(|o| o.insert("color".into(), json!(c)));
            }
            if let Some(ic) = args.get("icon").and_then(|v| v.as_str()) {
                new_role
                    .as_object_mut()
                    .map(|o| o.insert("icon".into(), json!(ic)));
            }
            roles_arr.push(new_role.clone());
            state
                .db
                .put_setting(
                    user_id,
                    "roles",
                    &serde_json::to_string(&parsed).map_err(|e| e.to_string())?,
                )
                .await
                .map_err(|e| e.to_string())?;
            Ok(json!({ "id": id, "role": new_role }))
        }
        "update" => {
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Missing id for update".to_string())?;
            if let RoleAcl::Restricted(set) = &acl {
                if !set.contains(id) {
                    return Err("Role not allowed by MCP role ACL".into());
                }
            }
            let mut hit = false;
            for r in roles_arr.iter_mut() {
                if r.get("id").and_then(|v| v.as_str()) != Some(id) {
                    continue;
                }
                hit = true;
                if let Some(n) = args.get("name").and_then(|v| v.as_str()) {
                    r.as_object_mut().map(|o| o.insert("name".into(), json!(n)));
                }
                if let Some(c) = args.get("color").and_then(|v| v.as_str()) {
                    r.as_object_mut()
                        .map(|o| o.insert("color".into(), json!(c)));
                }
                if let Some(ic) = args.get("icon").and_then(|v| v.as_str()) {
                    r.as_object_mut()
                        .map(|o| o.insert("icon".into(), json!(ic)));
                }
                break;
            }
            if !hit {
                return Err(format!("Role not found: {}", id));
            }
            state
                .db
                .put_setting(
                    user_id,
                    "roles",
                    &serde_json::to_string(&parsed).map_err(|e| e.to_string())?,
                )
                .await
                .map_err(|e| e.to_string())?;
            Ok(json!({ "id": id, "updated": true }))
        }
        "delete" => {
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Missing id for delete".to_string())?;
            if let RoleAcl::Restricted(set) = &acl {
                if !set.contains(id) {
                    return Err("Role not allowed by MCP role ACL".into());
                }
            }
            let before = roles_arr.len();
            roles_arr.retain(|r| r.get("id").and_then(|v| v.as_str()) != Some(id));
            if roles_arr.len() == before {
                return Err(format!("Role not found: {}", id));
            }
            state
                .db
                .put_setting(
                    user_id,
                    "roles",
                    &serde_json::to_string(&parsed).map_err(|e| e.to_string())?,
                )
                .await
                .map_err(|e| e.to_string())?;
            Ok(json!({ "id": id, "deleted": true }))
        }
        _ => Err(format!("Unknown action: {}", action)),
    }
}

async fn tool_list_work_threads(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let limit = args
        .get("limit")
        .and_then(|value| value.as_u64())
        .unwrap_or(50)
        .clamp(1, 200) as usize;
    let threads = work_thread_facade::list_threads(state.db.as_ref(), user_id, limit).await?;
    Ok(json!({ "threads": threads, "count": threads.len() }))
}

async fn tool_get_work_thread(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let id = args
        .get("id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;
    let Some(thread) = work_thread_facade::get_thread(state.db.as_ref(), user_id, id).await? else {
        return Err(format!("Thread not found: {}", id));
    };
    let include_events = args
        .get("include_events")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    if !include_events {
        return Ok(thread);
    }
    let event_limit = args
        .get("event_limit")
        .and_then(|value| value.as_u64())
        .unwrap_or(30)
        .clamp(1, 300) as usize;
    let events =
        work_thread_facade::list_events(state.db.as_ref(), user_id, id, event_limit).await?;
    let mut enriched = thread;
    if let Some(obj) = enriched.as_object_mut() {
        obj.insert("events".into(), Value::Array(events));
    }
    Ok(enriched)
}

async fn tool_create_work_thread(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    work_thread_facade::create_thread(state.db.as_ref(), user_id, args).await
}

async fn tool_update_work_thread(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let id = args
        .get("id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;
    let patch = args
        .get("patch")
        .ok_or_else(|| "Missing required parameter: patch".to_string())?;
    work_thread_facade::update_thread(state.db.as_ref(), user_id, id, patch).await
}

async fn tool_set_work_thread_status(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let id = args
        .get("id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;
    let status = args
        .get("status")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Missing required parameter: status".to_string())?;
    work_thread_facade::set_thread_status(state.db.as_ref(), user_id, id, status).await
}

async fn tool_checkpoint_work_thread(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let id = args
        .get("id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;
    let title = args.get("title").and_then(|value| value.as_str());
    work_thread_facade::checkpoint_thread(state.db.as_ref(), user_id, id, title).await
}

async fn tool_append_work_thread_event(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let id = args
        .get("id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;
    work_thread_facade::append_event(state.db.as_ref(), user_id, id, args).await
}

async fn tool_delete_work_thread(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let id = args
        .get("id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;
    let deleted = work_thread_facade::delete_thread(state.db.as_ref(), user_id, id).await?;
    if !deleted {
        return Err(format!("Thread not found: {}", id));
    }
    Ok(json!({ "id": id, "deleted": true }))
}

// ── Resource Implementations ────────────────────────────────────

async fn resource_active_tasks(state: &AppState, user_id: &str) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    let tasks = filter_tasks_acl(load_all_tasks(state, user_id).await?, &acl);
    let active: Vec<&Value> = tasks
        .iter()
        .filter(|t| {
            let status = t.get("status").and_then(|s| s.as_str()).unwrap_or("");
            status != "completed" && status != "cancelled"
        })
        .collect();

    Ok(json!({ "active_tasks": active, "count": active.len() }))
}

async fn resource_today_tasks(state: &AppState, user_id: &str) -> Result<Value, String> {
    let acl = get_role_acl(state, user_id).await;
    let tasks = filter_tasks_acl(load_all_tasks(state, user_id).await?, &acl);
    let today = today_date_key();
    let due_today: Vec<&Value> = tasks
        .iter()
        .filter(|t| {
            if let Some(ddl) = t.get("ddl").and_then(|d| d.as_str()) {
                ddl.starts_with(&today)
            } else {
                false
            }
        })
        .collect();

    Ok(json!({ "tasks_due_today": due_today, "count": due_today.len(), "date": today }))
}
