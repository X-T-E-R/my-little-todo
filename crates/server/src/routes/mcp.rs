use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::config::AuthMode;
use crate::AppState;

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

// ── Path Resolution ─────────────────────────────────────────────

fn resolve_path(state: &AppState, user_id: &str, path: &str) -> String {
    if state.config.auth_mode == AuthMode::Multi {
        format!("{}/{}", user_id, path)
    } else {
        path.to_string()
    }
}

// ── Simple Frontmatter Parser ───────────────────────────────────

fn parse_frontmatter(content: &str) -> (HashMap<String, String>, String) {
    let mut meta = HashMap::new();
    if !content.starts_with("---") {
        return (meta, content.to_string());
    }
    let rest = &content[3..];
    if let Some(end_idx) = rest.find("\n---\n") {
        let fm_block = &rest[..end_idx];
        let body = &rest[end_idx + 5..];
        for line in fm_block.lines() {
            if let Some(colon) = line.find(':') {
                let key = line[..colon].trim().to_string();
                let val = line[colon + 1..].trim().to_string();
                if !val.is_empty() {
                    meta.insert(key, val);
                }
            }
        }
        (meta, body.to_string())
    } else {
        (meta, content.to_string())
    }
}

fn task_file_to_json(content: &str) -> Value {
    let (meta, body) = parse_frontmatter(content);
    let body_text = body
        .split("\n## ")
        .next()
        .unwrap_or("")
        .trim()
        .to_string();

    json!({
        "id": meta.get("id").cloned().unwrap_or_default(),
        "title": meta.get("title").cloned().unwrap_or_default(),
        "status": meta.get("status").cloned().unwrap_or_default(),
        "created": meta.get("created").cloned(),
        "updated": meta.get("updated").cloned(),
        "completed": meta.get("completed").cloned(),
        "ddl": meta.get("ddl").cloned(),
        "ddl_type": meta.get("ddl_type").cloned(),
        "role": meta.get("role").cloned(),
        "tags": meta.get("tags").map(|t| {
            t.trim_start_matches('[').trim_end_matches(']')
                .split(',').map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
        }).unwrap_or_default(),
        "priority": meta.get("priority").cloned(),
        "parent": meta.get("parent").cloned(),
        "source": meta.get("source").cloned(),
        "body": body_text,
    })
}

fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let naive =
        chrono_lite_timestamp(secs as i64);
    naive
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

fn build_task_markdown(
    id: &str,
    title: &str,
    status: &str,
    now: &str,
    ddl: Option<&str>,
    ddl_type: Option<&str>,
    role: Option<&str>,
    tags: &[String],
) -> String {
    let mut lines = vec![
        "---".to_string(),
        format!("id: {}", id),
        format!("title: {}", title),
        format!("status: {}", status),
        format!("created: {}", now),
        format!("updated: {}", now),
    ];
    if let Some(d) = ddl {
        lines.push(format!("ddl: {}", d));
    }
    if let Some(dt) = ddl_type {
        lines.push(format!("ddl_type: {}", dt));
    }
    if let Some(r) = role {
        lines.push(format!("role: {}", r));
    }
    if !tags.is_empty() {
        lines.push(format!("tags: [{}]", tags.join(", ")));
    }
    lines.push("---".to_string());
    lines.push(String::new());
    lines.push(String::new());
    lines.push("## Resources".to_string());
    lines.push(String::new());
    lines.push("（暂无）".to_string());
    lines.push(String::new());
    lines.push("## Reminders".to_string());
    lines.push(String::new());
    lines.push("（暂无）".to_string());
    lines.push(String::new());
    lines.push("## Submissions".to_string());
    lines.push(String::new());
    lines.push("（暂无）".to_string());
    lines.push(String::new());
    lines.push("## Postponements".to_string());
    lines.push(String::new());
    lines.push("（暂无）".to_string());
    lines.push(String::new());
    lines.join("\n")
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
        "tools/list" => handle_tools_list(req.id),
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

fn handle_tools_list(id: Option<Value>) -> JsonRpcResponse {
    ok_response(
        id,
        json!({
            "tools": [
                {
                    "name": "get_overview",
                    "description": "获取全局概览：各状态任务计数、紧急任务（3天内DDL）、角色列表、日程时段、今日流记录数。这是了解用户当前状况的首选工具。",
                    "inputSchema": { "type": "object", "properties": {} },
                },
                {
                    "name": "list_tasks",
                    "description": "列出任务，可按状态和角色筛选。返回紧凑列表（不含正文），每条任务附带 role_name。",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "status": { "type": "string", "enum": ["inbox", "active", "today", "completed", "archived", "cancelled"], "description": "按状态筛选" },
                            "role": { "type": "string", "description": "按角色ID筛选" },
                        },
                    },
                },
                {
                    "name": "get_task",
                    "description": "获取单个任务的完整信息，含正文、提交记录、延期记录。",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string", "description": "任务ID" },
                        },
                        "required": ["id"],
                    },
                },
                {
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
                },
                {
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
                },
                {
                    "name": "delete_task",
                    "description": "删除一个任务。",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "id": { "type": "string", "description": "任务ID" },
                        },
                        "required": ["id"],
                    },
                },
                {
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
                },
                {
                    "name": "list_stream",
                    "description": "列出最近的流记录。",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "days": { "type": "integer", "description": "回溯天数，默认7" },
                        },
                    },
                },
                {
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
                },
            ]
        }),
    )
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

    let stream_path = resolve_path(state, user_id, &format!("data/stream/{}.md", today));
    let stream_count = if let Ok(Some(content)) = state.db.get_file(&stream_path).await {
        content.lines().filter(|l| l.trim().starts_with("- ")).count()
    } else {
        0
    };

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
    let tasks_dir = resolve_path(state, user_id, "data/tasks");
    let files = state
        .db
        .list_files(&tasks_dir)
        .await
        .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for file in &files {
        let path = format!("{}/{}", tasks_dir, file);
        if let Ok(Some(content)) = state.db.get_file(&path).await {
            tasks.push(task_file_to_json(&content));
        }
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

    let path = resolve_path(state, user_id, &format!("data/tasks/{}.md", task_id));
    let content = state
        .db
        .get_file(&path)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    Ok(task_file_to_json(&content))
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
    let now = now_iso();
    let ddl = args.get("ddl").and_then(|v| v.as_str());
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
    let mut md = build_task_markdown(&id, title, "inbox", &now, ddl, ddl_type, role, &tags);
    if let Some(parent_id) = parent {
        md = md.replacen("---\n\n", &format!("parent: {}\n---\n\n", parent_id), 1);
    }

    let path = resolve_path(state, user_id, &format!("data/tasks/{}.md", id));
    state
        .db
        .put_file(&path, &md)
        .await
        .map_err(|e| e.to_string())?;

    let mut result = json!({ "id": id, "title": title, "status": "inbox", "created": now });
    if let Some(p) = parent {
        result.as_object_mut().map(|o| o.insert("parent".into(), json!(p)));
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

    let path = resolve_path(state, user_id, &format!("data/tasks/{}.md", task_id));
    let content = state
        .db
        .get_file(&path)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    let (mut meta, body) = parse_frontmatter(&content);
    let now = now_iso();

    if let Some(title) = args.get("title").and_then(|v| v.as_str()) {
        meta.insert("title".into(), title.into());
    }
    if let Some(status) = args.get("status").and_then(|v| v.as_str()) {
        meta.insert("status".into(), status.into());
        if status == "completed" {
            meta.insert("completed".into(), now.clone());
        }
    }
    if let Some(ddl) = args.get("ddl").and_then(|v| v.as_str()) {
        meta.insert("ddl".into(), ddl.into());
    }
    if let Some(ddl_type) = args.get("ddl_type").and_then(|v| v.as_str()) {
        meta.insert("ddl_type".into(), ddl_type.into());
    }
    if let Some(role) = args.get("role").and_then(|v| v.as_str()) {
        meta.insert("role".into(), role.into());
    }
    if let Some(tags) = args.get("tags").and_then(|v| v.as_array()) {
        let tag_strs: Vec<String> = tags
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();
        meta.insert("tags".into(), format!("[{}]", tag_strs.join(", ")));
    }
    meta.insert("updated".into(), now.clone());

    let note = args.get("note").and_then(|v| v.as_str());

    let mut fm_lines = vec!["---".to_string()];
    let key_order = [
        "id", "title", "status", "created", "updated", "completed", "ddl", "ddl_type",
        "planned", "role", "tags", "priority", "source", "subtasks", "parent",
    ];
    for key in key_order {
        if let Some(val) = meta.get(key) {
            fm_lines.push(format!("{}: {}", key, val));
        }
    }
    fm_lines.push("---".to_string());

    let mut updated_body = body;
    if let Some(note_text) = note {
        let status = args.get("status").and_then(|v| v.as_str()).unwrap_or("");
        let section = if status == "completed" { "## Submissions" } else { "## Postponements" };
        let record = format!("- {} | {}", &now[..10], note_text);
        if let Some(idx) = updated_body.find(section) {
            let insert_pos = idx + section.len();
            let after = &updated_body[insert_pos..];
            let line_end = after.find('\n').unwrap_or(after.len());
            updated_body = format!(
                "{}{}\n{}{}",
                &updated_body[..insert_pos],
                &after[..line_end],
                record,
                &after[line_end..]
            );
        }
    }

    let new_content = format!("{}\n{}", fm_lines.join("\n"), updated_body);
    state
        .db
        .put_file(&path, &new_content)
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

    let path = resolve_path(state, user_id, &format!("data/tasks/{}.md", task_id));
    state
        .db
        .get_file(&path)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Task not found: {}", task_id))?;

    state
        .db
        .delete_file(&path)
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
    let file_path = resolve_path(
        state,
        user_id,
        &format!("data/stream/{}.md", date_key),
    );

    let existing = state
        .db
        .get_file(&file_path)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    let now = now_iso();
    let time_part = &now[11..19]; // HH:MM:SS

    let mut line = format!("- {} | {}", time_part, content);
    if let Some(r) = role {
        line.push_str(&format!(" @role:{}", r));
    }

    let new_content = if existing.is_empty() {
        format!(
            "---\ndate: {}\nentries: 1\n---\n\n{}\n",
            date_key, line
        )
    } else {
        let (_, body) = parse_frontmatter(&existing);
        let entry_count = body.lines().filter(|l| l.starts_with("- ")).count() + 1;
        format!(
            "---\ndate: {}\nentries: {}\n---\n\n{}\n{}\n",
            date_key,
            entry_count,
            line,
            body.trim()
        )
    };

    state
        .db
        .put_file(&file_path, &new_content)
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
        .unwrap_or(7) as usize;

    let stream_dir = resolve_path(state, user_id, "data/stream");
    let files = state
        .db
        .list_files(&stream_dir)
        .await
        .map_err(|e| e.to_string())?;

    let recent: Vec<&String> = files.iter().take(days).collect();
    let mut entries = Vec::new();

    for file in &recent {
        let date_key = file.replace(".md", "");
        let path = format!("{}/{}", stream_dir, file);
        if let Ok(Some(content)) = state.db.get_file(&path).await {
            let (_, body) = parse_frontmatter(&content);
            for line in body.lines() {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("- ") {
                    if let Some(pipe_idx) = rest.find(" | ") {
                        let time = &rest[..pipe_idx];
                        let text = &rest[pipe_idx + 3..];
                        entries.push(json!({
                            "date": date_key,
                            "time": time,
                            "content": text.trim(),
                        }));
                    }
                }
            }
        }
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

    if scope == "all" || scope == "tasks" {
        let tasks_dir = resolve_path(state, user_id, "data/tasks");
        let task_files = state
            .db
            .list_files(&tasks_dir)
            .await
            .unwrap_or_default();

        for file in &task_files {
            let path = format!("{}/{}", tasks_dir, file);
            if let Ok(Some(content)) = state.db.get_file(&path).await {
                if content.to_lowercase().contains(&query_lower) {
                    let task = task_file_to_json(&content);
                    results.push(json!({
                        "type": "task",
                        "id": task.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                        "title": task.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                        "status": task.get("status").and_then(|v| v.as_str()).unwrap_or(""),
                    }));
                }
            }
        }
    }

    let stream_dir = resolve_path(state, user_id, "data/stream");
    let stream_files = if scope == "all" || scope == "stream" {
        state
            .db
            .list_files(&stream_dir)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    for file in &stream_files {
        let date_key = file.replace(".md", "");
        let path = format!("{}/{}", stream_dir, file);
        if let Ok(Some(content)) = state.db.get_file(&path).await {
            let (_, body) = parse_frontmatter(&content);
            for line in body.lines() {
                if line.to_lowercase().contains(&query_lower) {
                    results.push(json!({
                        "type": "stream",
                        "date": date_key,
                        "content": line.trim(),
                    }));
                }
            }
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
