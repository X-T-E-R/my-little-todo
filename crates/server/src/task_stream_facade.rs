use std::cmp::Ordering;
use std::collections::HashMap;

use chrono::{TimeZone, Utc};
use serde_json::{json, Value};

use crate::providers::DatabaseProvider;

#[derive(Clone, Default)]
pub struct TaskStreamContext {
    pub tasks: Vec<Value>,
    pub tasks_by_id: HashMap<String, Value>,
    pub raw_task_by_canonical_id: HashMap<String, Value>,
    pub raw_task_ids_by_canonical_id: HashMap<String, Vec<String>>,
    pub stream_by_id: HashMap<String, Value>,
    pub task_id_by_stream_id: HashMap<String, String>,
}

pub async fn load_context(
    db: &dyn DatabaseProvider,
    user_id: &str,
) -> Result<TaskStreamContext, String> {
    let raw_task_rows = db
        .list_tasks_json(user_id)
        .await
        .map_err(|e| e.to_string())?;
    let raw_stream_rows = db
        .list_all_stream_json(user_id)
        .await
        .map_err(|e| e.to_string())?;

    let raw_tasks = raw_task_rows
        .into_iter()
        .map(|raw| serde_json::from_str::<Value>(&raw).map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    let raw_streams = raw_stream_rows
        .into_iter()
        .map(|raw| serde_json::from_str::<Value>(&raw).map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;

    let stream_by_id = raw_streams
        .into_iter()
        .filter_map(|stream| {
            let id = stream
                .get("id")
                .and_then(|value| value.as_str())
                .map(|id| id.to_string());
            id.map(|id| (id, stream))
        })
        .collect::<HashMap<_, _>>();

    let canonical_ids = raw_tasks
        .iter()
        .filter_map(|task| {
            raw_task_id(task).map(|raw_id| {
                (
                    raw_id.to_string(),
                    resolve_stream_id(task, &stream_by_id).unwrap_or_else(|| raw_id.to_string()),
                )
            })
        })
        .collect::<HashMap<_, _>>();

    let mut grouped = HashMap::<String, Vec<Value>>::new();
    for task in &raw_tasks {
        let Some(raw_id) = raw_task_id(task) else {
            continue;
        };
        let canonical_id = canonical_ids
            .get(raw_id)
            .cloned()
            .unwrap_or_else(|| raw_id.to_string());
        grouped.entry(canonical_id).or_default().push(task.clone());
    }

    let mut tasks = Vec::new();
    let mut tasks_by_id = HashMap::new();
    let mut raw_task_by_canonical_id = HashMap::new();
    let mut raw_task_ids_by_canonical_id = HashMap::new();
    let mut task_id_by_stream_id = HashMap::new();

    for (canonical_id, mut candidates) in grouped {
        candidates.sort_by(|left, right| compare_task_priority(left, right, &stream_by_id));
        let Some(winner) = candidates.first().cloned() else {
            continue;
        };
        let public = normalize_task(&winner, &canonical_ids, &stream_by_id, &canonical_id);
        raw_task_ids_by_canonical_id.insert(
            canonical_id.clone(),
            candidates
                .iter()
                .filter_map(raw_task_id)
                .map(ToOwned::to_owned)
                .collect(),
        );
        task_id_by_stream_id.insert(canonical_id.clone(), canonical_id.clone());
        tasks_by_id.insert(canonical_id.clone(), public.clone());
        raw_task_by_canonical_id.insert(canonical_id.clone(), winner);
        tasks.push(public);
    }

    tasks.sort_by(|left, right| {
        let left_updated = left.get("updated_at").and_then(|value| value.as_i64()).unwrap_or(0);
        let right_updated = right
            .get("updated_at")
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        right_updated.cmp(&left_updated)
    });

    Ok(TaskStreamContext {
        tasks,
        tasks_by_id,
        raw_task_by_canonical_id,
        raw_task_ids_by_canonical_id,
        stream_by_id,
        task_id_by_stream_id,
    })
}

pub async fn list_tasks(db: &dyn DatabaseProvider, user_id: &str) -> Result<Vec<Value>, String> {
    Ok(load_context(db, user_id).await?.tasks)
}

pub async fn get_task(
    db: &dyn DatabaseProvider,
    user_id: &str,
    id: &str,
) -> Result<Option<Value>, String> {
    Ok(load_context(db, user_id).await?.tasks_by_id.get(id).cloned())
}

pub async fn list_stream_from_rows(
    db: &dyn DatabaseProvider,
    user_id: &str,
    rows: Vec<String>,
) -> Result<Vec<Value>, String> {
    let context = load_context(db, user_id).await?;
    rows.into_iter()
        .map(|raw| {
            let stream = serde_json::from_str::<Value>(&raw).map_err(|e| e.to_string())?;
            Ok(normalize_stream(
                &stream,
                context
                    .task_id_by_stream_id
                    .get(stream_id(&stream).unwrap_or_default())
                    .map(String::as_str),
            ))
        })
        .collect()
}

pub fn validate_public_task_payload(payload: &Value) -> Result<(), String> {
    let Some(obj) = payload.as_object() else {
        return Err("Task payload must be a JSON object".into());
    };
    if obj.contains_key("role") || obj.contains_key("role_id") || obj.contains_key("source_stream_id")
    {
        return Err("Legacy task fields `role`, `role_id`, and `source_stream_id` are not accepted".into());
    }
    if let Some(primary_role) = obj.get("primary_role") {
        if !primary_role.is_null() && primary_role.as_str().is_none() {
            return Err("`primary_role` must be a string or null".into());
        }
    }
    if let Some(role_ids) = obj.get("role_ids") {
        let Some(arr) = role_ids.as_array() else {
            return Err("`role_ids` must be an array of strings".into());
        };
        if arr.iter().any(|value| value.as_str().is_none()) {
            return Err("`role_ids` must contain only strings".into());
        }
        if let Some(primary_role) = obj.get("primary_role").and_then(|value| value.as_str()) {
            let first = arr.first().and_then(|value| value.as_str());
            if first != Some(primary_role) {
                return Err("`primary_role` must equal the first `role_ids` element".into());
            }
        }
    }
    if let Some(tags) = obj.get("tags") {
        validate_array_of_strings(tags, "tags")?;
    }
    if let Some(subtask_ids) = obj.get("subtask_ids") {
        validate_array_of_strings(subtask_ids, "subtask_ids")?;
    }
    Ok(())
}

pub fn validate_public_stream_payload(payload: &Value) -> Result<(), String> {
    let Some(obj) = payload.as_object() else {
        return Err("Stream payload must be a JSON object".into());
    };
    if obj.contains_key("extracted_task_id") {
        return Err("Legacy stream field `extracted_task_id` is not accepted".into());
    }
    if let Some(tags) = obj.get("tags") {
        validate_array_of_strings(tags, "tags")?;
    }
    if let Some(attachments) = obj.get("attachments") {
        validate_array_of_strings(attachments, "attachments")?;
    }
    Ok(())
}

pub async fn put_task(
    db: &dyn DatabaseProvider,
    user_id: &str,
    id: &str,
    payload: &Value,
) -> Result<Value, String> {
    validate_public_task_payload(payload)?;
    let context = load_context(db, user_id).await?;
    let existing_public = context.tasks_by_id.get(id);
    let existing_raw_task = context.raw_task_by_canonical_id.get(id);
    let existing_stream = context.stream_by_id.get(id);
    let merged = merge_public_task(existing_public, payload, id);
    let raw_task = public_task_to_raw_task(&merged, existing_raw_task, id);
    let raw_stream = public_task_to_raw_stream(&merged, existing_stream, id);

    db.upsert_stream_entry_json(user_id, &raw_stream.to_string())
        .await
        .map_err(|e| e.to_string())?;
    db.upsert_task_json(user_id, &raw_task.to_string())
        .await
        .map_err(|e| e.to_string())?;

    if let Some(raw_ids) = context.raw_task_ids_by_canonical_id.get(id) {
        for raw_id in raw_ids {
            if raw_id == id {
                continue;
            }
            db.delete_task_row(user_id, raw_id)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    get_task(db, user_id, id)
        .await?
        .ok_or_else(|| format!("Task not found after upsert: {}", id))
}

pub async fn delete_task(
    db: &dyn DatabaseProvider,
    user_id: &str,
    id: &str,
) -> Result<bool, String> {
    let context = load_context(db, user_id).await?;
    let had_task = context.tasks_by_id.contains_key(id);
    if let Some(raw_ids) = context.raw_task_ids_by_canonical_id.get(id) {
        for raw_id in raw_ids {
            db.delete_task_row(user_id, raw_id)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    if context.stream_by_id.contains_key(id) {
        db.delete_stream_entry_row(user_id, id)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(had_task)
}

pub async fn put_stream_entry(
    db: &dyn DatabaseProvider,
    user_id: &str,
    id: &str,
    payload: &Value,
) -> Result<Value, String> {
    validate_public_stream_payload(payload)?;
    let context = load_context(db, user_id).await?;
    let existing_stream = context.stream_by_id.get(id);
    let merged = merge_public_stream(existing_stream, payload, id);
    let raw_stream = public_stream_to_raw(&merged);
    db.upsert_stream_entry_json(user_id, &raw_stream.to_string())
        .await
        .map_err(|e| e.to_string())?;

    if let Some(existing_task) = context.tasks_by_id.get(id) {
        let existing_raw_task = context.raw_task_by_canonical_id.get(id);
        let current_role_count = existing_task
            .get("role_ids")
            .and_then(|value| value.as_array())
            .map(|arr| arr.len())
            .unwrap_or(0);
        if current_role_count <= 1 {
            let projected_roles = merged
                .get("role_id")
                .and_then(|value| value.as_str())
                .map(|role| vec![Value::String(role.to_string())])
                .unwrap_or_default();
            let projected_task = merge_public_task(
                Some(existing_task),
                &json!({
                    "body": merged.get("content").cloned().unwrap_or(Value::String(String::new())),
                    "role_ids": projected_roles,
                    "primary_role": merged.get("role_id").cloned().unwrap_or(Value::Null),
                    "created_at": merged.get("timestamp").cloned().unwrap_or(Value::from(now_ms())),
                    "updated_at": merged.get("updated_at").cloned().unwrap_or(Value::from(now_ms())),
                    "tags": merged.get("tags").cloned().unwrap_or(Value::Array(vec![])),
                }),
                id,
            );
            let raw_task = public_task_to_raw_task(&projected_task, existing_raw_task, id);
            db.upsert_task_json(user_id, &raw_task.to_string())
                .await
                .map_err(|e| e.to_string())?;
            if let Some(raw_ids) = context.raw_task_ids_by_canonical_id.get(id) {
                for raw_id in raw_ids {
                    if raw_id == id {
                        continue;
                    }
                    db.delete_task_row(user_id, raw_id)
                        .await
                        .map_err(|e| e.to_string())?;
                }
            }
        }
    }

    let refreshed_rows = db
        .list_all_stream_json(user_id)
        .await
        .map_err(|e| e.to_string())?;
    let refreshed = list_stream_from_rows(db, user_id, refreshed_rows).await?;
    refreshed
        .into_iter()
        .find(|stream| stream["id"] == id)
        .ok_or_else(|| format!("Stream entry not found after upsert: {}", id))
}

pub async fn delete_stream_entry(
    db: &dyn DatabaseProvider,
    user_id: &str,
    id: &str,
) -> Result<bool, String> {
    let context = load_context(db, user_id).await?;
    let had_stream = context.stream_by_id.contains_key(id);
    if let Some(raw_ids) = context.raw_task_ids_by_canonical_id.get(id) {
        for raw_id in raw_ids {
            db.delete_task_row(user_id, raw_id)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    if had_stream {
        db.delete_stream_entry_row(user_id, id)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(had_stream)
}

fn merge_public_task(existing: Option<&Value>, patch: &Value, id: &str) -> Value {
    let now = now_ms();
    let role_ids = patch
        .get("role_ids")
        .map(|value| {
            value
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|value| value.as_str().map(|role| Value::String(role.to_string())))
                .collect::<Vec<_>>()
        })
        .or_else(|| {
            existing.and_then(|task| task.get("role_ids").and_then(|value| value.as_array()).cloned())
        })
        .unwrap_or_default();

    json!({
        "id": id,
        "title": patch.get("title").cloned().or_else(|| existing.and_then(|task| task.get("title").cloned())).unwrap_or(Value::String(String::new())),
        "title_customized": patch.get("title_customized").cloned().or_else(|| existing.and_then(|task| task.get("title_customized").cloned())).unwrap_or(Value::from(0)),
        "description": patch.get("description").cloned().or_else(|| existing.and_then(|task| task.get("description").cloned())).unwrap_or(Value::Null),
        "status": patch.get("status").cloned().or_else(|| existing.and_then(|task| task.get("status").cloned())).unwrap_or(Value::String("inbox".into())),
        "body": patch.get("body").cloned().or_else(|| existing.and_then(|task| task.get("body").cloned())).unwrap_or(Value::String(String::new())),
        "created_at": patch.get("created_at").cloned().or_else(|| existing.and_then(|task| task.get("created_at").cloned())).unwrap_or(Value::from(now)),
        "updated_at": patch.get("updated_at").cloned().or_else(|| existing.and_then(|task| task.get("updated_at").cloned())).unwrap_or(Value::from(now)),
        "completed_at": patch.get("completed_at").cloned().or_else(|| existing.and_then(|task| task.get("completed_at").cloned())).unwrap_or(Value::Null),
        "ddl": patch.get("ddl").cloned().or_else(|| existing.and_then(|task| task.get("ddl").cloned())).unwrap_or(Value::Null),
        "ddl_type": patch.get("ddl_type").cloned().or_else(|| existing.and_then(|task| task.get("ddl_type").cloned())).unwrap_or(Value::Null),
        "planned_at": patch.get("planned_at").cloned().or_else(|| existing.and_then(|task| task.get("planned_at").cloned())).unwrap_or(Value::Null),
        "role_ids": role_ids,
        "primary_role": role_ids.first().cloned().unwrap_or(Value::Null),
        "tags": patch.get("tags").cloned().or_else(|| existing.and_then(|task| task.get("tags").cloned())).unwrap_or(Value::Array(vec![])),
        "parent_id": patch.get("parent_id").cloned().or_else(|| existing.and_then(|task| task.get("parent_id").cloned())).unwrap_or(Value::Null),
        "subtask_ids": patch.get("subtask_ids").cloned().or_else(|| existing.and_then(|task| task.get("subtask_ids").cloned())).unwrap_or(Value::Array(vec![])),
        "task_type": patch.get("task_type").cloned().or_else(|| existing.and_then(|task| task.get("task_type").cloned())).unwrap_or(Value::String("task".into())),
        "priority": patch.get("priority").cloned().or_else(|| existing.and_then(|task| task.get("priority").cloned())).unwrap_or(Value::Null),
        "promoted": patch.get("promoted").cloned().or_else(|| existing.and_then(|task| task.get("promoted").cloned())).unwrap_or(Value::Null),
        "phase": patch.get("phase").cloned().or_else(|| existing.and_then(|task| task.get("phase").cloned())).unwrap_or(Value::Null),
        "kanban_column": patch.get("kanban_column").cloned().or_else(|| existing.and_then(|task| task.get("kanban_column").cloned())).unwrap_or(Value::Null),
        "resources": patch.get("resources").cloned().or_else(|| existing.and_then(|task| task.get("resources").cloned())).unwrap_or(Value::Array(vec![])),
        "reminders": patch.get("reminders").cloned().or_else(|| existing.and_then(|task| task.get("reminders").cloned())).unwrap_or(Value::Array(vec![])),
        "submissions": patch.get("submissions").cloned().or_else(|| existing.and_then(|task| task.get("submissions").cloned())).unwrap_or(Value::Array(vec![])),
        "postponements": patch.get("postponements").cloned().or_else(|| existing.and_then(|task| task.get("postponements").cloned())).unwrap_or(Value::Array(vec![])),
        "status_history": patch.get("status_history").cloned().or_else(|| existing.and_then(|task| task.get("status_history").cloned())).unwrap_or(Value::Array(vec![])),
        "progress_logs": patch.get("progress_logs").cloned().or_else(|| existing.and_then(|task| task.get("progress_logs").cloned())).unwrap_or(Value::Array(vec![])),
    })
}

fn merge_public_stream(existing: Option<&Value>, patch: &Value, id: &str) -> Value {
    let now = now_ms();
    json!({
        "id": id,
        "content": patch.get("content").cloned().or_else(|| existing.and_then(|entry| entry.get("content").cloned())).unwrap_or(Value::String(String::new())),
        "entry_type": patch.get("entry_type").cloned().or_else(|| existing.and_then(|entry| entry.get("entry_type").cloned())).unwrap_or(Value::String("spark".into())),
        "timestamp": patch.get("timestamp").cloned().or_else(|| existing.and_then(|entry| entry.get("timestamp").cloned())).unwrap_or(Value::from(now)),
        "date_key": patch.get("date_key").cloned().or_else(|| existing.and_then(|entry| entry.get("date_key").cloned())).unwrap_or_else(|| Value::String(date_key_from_ms(now))),
        "role_id": patch.get("role_id").cloned().or_else(|| existing.and_then(|entry| entry.get("role_id").cloned())).unwrap_or(Value::Null),
        "tags": patch.get("tags").cloned().or_else(|| existing.and_then(|entry| entry.get("tags").cloned())).unwrap_or(Value::Array(vec![])),
        "attachments": patch.get("attachments").cloned().or_else(|| existing.and_then(|entry| entry.get("attachments").cloned())).unwrap_or(Value::Array(vec![])),
        "updated_at": patch.get("updated_at").cloned().or_else(|| existing.and_then(|entry| entry.get("updated_at").cloned())).unwrap_or(Value::from(now)),
    })
}

fn public_task_to_raw_task(public: &Value, existing_raw: Option<&Value>, id: &str) -> Value {
    json!({
        "id": id,
        "title": public.get("title").cloned().unwrap_or(Value::String(String::new())),
        "title_customized": public.get("title_customized").cloned().unwrap_or(Value::from(0)),
        "description": public.get("description").cloned().unwrap_or(Value::Null),
        "status": public.get("status").cloned().unwrap_or(Value::String("inbox".into())),
        "body": "",
        "created_at": public.get("created_at").cloned().unwrap_or(Value::from(now_ms())),
        "updated_at": public.get("updated_at").cloned().unwrap_or(Value::from(now_ms())),
        "completed_at": public.get("completed_at").cloned().unwrap_or(Value::Null),
        "ddl": public.get("ddl").cloned().unwrap_or(Value::Null),
        "ddl_type": public.get("ddl_type").cloned().unwrap_or(Value::Null),
        "planned_at": public.get("planned_at").cloned().unwrap_or(Value::Null),
        "role_id": Value::Null,
        "role_ids": Value::String(serde_json::to_string(&parse_string_array(public.get("role_ids"))).unwrap_or_else(|_| "[]".into())),
        "parent_id": public.get("parent_id").cloned().unwrap_or(Value::Null),
        "source_stream_id": Value::Null,
        "priority": public.get("priority").cloned().or_else(|| existing_raw.and_then(|task| task.get("priority").cloned())).unwrap_or(Value::Null),
        "promoted": public.get("promoted").cloned().or_else(|| existing_raw.and_then(|task| task.get("promoted").cloned())).unwrap_or(Value::Null),
        "phase": public.get("phase").cloned().or_else(|| existing_raw.and_then(|task| task.get("phase").cloned())).unwrap_or(Value::Null),
        "kanban_column": public.get("kanban_column").cloned().or_else(|| existing_raw.and_then(|task| task.get("kanban_column").cloned())).unwrap_or(Value::Null),
        "task_type": public.get("task_type").cloned().unwrap_or(Value::String("task".into())),
        "tags": Value::String(serde_json::to_string(&parse_string_array(public.get("tags"))).unwrap_or_else(|_| "[]".into())),
        "subtask_ids": Value::String(serde_json::to_string(&parse_string_array(public.get("subtask_ids"))).unwrap_or_else(|_| "[]".into())),
        "resources": Value::String(public.get("resources").cloned().unwrap_or(Value::Array(vec![])).to_string()),
        "reminders": Value::String(public.get("reminders").cloned().unwrap_or(Value::Array(vec![])).to_string()),
        "submissions": Value::String(public.get("submissions").cloned().unwrap_or(Value::Array(vec![])).to_string()),
        "postponements": Value::String(public.get("postponements").cloned().unwrap_or(Value::Array(vec![])).to_string()),
        "status_history": Value::String(public.get("status_history").cloned().unwrap_or(Value::Array(vec![])).to_string()),
        "progress_logs": Value::String(public.get("progress_logs").cloned().unwrap_or(Value::Array(vec![])).to_string()),
    })
}

fn public_task_to_raw_stream(public: &Value, existing_stream: Option<&Value>, id: &str) -> Value {
    let timestamp = public
        .get("created_at")
        .and_then(|value| value.as_i64())
        .unwrap_or_else(now_ms);
    json!({
        "id": id,
        "content": public.get("body").cloned().unwrap_or(Value::String(String::new())),
        "entry_type": "task",
        "timestamp": timestamp,
        "date_key": date_key_from_ms(timestamp),
        "role_id": public.get("primary_role").cloned().unwrap_or(Value::Null),
        "tags": Value::String(serde_json::to_string(&parse_string_array(public.get("tags"))).unwrap_or_else(|_| "[]".into())),
        "attachments": Value::String(serde_json::to_string(&parse_string_array(existing_stream.and_then(|stream| stream.get("attachments")))).unwrap_or_else(|_| "[]".into())),
        "updated_at": public.get("updated_at").cloned().unwrap_or(Value::from(now_ms())),
    })
}

fn public_stream_to_raw(public: &Value) -> Value {
    let timestamp = public
        .get("timestamp")
        .and_then(|value| value.as_i64())
        .unwrap_or_else(now_ms);
    json!({
        "id": public.get("id").cloned().unwrap_or(Value::String(String::new())),
        "content": public.get("content").cloned().unwrap_or(Value::String(String::new())),
        "entry_type": public.get("entry_type").cloned().unwrap_or(Value::String("spark".into())),
        "timestamp": timestamp,
        "date_key": public.get("date_key").cloned().unwrap_or_else(|| Value::String(date_key_from_ms(timestamp))),
        "role_id": public.get("role_id").cloned().unwrap_or(Value::Null),
        "tags": Value::String(serde_json::to_string(&parse_string_array(public.get("tags"))).unwrap_or_else(|_| "[]".into())),
        "attachments": Value::String(serde_json::to_string(&parse_string_array(public.get("attachments"))).unwrap_or_else(|_| "[]".into())),
        "updated_at": public.get("updated_at").cloned().unwrap_or(Value::from(now_ms())),
    })
}

fn normalize_task(
    raw_task: &Value,
    canonical_ids: &HashMap<String, String>,
    stream_by_id: &HashMap<String, Value>,
    canonical_id: &str,
) -> Value {
    let linked_stream = stream_by_id
        .get(canonical_id)
        .or_else(|| raw_task.get("source_stream_id").and_then(|value| value.as_str()).and_then(|id| stream_by_id.get(id)));
    let role_ids = unique_strings(
        parse_string_array(raw_task.get("role_ids"))
            .into_iter()
            .chain(raw_task.get("role_id").and_then(|value| value.as_str()).map(str::to_string))
            .chain(linked_stream.and_then(|stream| stream.get("role_id")).and_then(|value| value.as_str()).map(str::to_string))
            .collect(),
    );
    let tags = unique_strings(
        parse_string_array(raw_task.get("tags"))
            .into_iter()
            .chain(linked_stream.map(|stream| parse_string_array(stream.get("tags"))).unwrap_or_default())
            .collect(),
    );
    let created_at = linked_stream
        .and_then(|stream| stream.get("timestamp"))
        .and_then(|value| value.as_i64())
        .unwrap_or_else(|| raw_task.get("created_at").and_then(|value| value.as_i64()).unwrap_or(0));
    let updated_at = raw_task
        .get("updated_at")
        .and_then(|value| value.as_i64())
        .unwrap_or(0)
        .max(
            linked_stream
                .and_then(|stream| stream.get("updated_at").or_else(|| stream.get("timestamp")))
                .and_then(|value| value.as_i64())
                .unwrap_or(0),
        );
    let parent_id = raw_task
        .get("parent_id")
        .and_then(|value| value.as_str())
        .and_then(|parent| canonical_ids.get(parent).cloned().or_else(|| Some(parent.to_string())));
    let subtask_ids = parse_string_array(raw_task.get("subtask_ids"))
        .into_iter()
        .map(|subtask_id| canonical_ids.get(&subtask_id).cloned().unwrap_or(subtask_id))
        .collect::<Vec<_>>();

    json!({
        "id": canonical_id,
        "title": raw_task.get("title").cloned().unwrap_or(Value::String(String::new())),
        "title_customized": raw_task.get("title_customized").cloned().unwrap_or(Value::from(0)),
        "description": raw_task.get("description").cloned().unwrap_or(Value::Null),
        "status": raw_task.get("status").cloned().unwrap_or(Value::String("inbox".into())),
        "body": linked_stream
            .and_then(|stream| stream.get("content"))
            .cloned()
            .unwrap_or_else(|| raw_task.get("body").cloned().unwrap_or(Value::String(String::new()))),
        "created_at": created_at,
        "updated_at": updated_at,
        "completed_at": raw_task.get("completed_at").cloned().unwrap_or(Value::Null),
        "ddl": raw_task.get("ddl").cloned().unwrap_or(Value::Null),
        "ddl_type": raw_task.get("ddl_type").cloned().unwrap_or(Value::Null),
        "planned_at": raw_task.get("planned_at").cloned().unwrap_or(Value::Null),
        "role_ids": role_ids,
        "primary_role": role_ids.get(0).cloned().unwrap_or(Value::Null),
        "tags": tags,
        "parent_id": parent_id,
        "subtask_ids": subtask_ids,
        "task_type": raw_task.get("task_type").cloned().unwrap_or(Value::String("task".into())),
        "priority": raw_task.get("priority").cloned().unwrap_or(Value::Null),
        "promoted": raw_task.get("promoted").cloned().unwrap_or(Value::Null),
        "phase": raw_task.get("phase").cloned().unwrap_or(Value::Null),
        "kanban_column": raw_task.get("kanban_column").cloned().unwrap_or(Value::Null),
        "resources": parse_value_array(raw_task.get("resources")),
        "reminders": parse_value_array(raw_task.get("reminders")),
        "submissions": parse_value_array(raw_task.get("submissions")),
        "postponements": parse_value_array(raw_task.get("postponements")),
        "status_history": parse_value_array(raw_task.get("status_history")),
        "progress_logs": parse_value_array(raw_task.get("progress_logs")),
    })
}

fn normalize_stream(raw_stream: &Value, task_id: Option<&str>) -> Value {
    let mut value = json!({
        "id": raw_stream.get("id").cloned().unwrap_or(Value::String(String::new())),
        "content": raw_stream.get("content").cloned().unwrap_or(Value::String(String::new())),
        "entry_type": raw_stream.get("entry_type").cloned().unwrap_or(Value::String("spark".into())),
        "timestamp": raw_stream.get("timestamp").cloned().unwrap_or(Value::from(0)),
        "date_key": raw_stream.get("date_key").cloned().unwrap_or(Value::String(String::new())),
        "role_id": raw_stream.get("role_id").cloned().unwrap_or(Value::Null),
        "tags": parse_string_array(raw_stream.get("tags")),
        "attachments": parse_string_array(raw_stream.get("attachments")),
        "updated_at": raw_stream
            .get("updated_at")
            .cloned()
            .unwrap_or_else(|| raw_stream.get("timestamp").cloned().unwrap_or(Value::from(0))),
    });
    if let Some(task_id) = task_id {
        if let Some(obj) = value.as_object_mut() {
            obj.insert("task_id".into(), Value::String(task_id.to_string()));
        }
    }
    value
}

fn compare_task_priority(left: &Value, right: &Value, stream_by_id: &HashMap<String, Value>) -> Ordering {
    let left_entry = resolve_stream_id(left, stream_by_id).and_then(|id| stream_by_id.get(&id).cloned());
    let right_entry = resolve_stream_id(right, stream_by_id).and_then(|id| stream_by_id.get(&id).cloned());
    raw_task_updated_at(right, right_entry.as_ref())
        .cmp(&raw_task_updated_at(left, left_entry.as_ref()))
        .then_with(|| raw_task_created_at(right, right_entry.as_ref()).cmp(&raw_task_created_at(left, left_entry.as_ref())))
        .then_with(|| right.get("title_customized").and_then(|value| value.as_i64()).unwrap_or(0).cmp(&left.get("title_customized").and_then(|value| value.as_i64()).unwrap_or(0)))
        .then_with(|| right.get("body").and_then(|value| value.as_str()).unwrap_or("").len().cmp(&left.get("body").and_then(|value| value.as_str()).unwrap_or("").len()))
        .then_with(|| raw_task_id(right).cmp(&raw_task_id(left)))
}

fn resolve_stream_id(task: &Value, stream_by_id: &HashMap<String, Value>) -> Option<String> {
    let raw_id = raw_task_id(task)?;
    if stream_by_id.contains_key(raw_id) {
        return Some(raw_id.to_string());
    }
    let source_stream_id = task.get("source_stream_id").and_then(|value| value.as_str())?;
    if stream_by_id.contains_key(source_stream_id) {
        return Some(source_stream_id.to_string());
    }
    None
}

fn raw_task_updated_at(task: &Value, entry: Option<&Value>) -> i64 {
    task.get("updated_at")
        .and_then(|value| value.as_i64())
        .unwrap_or(0)
        .max(
            entry
                .and_then(|stream| stream.get("updated_at").or_else(|| stream.get("timestamp")))
                .and_then(|value| value.as_i64())
                .unwrap_or(0),
        )
}

fn raw_task_created_at(task: &Value, entry: Option<&Value>) -> i64 {
    entry
        .and_then(|stream| stream.get("timestamp"))
        .and_then(|value| value.as_i64())
        .unwrap_or_else(|| task.get("created_at").and_then(|value| value.as_i64()).unwrap_or(0))
}

fn raw_task_id(task: &Value) -> Option<&str> {
    task.get("id").and_then(|value| value.as_str())
}

fn stream_id(stream: &Value) -> Option<&str> {
    stream.get("id").and_then(|value| value.as_str())
}

fn parse_string_array(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|value| value.as_str().map(str::to_string))
            .collect(),
        Some(Value::String(raw)) => serde_json::from_str::<Vec<String>>(raw).unwrap_or_default(),
        _ => vec![],
    }
}

fn parse_value_array(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Array(arr)) => Value::Array(arr.clone()),
        Some(Value::String(raw)) => serde_json::from_str::<Value>(raw).unwrap_or(Value::Array(vec![])),
        _ => Value::Array(vec![]),
    }
}

fn unique_strings(values: Vec<String>) -> Value {
    let mut out = Vec::<Value>::new();
    for value in values {
        if value.trim().is_empty() {
            continue;
        }
        if out.iter().any(|existing| existing.as_str() == Some(value.as_str())) {
            continue;
        }
        out.push(Value::String(value));
    }
    Value::Array(out)
}

fn validate_array_of_strings(value: &Value, field_name: &str) -> Result<(), String> {
    let Some(arr) = value.as_array() else {
        return Err(format!("`{}` must be an array of strings", field_name));
    };
    if arr.iter().any(|value| value.as_str().is_none()) {
        return Err(format!("`{}` must contain only strings", field_name));
    }
    Ok(())
}

fn date_key_from_ms(ms: i64) -> String {
    Utc.timestamp_millis_opt(ms)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "1970-01-01".into())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::{normalize_task, unique_strings};
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn normalize_task_prefers_stream_body_and_primary_role() {
        let task = json!({
            "id": "t-1",
            "title": "Task",
            "title_customized": 1,
            "status": "inbox",
            "body": "",
            "created_at": 100,
            "updated_at": 120,
            "role_ids": "[\"role-a\",\"role-b\"]",
            "tags": "[\"task\"]",
            "subtask_ids": "[]",
        });
        let stream = json!({
            "id": "se-1",
            "content": "Body from stream",
            "timestamp": 80,
            "updated_at": 140,
            "role_id": "role-a",
            "tags": "[\"stream\"]",
        });
        let mut streams = HashMap::new();
        streams.insert("se-1".to_string(), stream);
        let mut canonical = HashMap::new();
        canonical.insert("t-1".to_string(), "se-1".to_string());

        let normalized = normalize_task(&task, &canonical, &streams, "se-1");
        assert_eq!(normalized["id"], "se-1");
        assert_eq!(normalized["body"], "Body from stream");
        assert_eq!(normalized["created_at"], 80);
        assert_eq!(normalized["updated_at"], 140);
        assert_eq!(normalized["primary_role"], "role-a");
        assert_eq!(normalized["tags"], json!(["task", "stream"]));
    }

    #[test]
    fn unique_strings_preserves_order_and_deduplicates() {
        assert_eq!(
            unique_strings(vec!["a".into(), "b".into(), "a".into(), "".into()]),
            json!(["a", "b"])
        );
    }
}
