use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use base64::Engine as _;
use serde_json::{json, Value};

use crate::config::ServerConfig;
use crate::providers::DatabaseProvider;
use crate::routes::data::{ExportBlob, ExportJsonResponse};

fn sanitize_relative_path(relative_path: &str) -> anyhow::Result<PathBuf> {
    let path = Path::new(relative_path);
    if path.is_absolute() {
        anyhow::bail!("relative path must not be absolute");
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => normalized.push(part),
            Component::CurDir => {}
            Component::ParentDir => {
                anyhow::bail!("relative path must not traverse parent directories")
            }
            Component::RootDir | Component::Prefix(_) => {
                anyhow::bail!("relative path must not contain a root or prefix")
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        anyhow::bail!("relative path must not be empty");
    }

    Ok(normalized)
}

fn normalize_absolute_path(path: &Path) -> anyhow::Result<PathBuf> {
    if !path.is_absolute() {
        anyhow::bail!("path must be absolute");
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(component.as_os_str()),
            Component::CurDir => {}
            Component::Normal(part) => normalized.push(part),
            Component::ParentDir => {
                if !normalized.pop() {
                    anyhow::bail!("path escapes the allowed root");
                }
            }
        }
    }

    Ok(normalized)
}

pub fn resolve_admin_export_dir(config: &ServerConfig, requested: &str) -> anyhow::Result<PathBuf> {
    if config.admin_export_dirs.is_empty() {
        anyhow::bail!("disk export is disabled unless ADMIN_EXPORT_DIRS is configured");
    }

    let requested = normalize_absolute_path(Path::new(requested))?;
    for root in &config.admin_export_dirs {
        let allowed_root = normalize_absolute_path(Path::new(root))?;
        if requested.starts_with(&allowed_root) {
            return Ok(requested);
        }
    }

    anyhow::bail!("path is outside the configured admin export directories")
}

fn cleanup_empty_parents(path: &Path, root: &Path) {
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

pub async fn mirror_file_to_disk(
    db: &Arc<dyn DatabaseProvider>,
    user_id: &str,
    relative_path: &str,
    content: &str,
) {
    let safe_relative = match sanitize_relative_path(relative_path) {
        Ok(path) => path,
        Err(err) => {
            eprintln!(
                "[AutoExport] Rejected unsafe relative path '{}': {}",
                relative_path, err
            );
            return;
        }
    };

    if let Ok(Some(export_dir)) = db.get_setting(user_id, "auto-export-path").await {
        let target = PathBuf::from(&export_dir).join(&safe_relative);
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
    let safe_relative = match sanitize_relative_path(relative_path) {
        Ok(path) => path,
        Err(err) => {
            eprintln!(
                "[AutoExport] Rejected unsafe relative path '{}': {}",
                relative_path, err
            );
            return;
        }
    };

    if let Ok(Some(export_dir)) = db.get_setting(user_id, "auto-export-path").await {
        let export_root = PathBuf::from(&export_dir);
        let target = export_root.join(&safe_relative);
        std::fs::remove_file(&target).ok();
        cleanup_empty_parents(&target, &export_root);
    }
}

fn write_json_pretty(path: &Path, value: &impl serde::Serialize) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_string_pretty(value)?)?;
    Ok(())
}

fn blob_storage_name(id: &str, filename: &str) -> String {
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    format!("{}.{}", id, ext)
}

pub async fn full_export_to_disk(
    db: &Arc<dyn DatabaseProvider>,
    relational_user_id: &str,
    settings_user_id: &str,
    export_dir: &Path,
    blob_storage_dir: &Path,
    platform: &str,
) -> anyhow::Result<usize> {
    std::fs::create_dir_all(export_dir)?;

    let mut count = 0usize;

    let tasks = db.list_tasks_json(relational_user_id).await?;
    for raw in &tasks {
        let v: Value = serde_json::from_str(raw)?;
        let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("unknown");
        let target = export_dir.join(format!("data/tasks/{}.json", id));
        write_json_pretty(&target, &v)?;
        count += 1;
    }

    let entries = db.list_all_stream_json(relational_user_id).await?;
    for raw in &entries {
        let v: Value = serde_json::from_str(raw)?;
        let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("unknown");
        let target = export_dir.join(format!("data/stream/{}.json", id));
        write_json_pretty(&target, &v)?;
        count += 1;
    }

    let settings = db.list_settings(settings_user_id).await?;
    write_json_pretty(&export_dir.join("data/settings.json"), &settings)?;
    count += 1;

    let metas = db.list_blob_metas(settings_user_id).await?;
    let mut blob_index = Vec::with_capacity(metas.len());
    let mut blob_backups = Vec::with_capacity(metas.len());
    for meta in metas {
        let source = blob_storage_dir.join(blob_storage_name(&meta.id, &meta.filename));
        let bytes = std::fs::read(&source)?;
        let rel = format!("data/blobs/{}", blob_storage_name(&meta.id, &meta.filename));
        let target = export_dir.join(&rel);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&target, &bytes)?;
        blob_index.push(json!({
            "id": meta.id,
            "filename": meta.filename,
            "mime_type": meta.mime_type,
            "size": meta.size,
            "path": rel,
        }));
        blob_backups.push(ExportBlob {
            id: meta.id,
            filename: meta.filename,
            mime_type: meta.mime_type,
            size: meta.size,
            content_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        });
        count += 1;
    }

    write_json_pretty(&export_dir.join("data/blobs/index.json"), &blob_index)?;
    count += 1;

    let export = ExportJsonResponse {
        kind: "my-little-todo-backup".to_string(),
        schema_version: 1,
        export_version: 2,
        platform: platform.to_string(),
        includes_blobs: !blob_backups.is_empty(),
        tasks,
        stream_entries: entries,
        settings,
        blobs: blob_backups,
    };

    write_json_pretty(&export_dir.join("export.json"), &export)?;
    count += 1;

    write_json_pretty(
        &export_dir.join("_meta.json"),
        &json!({
            "kind": "my-little-todo-backup",
            "schema_version": 1,
            "export_version": 2,
            "platform": platform,
            "includes_blobs": export.includes_blobs,
        }),
    )?;
    count += 1;

    Ok(count)
}
