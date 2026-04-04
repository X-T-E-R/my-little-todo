use std::path::PathBuf;
use std::sync::Arc;

use serde_json::Value;

use crate::providers::DatabaseProvider;

pub async fn mirror_file_to_disk(
    db: &Arc<dyn DatabaseProvider>,
    user_id: &str,
    relative_path: &str,
    content: &str,
) {
    if let Ok(Some(export_dir)) = db.get_setting(user_id, "auto-export-path").await {
        let safe = relative_path.replace('\\', "/");
        let target = PathBuf::from(&export_dir).join(&safe);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        if let Err(e) = std::fs::write(&target, content) {
            eprintln!("[AutoExport] Failed to write {}: {}", target.display(), e);
        }
    }
}

pub async fn mirror_delete_from_disk(
    db: &Arc<dyn DatabaseProvider>,
    user_id: &str,
    relative_path: &str,
) {
    if let Ok(Some(export_dir)) = db.get_setting(user_id, "auto-export-path").await {
        let safe = relative_path.replace('\\', "/");
        let target = PathBuf::from(&export_dir).join(&safe);
        std::fs::remove_file(&target).ok();
        cleanup_empty_parents(&target, std::path::Path::new(&export_dir));
    }
}

fn cleanup_empty_parents(path: &std::path::Path, root: &std::path::Path) {
    let mut current = path.parent();
    while let Some(dir) = current {
        if dir == root || dir.as_os_str().is_empty() {
            break;
        }
        if std::fs::remove_dir(dir).is_err() {
            break;
        }
        current = dir.parent();
    }
}

/// Writes `data/tasks/{id}.json` and `data/stream/{id}.json` under `export_dir`.
pub async fn full_export_to_disk(
    db: &Arc<dyn DatabaseProvider>,
    user_id: &str,
    export_dir: &str,
) -> anyhow::Result<usize> {
    let mut count = 0usize;

    let tasks = db.list_tasks_json(user_id).await?;
    for raw in tasks {
        let v: Value = serde_json::from_str(&raw)?;
        let id = v
            .get("id")
            .and_then(|x| x.as_str())
            .unwrap_or("unknown");
        let rel = format!("data/tasks/{}.json", id);
        let target = PathBuf::from(export_dir).join(&rel);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        std::fs::write(&target, serde_json::to_string_pretty(&v)?)?;
        count += 1;
    }

    let entries = db.list_all_stream_json(user_id).await?;
    for raw in entries {
        let v: Value = serde_json::from_str(&raw)?;
        let id = v
            .get("id")
            .and_then(|x| x.as_str())
            .unwrap_or("unknown");
        let rel = format!("data/stream/{}.json", id);
        let target = PathBuf::from(export_dir).join(&rel);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        std::fs::write(&target, serde_json::to_string_pretty(&v)?)?;
        count += 1;
    }

    Ok(count)
}
