use serde_json::{json, Value};

const SENSITIVE_SETTING_KEYWORDS: &[&str] = &[
    "token",
    "password",
    "secret",
    "api-key",
    "api_key",
    "apikey",
    "credential",
    "cookie",
];

pub fn is_sensitive_setting_history_key(key: &str) -> bool {
    let normalized = key.trim().to_ascii_lowercase();
    !normalized.is_empty()
        && SENSITIVE_SETTING_KEYWORDS
            .iter()
            .any(|needle| normalized.contains(needle))
}

pub fn sanitize_history_snapshot_json(entity_type: &str, snapshot_json: &str) -> String {
    if entity_type != "settings" {
        return snapshot_json.to_string();
    }

    let Ok(value) = serde_json::from_str::<Value>(snapshot_json) else {
        return snapshot_json.to_string();
    };
    let Some(object) = value.as_object() else {
        return snapshot_json.to_string();
    };

    let key = object
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if !is_sensitive_setting_history_key(&key) {
        return snapshot_json.to_string();
    }

    json!({
        "key": key,
        "value_redacted": true,
        "value_length": object.get("value").and_then(Value::as_str).map(str::len).unwrap_or(0),
        "updated_at": object.get("updated_at").cloned().unwrap_or(Value::Null),
        "version": object.get("version").cloned().unwrap_or(Value::from(0)),
        "deleted_at": object.get("deleted_at").cloned().unwrap_or(Value::Null),
        "user_id": object.get("user_id").cloned().unwrap_or(Value::Null),
    })
    .to_string()
}

pub fn build_history_summary(entity_type: &str, snapshot_json: &str) -> Option<String> {
    let value: Value = serde_json::from_str(snapshot_json).ok()?;
    let summary = match entity_type {
        "tasks" => json!({
            "title": value.get("title").and_then(Value::as_str).unwrap_or(""),
            "status": value.get("status").and_then(Value::as_str).unwrap_or(""),
        }),
        "stream_entries" => json!({
            "entry_type": value.get("entry_type").and_then(Value::as_str).unwrap_or("spark"),
            "content_length": value.get("content").and_then(Value::as_str).map(str::len).unwrap_or(0),
        }),
        "settings" => json!({
            "key": value.get("key").and_then(Value::as_str).unwrap_or(""),
            "sensitive": value.get("value_redacted").and_then(Value::as_bool).unwrap_or(false),
            "value_length": value
                .get("value_length")
                .and_then(Value::as_u64)
                .map(|len| len as usize)
                .unwrap_or_else(|| value.get("value").and_then(Value::as_str).map(str::len).unwrap_or(0)),
        }),
        "blobs" => json!({
            "filename": value.get("filename").and_then(Value::as_str).unwrap_or(""),
            "size": value.get("size").and_then(Value::as_i64).unwrap_or(0),
        }),
        _ => return None,
    };
    Some(summary.to_string())
}

pub fn hydrate_task_revision_snapshot_json(
    task_snapshot_json: &str,
    stream_snapshot_json: Option<&str>,
) -> String {
    let Ok(task_snapshot) = serde_json::from_str::<Value>(task_snapshot_json) else {
        return task_snapshot_json.to_string();
    };
    let stream_snapshot =
        stream_snapshot_json.and_then(|snapshot| serde_json::from_str::<Value>(snapshot).ok());
    crate::task_stream_facade::hydrate_task_snapshot_from_history(
        &task_snapshot,
        stream_snapshot.as_ref(),
    )
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::{
        build_history_summary, is_sensitive_setting_history_key, sanitize_history_snapshot_json,
    };
    use serde_json::json;

    #[test]
    fn redacts_sensitive_setting_snapshots() {
        let sanitized = sanitize_history_snapshot_json(
            "settings",
            &json!({
                "key": "openai_api_key",
                "value": "secret-value",
                "updated_at": 123,
                "version": 9,
                "deleted_at": null,
            })
            .to_string(),
        );
        let parsed: serde_json::Value = serde_json::from_str(&sanitized).expect("valid json");
        assert_eq!(parsed["key"], "openai_api_key");
        assert_eq!(parsed["value_redacted"], true);
        assert_eq!(parsed["value_length"], 12);
        assert!(parsed.get("value").is_none());
    }

    #[test]
    fn settings_summary_marks_sensitive_snapshots() {
        let summary = build_history_summary(
            "settings",
            &json!({
                "key": "sync_token",
                "value_redacted": true,
                "value_length": 24,
            })
            .to_string(),
        )
        .expect("summary");
        let parsed: serde_json::Value = serde_json::from_str(&summary).expect("valid json");
        assert_eq!(parsed["sensitive"], true);
        assert_eq!(parsed["value_length"], 24);
    }

    #[test]
    fn detects_sensitive_setting_keys() {
        assert!(is_sensitive_setting_history_key("OPENAI_API_KEY"));
        assert!(is_sensitive_setting_history_key("sync_token"));
        assert!(!is_sensitive_setting_history_key("theme"));
    }
}
