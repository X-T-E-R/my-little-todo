use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

use chrono::{TimeZone, Utc};
use uuid::Uuid;

use crate::config::AuthMode;
use crate::AppState;

fn data_partition(state: &AppState, auth_user_id: &str) -> String {
    match state.config.auth_mode {
        AuthMode::Multi => auth_user_id.to_string(),
        AuthMode::Single | AuthMode::None => String::new(),
    }
}

fn normalize_task_for_mcp(mut v: Value) -> Value {
    if let Some(obj) = v.as_object_mut() {
        if let Some(rid) = obj.remove("role_id") {
            obj.insert("role".into(), rid);
        }
        if let Some(ddl) = obj.get("ddl").cloned() {
            if !ddl.is_null() {
                if let Some(ms) = ddl.as_i64() {
                    obj.insert("ddl".into(), json!(ms_to_iso_z(ms)));
                } else if let Some(ms) = ddl.as_f64() {
                    obj.insert("ddl".into(), json!(ms_to_iso_z(ms as i64)));
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
        .map(|d| {
            d.and_hms_opt(0, 0, 0)
                .unwrap()
                .and_utc()
                .timestamp_millis()
        })
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
    let now = now_iso();
    let ts = now.replace(['-', ':', '.', 'T', 'Z'], "");
    let short = &ts[..std::cmp::min(14, ts.len())];
    format!("task-{}", short)
}

// ── MCP Handler ─────────────────────────────────────────────────

pub async fn handle_mcp(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(req): Json<JsonRpcRequest>,
) -> (StatusCode, Json<JsonRpcResponse>) {
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
            "description": "获取全局概览：各状态任务计数、紧急任务（3天内DDL）、角色列表、日程时段、今日流记录数。这是了解用户当前状况的首选工具。",
            "inputSchema": { "type": "object", "properties": {} },
        }),
        json!({
            "name": "list_tasks",
            "description": "列出任务，可按状态和角色筛选。返回紧凑列表（不含正文），每条任务附带 role_name。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "status": { "type": "string", "enum": ["inbox", "active", "today", "completed", "archived", "cancelled"], "description": "按状态筛选" },
                    "role": { "type": "string", "description": "按角色ID筛选" },
                },
            },
        }),
        json!({
            "name": "get_task",
            "description": "获取单个任务的完整信息，含正文、提交记录、延期记录。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "任务ID" },
                },
                "required": ["id"],
            },
        }),
        json!({
            "name": "create_task",
            "description": "创建新任务，默认 status=inbox。ddl_type: hard=外部硬截止不可改, commitment=自我承诺改需理由, soft=建议性可随意改。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "任务标题" },
                    "ddl": { "type": "string", "description": "截止时间 ISO 8601" },
                    "ddl_type": { "type": "string", "enum": ["hard", "commitment", "soft"] },
                    "role": { "type": "string", "description": "角色ID" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "parent": { "type": "string", "description": "父任务ID（创建子任务时使用）" },
                },
                "required": ["title"],
            },
        }),
        json!({
            "name": "update_task",
            "description": "更新任务属性或状态。设 status=completed 完成任务，status=cancelled 取消任务。可附 note 说明变更原因。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "任务ID" },
                    "title": { "type": "string" },
                    "status": { "type": "string", "enum": ["inbox", "active", "today", "completed", "archived", "cancelled"] },
                    "ddl": { "type": "string", "description": "新截止时间 ISO 8601" },
                    "ddl_type": { "type": "string", "enum": ["hard", "commitment", "soft"] },
                    "role": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "note": { "type": "string", "description": "变更备注（如完成说明、延期理由）" },
                },
                "required": ["id"],
            },
        }),
        json!({
            "name": "delete_task",
            "description": "删除一个任务。",
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
            "description": "添加一条流记录，用于快速捕获想法、笔记、灵感、进展。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "content": { "type": "string", "description": "内容（支持 markdown）" },
                    "role": { "type": "string", "description": "关联角色ID" },
                },
                "required": ["content"],
            },
        }),
        json!({
            "name": "list_stream",
            "description": "列出最近的流记录。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "days": { "type": "integer", "description": "回溯天数，默认7" },
                },
            },
        }),
        json!({
            "name": "search",
            "description": "全文搜索任务和流记录。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "搜索关键词" },
                    "scope": { "type": "string", "enum": ["all", "tasks", "stream"], "description": "搜索范围，默认 all" },
                },
                "required": ["query"],
            },
        }),
    ]
}

async fn handle_tools_list(state: &AppState, user_id: &str, id: Option<Value>) -> JsonRpcResponse {
    let disabled = get_disabled_tools(state, user_id).await;
    let tools: Vec<Value> = all_tool_definitions()
        .into_iter()
        .filter(|t| {
            let name = t.get("name").and_then(|n| n.as_str()).unwrap_or("");
            !disabled.contains(name)
        })
        .collect();
    ok_response(id, json!({ "tools": tools }))
}

async fn handle_tools_call(
    state: &AppState,
    user_id: &str,
    id: Option<Value>,
    params: &Value,
) -> JsonRpcResponse {
    let tool_name = params
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let args = params.get("arguments").cloned().unwrap_or(json!({}));

    let disabled = get_disabled_tools(state, user_id).await;
    if disabled.contains(tool_name) {
        return err_response(
            id,
            -32601,
            &format!("Tool '{}' is disabled by user settings", tool_name),
        );
    }

    let result = match tool_name {
        "get_overview" => tool_overview(state, user_id).await,
        "list_tasks" => tool_list_tasks(state, user_id, &args).await,
        "get_task" => tool_get_task(state, user_id, &args).await,
        "create_task" => tool_create_task(state, user_id, &args).await,
        "update_task" => tool_update_task(state, user_id, &args).await,
        "delete_task" => tool_delete_task(state, user_id, &args).await,
        "add_stream" => tool_add_stream_entry(state, user_id, &args).await,
        "list_stream" => tool_list_stream(state, user_id, &args).await,
        "search" => tool_search(state, user_id, &args).await,
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
    let uri = params
        .get("uri")
        .and_then(|v| v.as_str())
        .unwrap_or("");

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

async fn load_role_map(state: &AppState, user_id: &str) -> HashMap<String, (String, Option<String>)> {
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

fn enrich_task_with_role(task: &mut Value, role_map: &HashMap<String, (String, Option<String>)>) {
    if let Some(role_id) = task.get("role").and_then(|v| v.as_str()) {
        if let Some((name, _)) = role_map.get(role_id) {
            task.as_object_mut()
                .map(|obj| obj.insert("role_name".to_string(), json!(name)));
        }
    }
}

// ── Tool Implementations ────────────────────────────────────────

async fn tool_overview(state: &AppState, user_id: &str) -> Result<Value, String> {
    let tasks = load_all_tasks(state, user_id).await?;
    let role_map = load_role_map(state, user_id).await;
    let today = today_date_key();

    let mut counts: HashMap<String, u32> = HashMap::new();
    let mut urgent = Vec::new();

    for task in &tasks {
        let status = task.get("status").and_then(|s| s.as_str()).unwrap_or("unknown");
        *counts.entry(status.to_string()).or_insert(0) += 1;

        let dominated = status == "completed" || status == "cancelled" || status == "archived";
        if !dominated {
            if let Some(ddl) = task.get("ddl").and_then(|d| d.as_str()) {
                if ddl.len() >= 10 && ddl[..10] <= *today_plus_days(3) {
                    let mut t = json!({
                        "id": task.get("id"),
                        "title": task.get("title"),
                        "ddl": ddl,
                        "ddl_type": task.get("ddl_type"),
                        "status": status,
                    });
                    if let Some(role_id) = task.get("role").and_then(|v| v.as_str()) {
                        t.as_object_mut().map(|o| o.insert("role".into(), json!(role_id)));
                        if let Some((name, _)) = role_map.get(role_id) {
                            t.as_object_mut().map(|o| o.insert("role_name".into(), json!(name)));
                        }
                    }
                    urgent.push(t);
                }
            }
        }
    }

    urgent.sort_by(|a, b| {
        let da = a.get("ddl").and_then(|v| v.as_str()).unwrap_or("9999");
        let db = b.get("ddl").and_then(|v| v.as_str()).unwrap_or("9999");
        da.cmp(db)
    });
    urgent.truncate(5);

    let roles_json: Vec<Value> = role_map
        .iter()
        .map(|(id, (name, color))| {
            let active = tasks.iter().filter(|t| {
                let s = t.get("status").and_then(|v| v.as_str()).unwrap_or("");
                let r = t.get("role").and_then(|v| v.as_str()).unwrap_or("");
                r == id && s != "completed" && s != "cancelled" && s != "archived"
            }).count();
            let mut r = json!({"id": id, "name": name, "active_count": active});
            if let Some(c) = color {
                r.as_object_mut().map(|o| o.insert("color".into(), json!(c)));
            }
            r
        })
        .collect();

    let schedule_raw = state.db.get_setting(user_id, "schedule-blocks")
        .await.map_err(|e| e.to_string())?;
    let schedule: Value = schedule_raw
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(json!([]));

    let p = data_partition(state, user_id);
    let stream_count = state
        .db
        .list_stream_day_json(&p, &today)
        .await
        .map(|rows| rows.len())
        .unwrap_or(0);

    Ok(json!({
        "date": today,
        "counts": counts,
        "urgent": urgent,
        "roles": roles_json,
        "schedule": schedule,
        "stream_today": stream_count,
    }))
}

fn today_plus_days(n: u32) -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() + (n as u64 * 86400);
    let ts = chrono_lite_timestamp(secs as i64);
    ts[..10].to_string()
}

async fn load_all_tasks(state: &AppState, user_id: &str) -> Result<Vec<Value>, String> {
    let p = data_partition(state, user_id);
    let rows = state
        .db
        .list_tasks_json(&p)
        .await
        .map_err(|e| e.to_string())?;
    let mut tasks = Vec::new();
    for raw in rows {
        let v: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        tasks.push(normalize_task_for_mcp(v));
    }
    Ok(tasks)
}

async fn tool_list_tasks(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let mut tasks = load_all_tasks(state, user_id).await?;
    let role_map = load_role_map(state, user_id).await;

    if let Some(role) = args.get("role").and_then(|v| v.as_str()) {
        tasks.retain(|t| t.get("role").and_then(|r| r.as_str()) == Some(role));
    }
    if let Some(status) = args.get("status").and_then(|v| v.as_str()) {
        tasks.retain(|t| t.get("status").and_then(|s| s.as_str()) == Some(status));
    }

    for task in &mut tasks {
        enrich_task_with_role(task, &role_map);
        task.as_object_mut().map(|obj| obj.remove("body"));
    }

    Ok(json!({ "tasks": tasks, "count": tasks.len() }))
}

async fn tool_get_task(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let task_id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;

    let p = data_partition(state, user_id);
    let raw = state
        .db
        .get_task_json(&p, task_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    let v: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(normalize_task_for_mcp(v))
}

async fn tool_create_task(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: title".to_string())?;

    let id = generate_task_id();
    let now_ms = Utc::now().timestamp_millis();
    let ddl_ms = args
        .get("ddl")
        .and_then(|v| v.as_str())
        .and_then(parse_iso_to_ms);
    let ddl_type = args.get("ddl_type").and_then(|v| v.as_str());
    let role = args.get("role").and_then(|v| v.as_str());
    let tags: Vec<String> = args
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let parent = args.get("parent").and_then(|v| v.as_str());
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".into());

    let task = json!({
        "id": id,
        "title": title,
        "description": null,
        "status": "inbox",
        "body": "",
        "created_at": now_ms,
        "updated_at": now_ms,
        "completed_at": null,
        "ddl": ddl_ms,
        "ddl_type": ddl_type,
        "planned_at": null,
        "role_id": role,
        "parent_id": parent,
        "source_stream_id": null,
        "priority": null,
        "promoted": null,
        "phase": null,
        "kanban_column": null,
        "tags": tags_json,
        "subtask_ids": "[]",
        "resources": "[]",
        "reminders": "[]",
        "submissions": "[]",
        "postponements": "[]",
        "status_history": "[]",
        "progress_logs": "[]",
    });

    let p = data_partition(state, user_id);
    state
        .db
        .upsert_task_json(&p, &task.to_string())
        .await
        .map_err(|e| e.to_string())?;

    let mut result = json!({
        "id": id,
        "title": title,
        "status": "inbox",
        "created": ms_to_iso_z(now_ms),
    });
    if let Some(p) = parent {
        result
            .as_object_mut()
            .map(|o| o.insert("parent".into(), json!(p)));
    }
    Ok(result)
}

async fn tool_update_task(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let task_id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;

    let p = data_partition(state, user_id);
    let raw = state
        .db
        .get_task_json(&p, task_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    let mut task: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let obj = task.as_object_mut().ok_or("Invalid task")?;

    let now_ms = Utc::now().timestamp_millis();

    if let Some(title) = args.get("title").and_then(|v| v.as_str()) {
        obj.insert("title".into(), json!(title));
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
    if let Some(role) = args.get("role").and_then(|v| v.as_str()) {
        obj.insert("role_id".into(), json!(role));
    }
    if let Some(tags) = args.get("tags").and_then(|v| v.as_array()) {
        let tag_strs: Vec<String> = tags
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();
        obj.insert(
            "tags".into(),
            json!(serde_json::to_string(&tag_strs).unwrap_or_else(|_| "[]".into())),
        );
    }

    if let Some(note_text) = args.get("note").and_then(|v| v.as_str()) {
        let status = args.get("status").and_then(|v| v.as_str()).unwrap_or("");
        let subs_key = if status == "completed" {
            "submissions"
        } else {
            "postponements"
        };
        let existing = obj
            .get(subs_key)
            .and_then(|s| s.as_str())
            .unwrap_or("[]");
        let mut arr: Vec<Value> = serde_json::from_str(existing).unwrap_or_default();
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
        obj.insert(
            subs_key.into(),
            json!(serde_json::to_string(&arr).unwrap_or_else(|_| "[]".into())),
        );
    }

    obj.insert("updated_at".into(), json!(now_ms));

    state
        .db
        .upsert_task_json(&p, &serde_json::to_string(&task).map_err(|e| e.to_string())?)
        .await
        .map_err(|e| e.to_string())?;

    Ok(json!({ "id": task_id, "updated": true }))
}

async fn tool_delete_task(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let task_id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: id".to_string())?;

    let p = data_partition(state, user_id);
    state
        .db
        .get_task_json(&p, task_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    state
        .db
        .delete_task_row(&p, task_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(json!({ "id": task_id, "deleted": true }))
}

async fn tool_list_roles(state: &AppState, user_id: &str) -> Result<Value, String> {
    let raw = state
        .db
        .get_setting(user_id, "roles")
        .await
        .map_err(|e| e.to_string())?;

    match raw {
        Some(data) => {
            let parsed: Value =
                serde_json::from_str(&data).unwrap_or(json!({ "roles": [] }));
            let roles = parsed.get("roles").cloned().unwrap_or(json!([]));
            Ok(json!({ "roles": roles }))
        }
        None => Ok(json!({ "roles": [] })),
    }
}

async fn tool_add_stream_entry(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let content = args
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: content".to_string())?;
    let role = args.get("role").and_then(|v| v.as_str());

    let date_key = today_date_key();
    let id = Uuid::new_v4().to_string();
    let ts = Utc::now().timestamp_millis();
    let time_part = time_hms_from_ms(ts);

    let entry = json!({
        "id": id,
        "content": content,
        "entry_type": "spark",
        "timestamp": ts,
        "date_key": date_key,
        "role_id": role,
        "tags": "[]",
        "attachments": "[]",
    });

    let p = data_partition(state, user_id);
    state
        .db
        .upsert_stream_entry_json(&p, &entry.to_string())
        .await
        .map_err(|e| e.to_string())?;

    Ok(json!({
        "date": date_key,
        "time": time_part,
        "content": content,
    }))
}

async fn tool_list_stream(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let days = args
        .get("days")
        .and_then(|v| v.as_u64())
        .unwrap_or(7) as i32;

    let p = data_partition(state, user_id);
    let rows = state
        .db
        .list_stream_recent_json(&p, days)
        .await
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for raw in rows {
        let v: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let date_key = v.get("date_key").and_then(|x| x.as_str()).unwrap_or("");
        let ts = v.get("timestamp").and_then(|x| x.as_i64()).unwrap_or(0);
        let text = v.get("content").and_then(|x| x.as_str()).unwrap_or("");
        entries.push(json!({
            "date": date_key,
            "time": time_hms_from_ms(ts),
            "content": text,
        }));
    }

    Ok(json!({ "entries": entries, "count": entries.len() }))
}

async fn tool_search(
    state: &AppState,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing required parameter: query".to_string())?;
    let scope = args.get("scope").and_then(|v| v.as_str()).unwrap_or("all");
    let query_lower = query.to_lowercase();

    let mut results = Vec::new();
    let p = data_partition(state, user_id);

    if scope == "all" || scope == "tasks" {
        let task_rows = state.db.list_tasks_json(&p).await.unwrap_or_default();
        for raw in task_rows {
            if !raw.to_lowercase().contains(&query_lower) {
                continue;
            }
            let task: Value = serde_json::from_str(&raw).unwrap_or(json!({}));
            let t = normalize_task_for_mcp(task);
            results.push(json!({
                "type": "task",
                "id": t.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                "title": t.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                "status": t.get("status").and_then(|v| v.as_str()).unwrap_or(""),
            }));
        }
    }

    if scope == "all" || scope == "stream" {
        let stream_rows = state.db.list_all_stream_json(&p).await.unwrap_or_default();
        for raw in stream_rows {
            if !raw.to_lowercase().contains(&query_lower) {
                continue;
            }
            let v: Value = serde_json::from_str(&raw).unwrap_or(json!({}));
            let date_key = v.get("date_key").and_then(|x| x.as_str()).unwrap_or("");
            let content = v.get("content").and_then(|x| x.as_str()).unwrap_or("");
            results.push(json!({
                "type": "stream",
                "date": date_key,
                "content": content,
            }));
        }
    }

    Ok(json!({ "results": results, "count": results.len(), "query": query }))
}

// ── Resource Implementations ────────────────────────────────────

async fn resource_active_tasks(state: &AppState, user_id: &str) -> Result<Value, String> {
    let tasks = load_all_tasks(state, user_id).await?;
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
    let tasks = load_all_tasks(state, user_id).await?;
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
