use std::path::{Path, PathBuf};
use std::sync::Arc;

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
        cleanup_empty_parents(&target, Path::new(&export_dir));
    }
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

pub async fn full_export_to_disk(
    db: &Arc<dyn DatabaseProvider>,
    _user_id: &str,
    export_dir: &str,
    prefix: &str,
) -> anyhow::Result<usize> {
    let all_paths = db.list_all_files(prefix).await?;
    let mut count = 0usize;
    for rel in &all_paths {
        let full = if prefix.is_empty() {
            rel.clone()
        } else {
            format!("{}/{}", prefix, rel)
        };
        if let Ok(Some(content)) = db.get_file(&full).await {
            let target = PathBuf::from(export_dir).join(rel);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            std::fs::write(&target, &content)?;
            count += 1;
        }
    }
    Ok(count)
}
