use serde_json::{json, Map, Value};
use uuid::Uuid;

use crate::providers::DatabaseProvider;

pub const WORK_THREADS_KV: &str = "work-threads:v1";
pub const WORK_THREAD_EVENTS_KV: &str = "work-thread-events:v1";
pub const WORK_THREAD_MODULE_KEY: &str = "module:work-thread:enabled";

pub async fn work_thread_enabled(db: &dyn DatabaseProvider, user_id: &str) -> bool {
    match db.get_setting(user_id, WORK_THREAD_MODULE_KEY).await {
        Ok(Some(v)) => v != "false",
        _ => true,
    }
}

pub async fn list_threads(
    db: &dyn DatabaseProvider,
    user_id: &str,
    limit: usize,
) -> Result<Vec<Value>, String> {
    let mut threads = load_threads(db, user_id).await?;
    threads.sort_by(|left, right| thread_updated_at(right).cmp(&thread_updated_at(left)));
    threads.truncate(limit.min(threads.len()));
    Ok(threads)
}

pub async fn get_thread(
    db: &dyn DatabaseProvider,
    user_id: &str,
    id: &str,
) -> Result<Option<Value>, String> {
    Ok(load_threads(db, user_id)
        .await?
        .into_iter()
        .find(|thread| thread_id(thread) == Some(id)))
}

pub async fn create_thread(
    db: &dyn DatabaseProvider,
    user_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let now = now_ms();
    let title = args
        .get("title")
        .and_then(|value| value.as_str())
        .unwrap_or("New Thread")
        .trim();
    if title.is_empty() {
        return Err("`title` must not be empty".into());
    }
    let mission = args
        .get("mission")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(title);
    let resume = args
        .get("resume")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("");
    let pause_reason = args
        .get("pause")
        .and_then(|value| value.get("reason"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let pause_then = args
        .get("pause")
        .and_then(|value| value.get("then"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let doc_markdown = string_or_default(args.get("docMarkdown"), "");
    let body_markdown = args
        .get("bodyMarkdown")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .unwrap_or(doc_markdown.as_str())
        .to_string();

    let thread = json!({
        "id": format!("thread-{}", Uuid::new_v4()),
        "title": title,
        "bodyMarkdown": body_markdown,
        "resume": resume,
        "pause": pause_reason.map(|reason| json!({
            "reason": reason,
            "then": pause_then,
            "updatedAt": now
        })).unwrap_or(Value::Null),
        "blocks": value_array_or_empty(args.get("blocks")),
        "mission": mission,
        "status": string_or_default(args.get("status"), "active"),
        "lane": string_or_default(args.get("lane"), "general"),
        "roleId": args.get("roleId").cloned().unwrap_or(Value::Null),
        "docMarkdown": doc_markdown,
        "contextItems": value_array_or_empty(args.get("contextItems")),
        "nextActions": value_array_or_empty(args.get("nextActions")),
        "resumeCard": default_resume_card(args.get("resumeCard"), now),
        "workingSet": value_array_or_empty(args.get("workingSet")),
        "waitingFor": value_array_or_empty(args.get("waitingFor")),
        "interrupts": value_array_or_empty(args.get("interrupts")),
        "schedulerMeta": args.get("schedulerMeta").cloned().unwrap_or_else(|| json!({})),
        "syncMeta": args.get("syncMeta").cloned().unwrap_or_else(|| json!({ "mode": "internal" })),
        "suggestions": value_array_or_empty(args.get("suggestions")),
        "createdAt": now,
        "updatedAt": now
    });

    let mut threads = load_threads(db, user_id).await?;
    threads.push(thread.clone());
    save_threads(db, user_id, &threads).await?;
    Ok(thread)
}

pub async fn update_thread(
    db: &dyn DatabaseProvider,
    user_id: &str,
    id: &str,
    patch: &Value,
) -> Result<Value, String> {
    let mut threads = load_threads(db, user_id).await?;
    let index = threads
        .iter()
        .position(|thread| thread_id(thread) == Some(id))
        .ok_or_else(|| format!("Thread not found: {}", id))?;

    let mut next = threads[index].clone();
    merge_thread_patch(&mut next, patch);
    next.as_object_mut()
        .map(|obj| obj.insert("updatedAt".into(), json!(now_ms())));

    threads[index] = next.clone();
    save_threads(db, user_id, &threads).await?;
    Ok(next)
}

pub async fn set_thread_status(
    db: &dyn DatabaseProvider,
    user_id: &str,
    id: &str,
    status: &str,
) -> Result<Value, String> {
    if !matches!(
        status,
        "active" | "paused" | "done" | "archived" | "running" | "ready" | "waiting" | "blocked" | "sleeping"
    ) {
        return Err(format!("Invalid work thread status: {}", status));
    }
    update_thread(
        db,
        user_id,
        id,
        &json!({
            "status": status,
        }),
    )
    .await
}

pub async fn checkpoint_thread(
    db: &dyn DatabaseProvider,
    user_id: &str,
    id: &str,
    title: Option<&str>,
) -> Result<Value, String> {
    let now = now_ms();
    let mut thread = get_thread(db, user_id, id)
        .await?
        .ok_or_else(|| format!("Thread not found: {}", id))?;

    if let Some(obj) = thread.as_object_mut() {
        let scheduler_meta = object_clone(obj.get("schedulerMeta"));
        let mut scheduler_obj = scheduler_meta.as_object().cloned().unwrap_or_default();
        scheduler_obj.insert("lastCheckpointAt".into(), json!(now));
        obj.insert("schedulerMeta".into(), Value::Object(scheduler_obj));

        if let Some(resume) = obj.get("resume").and_then(|value| value.as_str()) {
            obj.insert("resume".into(), Value::String(resume.to_string()));
        }
        obj.insert("updatedAt".into(), json!(now));
    }

    let updated = update_thread(db, user_id, id, &thread).await?;
    let _ = append_event(
        db,
        user_id,
        id,
        &json!({
            "type": "checkpoint_saved",
            "actor": "system",
            "title": title.unwrap_or("Saved checkpoint"),
        }),
    )
    .await?;
    Ok(updated)
}

pub async fn append_event(
    db: &dyn DatabaseProvider,
    user_id: &str,
    thread_id: &str,
    args: &Value,
) -> Result<Value, String> {
    let now = now_ms();
    let _ = get_thread(db, user_id, thread_id)
        .await?
        .ok_or_else(|| format!("Thread not found: {}", thread_id))?;

    let title = args
        .get("title")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim();
    if title.is_empty() {
        return Err("`title` must not be empty".into());
    }

    let event = json!({
        "id": format!("thread-event-{}", Uuid::new_v4()),
        "threadId": thread_id,
        "type": string_or_default(args.get("type"), "decision_recorded"),
        "actor": string_or_default(args.get("actor"), "user"),
        "title": title,
        "detailMarkdown": args.get("detailMarkdown").cloned().unwrap_or(Value::Null),
        "payload": args.get("payload").cloned().unwrap_or_else(|| json!({})),
        "createdAt": now,
    });

    let mut events = load_events(db, user_id).await?;
    events.push(event.clone());
    events.sort_by(|left, right| event_created_at(right).cmp(&event_created_at(left)));
    save_events(db, user_id, &events).await?;

    let _ = update_thread(
        db,
        user_id,
        thread_id,
        &json!({
            "updatedAt": now
        }),
    )
    .await?;

    Ok(event)
}

pub async fn list_events(
    db: &dyn DatabaseProvider,
    user_id: &str,
    thread_id: &str,
    limit: usize,
) -> Result<Vec<Value>, String> {
    let mut events = load_events(db, user_id)
        .await?
        .into_iter()
        .filter(|event| event.get("threadId").and_then(|value| value.as_str()) == Some(thread_id))
        .collect::<Vec<_>>();
    events.sort_by(|left, right| event_created_at(right).cmp(&event_created_at(left)));
    events.truncate(limit.min(events.len()));
    Ok(events)
}

pub async fn delete_thread(
    db: &dyn DatabaseProvider,
    user_id: &str,
    id: &str,
) -> Result<bool, String> {
    let mut threads = load_threads(db, user_id).await?;
    let before = threads.len();
    threads.retain(|thread| thread_id(thread) != Some(id));
    if threads.len() == before {
        return Ok(false);
    }
    save_threads(db, user_id, &threads).await?;

    let mut events = load_events(db, user_id).await?;
    events.retain(|event| event.get("threadId").and_then(|value| value.as_str()) != Some(id));
    save_events(db, user_id, &events).await?;
    Ok(true)
}

async fn load_threads(db: &dyn DatabaseProvider, user_id: &str) -> Result<Vec<Value>, String> {
    let raw = db
        .get_setting(user_id, WORK_THREADS_KV)
        .await
        .map_err(|e| e.to_string())?;
    parse_value_list(raw)
}

async fn save_threads(
    db: &dyn DatabaseProvider,
    user_id: &str,
    threads: &[Value],
) -> Result<(), String> {
    db.put_setting(
        user_id,
        WORK_THREADS_KV,
        &Value::Array(threads.to_vec()).to_string(),
    )
    .await
    .map_err(|e| e.to_string())
}

async fn load_events(db: &dyn DatabaseProvider, user_id: &str) -> Result<Vec<Value>, String> {
    let raw = db
        .get_setting(user_id, WORK_THREAD_EVENTS_KV)
        .await
        .map_err(|e| e.to_string())?;
    parse_value_list(raw)
}

async fn save_events(
    db: &dyn DatabaseProvider,
    user_id: &str,
    events: &[Value],
) -> Result<(), String> {
    db.put_setting(
        user_id,
        WORK_THREAD_EVENTS_KV,
        &Value::Array(events.to_vec()).to_string(),
    )
    .await
    .map_err(|e| e.to_string())
}

fn parse_value_list(raw: Option<String>) -> Result<Vec<Value>, String> {
    match raw {
        Some(raw) => {
            let parsed = serde_json::from_str::<Value>(&raw).map_err(|e| e.to_string())?;
            Ok(parsed.as_array().cloned().unwrap_or_default())
        }
        None => Ok(Vec::new()),
    }
}

fn merge_thread_patch(target: &mut Value, patch: &Value) {
    let Some(target_obj) = target.as_object_mut() else {
        return;
    };
    let Some(patch_obj) = patch.as_object() else {
        return;
    };

    for (key, value) in patch_obj {
        match key.as_str() {
            "pause" | "resumeCard" | "schedulerMeta" | "syncMeta" => {
                let merged = merge_objects(target_obj.get(key), value);
                target_obj.insert(key.clone(), merged);
            }
            _ => {
                target_obj.insert(key.clone(), value.clone());
            }
        }
    }
}

fn merge_objects(current: Option<&Value>, patch: &Value) -> Value {
    let mut merged = current
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    if let Some(patch_obj) = patch.as_object() {
        for (key, value) in patch_obj {
            merged.insert(key.clone(), value.clone());
        }
    } else {
        return patch.clone();
    }
    Value::Object(merged)
}

fn default_resume_card(current: Option<&Value>, now: i64) -> Value {
    let mut card = current
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    card.entry("summary")
        .or_insert_with(|| Value::String(String::new()));
    card.entry("nextStep")
        .or_insert_with(|| Value::String(String::new()));
    card.entry("guardrails")
        .or_insert_with(|| Value::Array(vec![]));
    card.insert("updatedAt".into(), json!(now));
    Value::Object(card)
}

fn value_array_or_empty(value: Option<&Value>) -> Value {
    value
        .cloned()
        .filter(|candidate| candidate.is_array())
        .unwrap_or_else(|| Value::Array(vec![]))
}

fn object_clone(value: Option<&Value>) -> Value {
    value
        .cloned()
        .filter(|candidate| candidate.is_object())
        .unwrap_or_else(|| Value::Object(Map::new()))
}

fn string_or_default(value: Option<&Value>, default: &str) -> String {
    value
        .and_then(|candidate| candidate.as_str())
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
        .unwrap_or(default)
        .to_string()
}

fn thread_id(thread: &Value) -> Option<&str> {
    thread.get("id").and_then(|value| value.as_str())
}

fn thread_updated_at(thread: &Value) -> i64 {
    thread
        .get("updatedAt")
        .and_then(|value| value.as_i64())
        .unwrap_or(0)
}

fn event_created_at(event: &Value) -> i64 {
    event
        .get("createdAt")
        .and_then(|value| value.as_i64())
        .unwrap_or(0)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}
