use async_trait::async_trait;
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use sqlx::Sqlite;

use super::traits::{
    BlobMeta, ChangeRecord, DatabaseProvider, InviteRecord, NewUser, SessionRecord, User,
};

async fn bump_version_sqlite<'e, E: sqlx::Executor<'e, Database = Sqlite>>(
    e: E,
) -> anyhow::Result<i64> {
    let row: (i64,) = sqlx::query_as(
        "UPDATE version_seq SET current_version = current_version + 1 WHERE id = 1 RETURNING current_version",
    )
    .fetch_one(e)
    .await?;
    Ok(row.0)
}

async fn upsert_task_json_tx(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    user_id: &str,
    json: &str,
) -> anyhow::Result<()> {
    let v: serde_json::Value = serde_json::from_str(json)?;
    let next_ver = bump_version_sqlite(&mut **tx).await?;
    let updated_at = v["updated_at"].as_i64().unwrap_or(0);
    sqlx::query(
        r#"INSERT INTO tasks (
                user_id, id, title, title_customized, description, status, body, created_at, updated_at, completed_at,
                ddl, ddl_type, planned_at, role_id, role_ids, parent_id, source_stream_id, priority, promoted, phase, kanban_column,
                task_type,
                tags, subtask_ids, resources, reminders, submissions, postponements, status_history, progress_logs,
                version, deleted_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(user_id, id) DO UPDATE SET
                title=excluded.title, title_customized=excluded.title_customized, description=excluded.description, status=excluded.status, body=excluded.body,
                created_at=excluded.created_at, updated_at=excluded.updated_at, completed_at=excluded.completed_at,
                ddl=excluded.ddl, ddl_type=excluded.ddl_type, planned_at=excluded.planned_at,
                role_id=excluded.role_id, role_ids=excluded.role_ids, parent_id=excluded.parent_id, source_stream_id=excluded.source_stream_id,
                priority=excluded.priority, promoted=excluded.promoted, phase=excluded.phase, kanban_column=excluded.kanban_column,
                task_type=excluded.task_type,
                tags=excluded.tags, subtask_ids=excluded.subtask_ids, resources=excluded.resources,
                reminders=excluded.reminders, submissions=excluded.submissions, postponements=excluded.postponements,
                status_history=excluded.status_history, progress_logs=excluded.progress_logs,
                version=excluded.version, deleted_at=excluded.deleted_at"#,
    )
    .bind(user_id)
    .bind(v["id"].as_str().unwrap_or(""))
    .bind(v["title"].as_str().unwrap_or(""))
    .bind(v["title_customized"].as_i64().unwrap_or(0))
    .bind(v["description"].as_str())
    .bind(v["status"].as_str().unwrap_or("inbox"))
    .bind(v["body"].as_str().unwrap_or(""))
    .bind(v["created_at"].as_i64().unwrap_or(0))
    .bind(updated_at)
    .bind(v["completed_at"].as_i64())
    .bind(v["ddl"].as_i64())
    .bind(v["ddl_type"].as_str())
    .bind(v["planned_at"].as_i64())
    .bind(v["role_id"].as_str())
    .bind(v["role_ids"].as_str())
    .bind(v["parent_id"].as_str())
    .bind(v["source_stream_id"].as_str())
    .bind(v["priority"].as_f64())
    .bind(v["promoted"].as_i64())
    .bind(v["phase"].as_str())
    .bind(v["kanban_column"].as_str())
    .bind(v["task_type"].as_str())
    .bind(v["tags"].as_str().unwrap_or("[]"))
    .bind(v["subtask_ids"].as_str().unwrap_or("[]"))
    .bind(v["resources"].as_str().unwrap_or("[]"))
    .bind(v["reminders"].as_str().unwrap_or("[]"))
    .bind(v["submissions"].as_str().unwrap_or("[]"))
    .bind(v["postponements"].as_str().unwrap_or("[]"))
    .bind(v["status_history"].as_str().unwrap_or("[]"))
    .bind(v["progress_logs"].as_str().unwrap_or("[]"))
    .bind(next_ver)
    .bind(None::<String>)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn upsert_stream_entry_json_tx(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    user_id: &str,
    json: &str,
) -> anyhow::Result<()> {
    let v: serde_json::Value = serde_json::from_str(json)?;
    let next_ver = bump_version_sqlite(&mut **tx).await?;
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let updated_at = v
        .get("updated_at")
        .and_then(|x| x.as_i64())
        .unwrap_or(now_ms);
    sqlx::query(
        r#"INSERT INTO stream_entries (
                user_id, id, content, entry_type, timestamp, date_key, role_id, extracted_task_id,
                tags, attachments, version, deleted_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(user_id, id) DO UPDATE SET
                content=excluded.content, entry_type=excluded.entry_type, timestamp=excluded.timestamp,
                date_key=excluded.date_key, role_id=excluded.role_id, extracted_task_id=excluded.extracted_task_id,
                tags=excluded.tags, attachments=excluded.attachments, version=excluded.version, deleted_at=excluded.deleted_at,
                updated_at=excluded.updated_at"#,
    )
    .bind(user_id)
    .bind(v["id"].as_str().unwrap_or(""))
    .bind(v["content"].as_str().unwrap_or(""))
    .bind(v["entry_type"].as_str().unwrap_or("spark"))
    .bind(v["timestamp"].as_i64().unwrap_or(0))
    .bind(v["date_key"].as_str().unwrap_or(""))
    .bind(v["role_id"].as_str())
    .bind(v["extracted_task_id"].as_str())
    .bind(v["tags"].as_str().unwrap_or("[]"))
    .bind(v["attachments"].as_str().unwrap_or("[]"))
    .bind(next_ver)
    .bind(None::<String>)
    .bind(updated_at)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn apply_remote_change_tx(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    user_id: &str,
    change: &ChangeRecord,
) -> anyhow::Result<()> {
    match change.table.as_str() {
        "tasks" => {
            if change.deleted_at.is_some() {
                let next_ver = bump_version_sqlite(&mut **tx).await?;
                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);
                sqlx::query(
                    "UPDATE tasks SET deleted_at = ?, updated_at = ?, version = ?
                     WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
                )
                .bind(now_ms.to_string())
                .bind(now_ms)
                .bind(next_ver)
                .bind(user_id)
                .bind(&change.key)
                .execute(&mut **tx)
                .await?;
            } else if let Some(data) = &change.data {
                upsert_task_json_tx(tx, user_id, data).await?;
            }
        }
        "stream_entries" => {
            if change.deleted_at.is_some() {
                let next_ver = bump_version_sqlite(&mut **tx).await?;
                sqlx::query(
                    "UPDATE stream_entries SET deleted_at = datetime('now'), version = ?
                     WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
                )
                .bind(next_ver)
                .bind(user_id)
                .bind(&change.key)
                .execute(&mut **tx)
                .await?;
            } else if let Some(data) = &change.data {
                upsert_stream_entry_json_tx(tx, user_id, data).await?;
            }
        }
        "settings" => {
            if change.deleted_at.is_some() {
                let next_ver = bump_version_sqlite(&mut **tx).await?;
                sqlx::query(
                    "UPDATE settings SET deleted_at = datetime('now'), updated_at = datetime('now'), version = ?
                     WHERE user_id = ? AND key = ? AND deleted_at IS NULL",
                )
                .bind(next_ver)
                .bind(user_id)
                .bind(&change.key)
                .execute(&mut **tx)
                .await?;
            } else if let Some(data) = &change.data {
                let v: serde_json::Value = serde_json::from_str(data)?;
                let value = v["value"].as_str().unwrap_or("");
                let next_ver = bump_version_sqlite(&mut **tx).await?;
                sqlx::query(
                    "INSERT INTO settings (user_id, key, value, updated_at, version, deleted_at)
                     VALUES (?, ?, ?, datetime('now'), ?, NULL)
                     ON CONFLICT(user_id, key) DO UPDATE SET
                       value = excluded.value,
                       updated_at = datetime('now'),
                       version = excluded.version,
                       deleted_at = NULL",
                )
                .bind(user_id)
                .bind(&change.key)
                .bind(value)
                .bind(next_ver)
                .execute(&mut **tx)
                .await?;
            }
        }
        "blobs" => {
            if change.deleted_at.is_some() {
                let next_ver = bump_version_sqlite(&mut **tx).await?;
                sqlx::query(
                    "UPDATE blobs SET deleted_at = datetime('now'), version = ?
                     WHERE owner = ? AND id = ? AND deleted_at IS NULL",
                )
                .bind(next_ver)
                .bind(user_id)
                .bind(&change.key)
                .execute(&mut **tx)
                .await?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub struct SqliteProvider {
    pool: SqlitePool,
}

impl SqliteProvider {
    pub async fn new(database_url: &str) -> anyhow::Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await?;

        // Schema version tracking
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&pool)
        .await?;

        let current_version: i64 =
            sqlx::query_as::<_, (i64,)>("SELECT COALESCE(MAX(version), 0) FROM schema_version")
                .fetch_one(&pool)
                .await
                .map(|r| r.0)
                .unwrap_or(0);

        // --- V1: initial schema ---
        if current_version < 1 {
            sqlx::query(
                "CREATE TABLE IF NOT EXISTS files (
                    path TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                )",
            )
            .execute(&pool)
            .await?;

            sqlx::query(
                "CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                )",
            )
            .execute(&pool)
            .await?;

            sqlx::query(
                "CREATE TABLE IF NOT EXISTS settings (
                    user_id TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    PRIMARY KEY (user_id, key)
                )",
            )
            .execute(&pool)
            .await?;

            sqlx::query("INSERT OR IGNORE INTO schema_version (version) VALUES (1)")
                .execute(&pool)
                .await?;
        }

        // --- V2: indexes + created_at migration ---
        if current_version < 2 {
            // Add created_at column if missing (for databases created in V1 without it)
            let has_created_at: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM pragma_table_info('files') WHERE name = 'created_at'",
            )
            .fetch_one(&pool)
            .await
            .map(|r| r.0 > 0)
            .unwrap_or(false);

            if !has_created_at {
                sqlx::query("ALTER TABLE files ADD COLUMN created_at TEXT")
                    .execute(&pool)
                    .await?;
                // Backfill existing rows with their updated_at value
                sqlx::query("UPDATE files SET created_at = updated_at WHERE created_at IS NULL")
                    .execute(&pool)
                    .await?;
            }

            // Performance indexes
            sqlx::query("CREATE INDEX IF NOT EXISTS idx_files_updated ON files (updated_at)")
                .execute(&pool)
                .await?;

            sqlx::query("CREATE INDEX IF NOT EXISTS idx_settings_user ON settings (user_id)")
                .execute(&pool)
                .await?;

            sqlx::query("INSERT OR IGNORE INTO schema_version (version) VALUES (2)")
                .execute(&pool)
                .await?;
        }

        // --- V3: blobs metadata table ---
        if current_version < 3 {
            sqlx::query(
                "CREATE TABLE IF NOT EXISTS blobs (
                    id TEXT PRIMARY KEY,
                    owner TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
                    size INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                )",
            )
            .execute(&pool)
            .await?;

            sqlx::query("CREATE INDEX IF NOT EXISTS idx_blobs_owner ON blobs (owner)")
                .execute(&pool)
                .await?;

            sqlx::query("INSERT OR IGNORE INTO schema_version (version) VALUES (3)")
                .execute(&pool)
                .await?;
        }

        // --- V4: soft delete + version columns for sync ---
        if current_version < 4 {
            // files: add deleted_at and version
            let has_deleted_at: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM pragma_table_info('files') WHERE name = 'deleted_at'",
            )
            .fetch_one(&pool)
            .await
            .map(|r| r.0 > 0)
            .unwrap_or(false);

            if !has_deleted_at {
                sqlx::query("ALTER TABLE files ADD COLUMN deleted_at TEXT")
                    .execute(&pool)
                    .await?;
            }

            let has_version: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM pragma_table_info('files') WHERE name = 'version'",
            )
            .fetch_one(&pool)
            .await
            .map(|r| r.0 > 0)
            .unwrap_or(false);

            if !has_version {
                sqlx::query("ALTER TABLE files ADD COLUMN version INTEGER NOT NULL DEFAULT 0")
                    .execute(&pool)
                    .await?;
            }

            // settings: add deleted_at and version
            let has_settings_deleted: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM pragma_table_info('settings') WHERE name = 'deleted_at'",
            )
            .fetch_one(&pool)
            .await
            .map(|r| r.0 > 0)
            .unwrap_or(false);

            if !has_settings_deleted {
                sqlx::query("ALTER TABLE settings ADD COLUMN deleted_at TEXT")
                    .execute(&pool)
                    .await?;
            }

            let has_settings_version: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM pragma_table_info('settings') WHERE name = 'version'",
            )
            .fetch_one(&pool)
            .await
            .map(|r| r.0 > 0)
            .unwrap_or(false);

            if !has_settings_version {
                sqlx::query("ALTER TABLE settings ADD COLUMN version INTEGER NOT NULL DEFAULT 0")
                    .execute(&pool)
                    .await?;
            }

            // blobs: add deleted_at and version
            let has_blobs_deleted: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM pragma_table_info('blobs') WHERE name = 'deleted_at'",
            )
            .fetch_one(&pool)
            .await
            .map(|r| r.0 > 0)
            .unwrap_or(false);

            if !has_blobs_deleted {
                sqlx::query("ALTER TABLE blobs ADD COLUMN deleted_at TEXT")
                    .execute(&pool)
                    .await?;
            }

            let has_blobs_version: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM pragma_table_info('blobs') WHERE name = 'version'",
            )
            .fetch_one(&pool)
            .await
            .map(|r| r.0 > 0)
            .unwrap_or(false);

            if !has_blobs_version {
                sqlx::query("ALTER TABLE blobs ADD COLUMN version INTEGER NOT NULL DEFAULT 0")
                    .execute(&pool)
                    .await?;
            }

            // Indexes for sync queries
            sqlx::query("CREATE INDEX IF NOT EXISTS idx_files_version ON files (version)")
                .execute(&pool)
                .await?;
            sqlx::query("CREATE INDEX IF NOT EXISTS idx_files_deleted ON files (deleted_at)")
                .execute(&pool)
                .await?;
            sqlx::query("CREATE INDEX IF NOT EXISTS idx_settings_version ON settings (version)")
                .execute(&pool)
                .await?;
            sqlx::query("CREATE INDEX IF NOT EXISTS idx_blobs_version ON blobs (version)")
                .execute(&pool)
                .await?;

            // Version sequence table
            sqlx::query(
                "CREATE TABLE IF NOT EXISTS version_seq (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    current_version INTEGER NOT NULL DEFAULT 0
                )",
            )
            .execute(&pool)
            .await?;
            sqlx::query("INSERT OR IGNORE INTO version_seq (id, current_version) VALUES (1, 0)")
                .execute(&pool)
                .await?;

            sqlx::query("INSERT OR IGNORE INTO schema_version (version) VALUES (4)")
                .execute(&pool)
                .await?;
        }

        // --- V5: relational tasks + stream_entries (replaces virtual files for app data) ---
        if current_version < 5 {
            sqlx::query(
                "CREATE TABLE IF NOT EXISTS tasks (
                    user_id TEXT NOT NULL,
                    id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    status TEXT NOT NULL DEFAULT 'inbox',
                    body TEXT NOT NULL DEFAULT '',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    completed_at INTEGER,
                    ddl INTEGER,
                    ddl_type TEXT,
                    planned_at INTEGER,
                    role_id TEXT,
                    parent_id TEXT,
                    source_stream_id TEXT,
                    priority REAL,
                    promoted INTEGER,
                    phase TEXT,
                    kanban_column TEXT,
                    tags TEXT NOT NULL DEFAULT '[]',
                    subtask_ids TEXT NOT NULL DEFAULT '[]',
                    resources TEXT NOT NULL DEFAULT '[]',
                    reminders TEXT NOT NULL DEFAULT '[]',
                    submissions TEXT NOT NULL DEFAULT '[]',
                    postponements TEXT NOT NULL DEFAULT '[]',
                    status_history TEXT NOT NULL DEFAULT '[]',
                    progress_logs TEXT NOT NULL DEFAULT '[]',
                    version INTEGER NOT NULL DEFAULT 0,
                    deleted_at TEXT,
                    PRIMARY KEY (user_id, id)
                )",
            )
            .execute(&pool)
            .await?;

            sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_tasks_user_version ON tasks (user_id, version)",
            )
            .execute(&pool)
            .await?;

            sqlx::query(
                "CREATE TABLE IF NOT EXISTS stream_entries (
                    user_id TEXT NOT NULL,
                    id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    entry_type TEXT NOT NULL DEFAULT 'spark',
                    timestamp INTEGER NOT NULL,
                    date_key TEXT NOT NULL,
                    role_id TEXT,
                    extracted_task_id TEXT,
                    tags TEXT NOT NULL DEFAULT '[]',
                    attachments TEXT NOT NULL DEFAULT '[]',
                    version INTEGER NOT NULL DEFAULT 0,
                    deleted_at TEXT,
                    PRIMARY KEY (user_id, id)
                )",
            )
            .execute(&pool)
            .await?;

            sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_stream_user_date ON stream_entries (user_id, date_key)",
            )
            .execute(&pool)
            .await?;

            sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_stream_user_version ON stream_entries (user_id, version)",
            )
            .execute(&pool)
            .await?;

            sqlx::query("INSERT OR IGNORE INTO schema_version (version) VALUES (5)")
                .execute(&pool)
                .await?;
        }

        // --- V6: stream_entries.updated_at (LWW uses wall time on edit, not original timestamp) ---
        if current_version < 6 {
            let has_updated_at: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM pragma_table_info('stream_entries') WHERE name = 'updated_at'",
            )
            .fetch_one(&pool)
            .await
            .map(|r| r.0 > 0)
            .unwrap_or(false);

            if !has_updated_at {
                sqlx::query("ALTER TABLE stream_entries ADD COLUMN updated_at INTEGER")
                    .execute(&pool)
                    .await?;
                sqlx::query(
                    "UPDATE stream_entries SET updated_at = timestamp WHERE updated_at IS NULL",
                )
                .execute(&pool)
                .await?;
            }

            sqlx::query("INSERT OR IGNORE INTO schema_version (version) VALUES (6)")
                .execute(&pool)
                .await?;
        }

        // --- V7: tasks.role_ids (multi-role support) ---
        if current_version < 7 {
            let has_role_ids: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'role_ids'",
            )
            .fetch_one(&pool)
            .await
            .map(|r| r.0 > 0)
            .unwrap_or(false);

            if !has_role_ids {
                sqlx::query("ALTER TABLE tasks ADD COLUMN role_ids TEXT")
                    .execute(&pool)
                    .await?;
            }

            sqlx::query("INSERT OR IGNORE INTO schema_version (version) VALUES (7)")
                .execute(&pool)
                .await?;
        }

        // --- V8: tasks.title_customized (derived title from body when 0) ---
        if current_version < 8 {
            let has_title_customized: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'title_customized'",
            )
            .fetch_one(&pool)
            .await
            .map(|r| r.0 > 0)
            .unwrap_or(false);

            if !has_title_customized {
                sqlx::query(
                    "ALTER TABLE tasks ADD COLUMN title_customized INTEGER NOT NULL DEFAULT 0",
                )
                .execute(&pool)
                .await?;
                sqlx::query(
                    "UPDATE tasks SET title_customized = CASE WHEN length(trim(title)) > 0 THEN 1 ELSE 0 END",
                )
                    .execute(&pool)
                    .await?;
            }

            sqlx::query("INSERT OR IGNORE INTO schema_version (version) VALUES (8)")
                .execute(&pool)
                .await?;
        }

        // --- V9: repair title_customized for rows with non-empty title but flag 0 ---
        if current_version < 9 {
            sqlx::query(
                "UPDATE tasks SET title_customized = 1 WHERE length(trim(title)) > 0 AND title_customized = 0",
            )
            .execute(&pool)
            .await?;

            sqlx::query("INSERT OR IGNORE INTO schema_version (version) VALUES (9)")
                .execute(&pool)
                .await?;
        }

        // --- V10: tasks.task_type (project vs task) ---
        if current_version < 10 {
            let has_task_type: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'task_type'",
            )
            .fetch_one(&pool)
            .await
            .map(|r| r.0 > 0)
            .unwrap_or(false);

            if !has_task_type {
                sqlx::query("ALTER TABLE tasks ADD COLUMN task_type TEXT")
                    .execute(&pool)
                    .await?;
            }

            sqlx::query("INSERT OR IGNORE INTO schema_version (version) VALUES (10)")
                .execute(&pool)
                .await?;
        }

        // --- V11: embedded auth sessions, invites, enabled flag ---
        if current_version < 11 {
            let has_is_enabled: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'is_enabled'",
            )
            .fetch_one(&pool)
            .await
            .map(|r| r.0 > 0)
            .unwrap_or(false);

            if !has_is_enabled {
                sqlx::query(
                    "ALTER TABLE users ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT TRUE",
                )
                .execute(&pool)
                .await?;
            }

            sqlx::query(
                "CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    expires_at TEXT
                )",
            )
            .execute(&pool)
            .await?;
            sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)")
                .execute(&pool)
                .await?;

            sqlx::query(
                "CREATE TABLE IF NOT EXISTS invites (
                    code TEXT PRIMARY KEY,
                    created_by TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    expires_at TEXT,
                    consumed_at TEXT,
                    consumed_by TEXT
                )",
            )
            .execute(&pool)
            .await?;

            sqlx::query("INSERT OR IGNORE INTO schema_version (version) VALUES (11)")
                .execute(&pool)
                .await?;
        }

        Ok(Self { pool })
    }
}

#[async_trait]
impl DatabaseProvider for SqliteProvider {
    // --- Tasks ---

    async fn list_tasks_json(&self, user_id: &str) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"SELECT json_object(
                'id', id, 'title', title, 'title_customized', title_customized, 'description', description, 'status', status, 'body', body,
                'created_at', created_at, 'updated_at', updated_at, 'completed_at', completed_at,
                'ddl', ddl, 'ddl_type', ddl_type, 'planned_at', planned_at,
                'role_id', role_id, 'role_ids', role_ids, 'parent_id', parent_id, 'source_stream_id', source_stream_id,
                'priority', priority, 'promoted', promoted, 'phase', phase, 'kanban_column', kanban_column,
                'task_type', task_type,
                'tags', tags, 'subtask_ids', subtask_ids, 'resources', resources,
                'reminders', reminders, 'submissions', submissions, 'postponements', postponements,
                'status_history', status_history, 'progress_logs', progress_logs,
                'version', version, 'deleted_at', deleted_at
            ) FROM tasks WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC"#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn get_task_json(&self, user_id: &str, id: &str) -> anyhow::Result<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as(
            r#"SELECT json_object(
                'id', id, 'title', title, 'title_customized', title_customized, 'description', description, 'status', status, 'body', body,
                'created_at', created_at, 'updated_at', updated_at, 'completed_at', completed_at,
                'ddl', ddl, 'ddl_type', ddl_type, 'planned_at', planned_at,
                'role_id', role_id, 'role_ids', role_ids, 'parent_id', parent_id, 'source_stream_id', source_stream_id,
                'priority', priority, 'promoted', promoted, 'phase', phase, 'kanban_column', kanban_column,
                'task_type', task_type,
                'tags', tags, 'subtask_ids', subtask_ids, 'resources', resources,
                'reminders', reminders, 'submissions', submissions, 'postponements', postponements,
                'status_history', status_history, 'progress_logs', progress_logs,
                'version', version, 'deleted_at', deleted_at
            ) FROM tasks WHERE user_id = ? AND id = ? AND deleted_at IS NULL"#,
        )
        .bind(user_id)
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| r.0))
    }

    async fn upsert_task_json(&self, user_id: &str, json: &str) -> anyhow::Result<()> {
        let v: serde_json::Value = serde_json::from_str(json)?;
        let next_ver = bump_version_sqlite(&self.pool).await?;
        let updated_at = v["updated_at"].as_i64().unwrap_or(0);
        sqlx::query(
            r#"INSERT INTO tasks (
                user_id, id, title, title_customized, description, status, body, created_at, updated_at, completed_at,
                ddl, ddl_type, planned_at, role_id, role_ids, parent_id, source_stream_id, priority, promoted, phase, kanban_column,
                task_type,
                tags, subtask_ids, resources, reminders, submissions, postponements, status_history, progress_logs,
                version, deleted_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(user_id, id) DO UPDATE SET
                title=excluded.title, title_customized=excluded.title_customized, description=excluded.description, status=excluded.status, body=excluded.body,
                created_at=excluded.created_at, updated_at=excluded.updated_at, completed_at=excluded.completed_at,
                ddl=excluded.ddl, ddl_type=excluded.ddl_type, planned_at=excluded.planned_at,
                role_id=excluded.role_id, role_ids=excluded.role_ids, parent_id=excluded.parent_id, source_stream_id=excluded.source_stream_id,
                priority=excluded.priority, promoted=excluded.promoted, phase=excluded.phase, kanban_column=excluded.kanban_column,
                task_type=excluded.task_type,
                tags=excluded.tags, subtask_ids=excluded.subtask_ids, resources=excluded.resources,
                reminders=excluded.reminders, submissions=excluded.submissions, postponements=excluded.postponements,
                status_history=excluded.status_history, progress_logs=excluded.progress_logs,
                version=excluded.version, deleted_at=excluded.deleted_at"#,
        )
        .bind(user_id)
        .bind(v["id"].as_str().unwrap_or(""))
        .bind(v["title"].as_str().unwrap_or(""))
        .bind(v["title_customized"].as_i64().unwrap_or(0))
        .bind(v["description"].as_str())
        .bind(v["status"].as_str().unwrap_or("inbox"))
        .bind(v["body"].as_str().unwrap_or(""))
        .bind(v["created_at"].as_i64().unwrap_or(0))
        .bind(updated_at)
        .bind(v["completed_at"].as_i64())
        .bind(v["ddl"].as_i64())
        .bind(v["ddl_type"].as_str())
        .bind(v["planned_at"].as_i64())
        .bind(v["role_id"].as_str())
        .bind(v["role_ids"].as_str())
        .bind(v["parent_id"].as_str())
        .bind(v["source_stream_id"].as_str())
        .bind(v["priority"].as_f64())
        .bind(v["promoted"].as_i64())
        .bind(v["phase"].as_str())
        .bind(v["kanban_column"].as_str())
        .bind(v["task_type"].as_str())
        .bind(v["tags"].as_str().unwrap_or("[]"))
        .bind(v["subtask_ids"].as_str().unwrap_or("[]"))
        .bind(v["resources"].as_str().unwrap_or("[]"))
        .bind(v["reminders"].as_str().unwrap_or("[]"))
        .bind(v["submissions"].as_str().unwrap_or("[]"))
        .bind(v["postponements"].as_str().unwrap_or("[]"))
        .bind(v["status_history"].as_str().unwrap_or("[]"))
        .bind(v["progress_logs"].as_str().unwrap_or("[]"))
        .bind(next_ver)
        .bind(None::<String>)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn delete_task_row(&self, user_id: &str, id: &str) -> anyhow::Result<()> {
        let next_ver = bump_version_sqlite(&self.pool).await?;
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        // tasks.updated_at is INTEGER (epoch ms); do not use datetime('now') TEXT into INTEGER column.
        sqlx::query(
            "UPDATE tasks SET deleted_at = ?, updated_at = ?, version = ?
             WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
        )
        .bind(now_ms.to_string())
        .bind(now_ms)
        .bind(next_ver)
        .bind(user_id)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // --- Stream ---

    async fn list_stream_day_json(
        &self,
        user_id: &str,
        date_key: &str,
    ) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"SELECT json_object(
                'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', timestamp,
                'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                'tags', tags, 'attachments', attachments, 'version', version, 'deleted_at', deleted_at,
                'updated_at', COALESCE(updated_at, timestamp)
            ) FROM stream_entries WHERE user_id = ? AND date_key = ? AND deleted_at IS NULL ORDER BY timestamp ASC"#,
        )
        .bind(user_id)
        .bind(date_key)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn list_stream_recent_json(
        &self,
        user_id: &str,
        days: i32,
    ) -> anyhow::Result<Vec<String>> {
        let offset = format!("-{} days", days.max(1));
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"SELECT json_object(
                'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', timestamp,
                'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                'tags', tags, 'attachments', attachments, 'version', version, 'deleted_at', deleted_at,
                'updated_at', COALESCE(updated_at, timestamp)
            ) FROM stream_entries WHERE user_id = ? AND deleted_at IS NULL
            AND date_key >= date('now', ?) ORDER BY timestamp DESC"#,
        )
        .bind(user_id)
        .bind(&offset)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn list_stream_date_keys(&self, user_id: &str) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT DISTINCT date_key FROM stream_entries WHERE user_id = ? AND deleted_at IS NULL ORDER BY date_key DESC",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn list_all_stream_json(&self, user_id: &str) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"SELECT json_object(
                'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', timestamp,
                'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                'tags', tags, 'attachments', attachments, 'version', version, 'deleted_at', deleted_at,
                'updated_at', COALESCE(updated_at, timestamp)
            ) FROM stream_entries WHERE user_id = ? AND deleted_at IS NULL
            ORDER BY date_key DESC, timestamp DESC"#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn search_stream_json(
        &self,
        user_id: &str,
        q: &str,
        limit: i64,
    ) -> anyhow::Result<Vec<String>> {
        let needle = q.trim();
        if needle.is_empty() {
            return Ok(vec![]);
        }
        let lim = limit.clamp(1, 500);
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"SELECT json_object(
                'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', timestamp,
                'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                'tags', tags, 'attachments', attachments, 'version', version, 'deleted_at', deleted_at,
                'updated_at', COALESCE(updated_at, timestamp)
            ) FROM stream_entries WHERE user_id = ? AND deleted_at IS NULL
            AND instr(lower(content), lower(?)) > 0
            ORDER BY timestamp DESC LIMIT ?"#,
        )
        .bind(user_id)
        .bind(needle)
        .bind(lim)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn upsert_stream_entry_json(&self, user_id: &str, json: &str) -> anyhow::Result<()> {
        let v: serde_json::Value = serde_json::from_str(json)?;
        let next_ver = bump_version_sqlite(&self.pool).await?;
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let updated_at = v
            .get("updated_at")
            .and_then(|x| x.as_i64())
            .unwrap_or(now_ms);
        sqlx::query(
            r#"INSERT INTO stream_entries (
                user_id, id, content, entry_type, timestamp, date_key, role_id, extracted_task_id,
                tags, attachments, version, deleted_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(user_id, id) DO UPDATE SET
                content=excluded.content, entry_type=excluded.entry_type, timestamp=excluded.timestamp,
                date_key=excluded.date_key, role_id=excluded.role_id, extracted_task_id=excluded.extracted_task_id,
                tags=excluded.tags, attachments=excluded.attachments, version=excluded.version, deleted_at=excluded.deleted_at,
                updated_at=excluded.updated_at"#,
        )
        .bind(user_id)
        .bind(v["id"].as_str().unwrap_or(""))
        .bind(v["content"].as_str().unwrap_or(""))
        .bind(v["entry_type"].as_str().unwrap_or("spark"))
        .bind(v["timestamp"].as_i64().unwrap_or(0))
        .bind(v["date_key"].as_str().unwrap_or(""))
        .bind(v["role_id"].as_str())
        .bind(v["extracted_task_id"].as_str())
        .bind(v["tags"].as_str().unwrap_or("[]"))
        .bind(v["attachments"].as_str().unwrap_or("[]"))
        .bind(next_ver)
        .bind(None::<String>)
        .bind(updated_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn delete_stream_entry_row(&self, user_id: &str, id: &str) -> anyhow::Result<()> {
        let next_ver = bump_version_sqlite(&self.pool).await?;
        sqlx::query(
            "UPDATE stream_entries SET deleted_at = datetime('now'), version = ?
             WHERE user_id = ? AND id = ? AND deleted_at IS NULL",
        )
        .bind(next_ver)
        .bind(user_id)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    // --- User operations ---

    async fn create_user(&self, new_user: &NewUser) -> anyhow::Result<User> {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO users (id, username, password_hash, is_admin, is_enabled)
             VALUES (?, ?, ?, ?, TRUE)",
        )
        .bind(&id)
        .bind(&new_user.username)
        .bind(&new_user.password_hash)
        .bind(new_user.is_admin)
        .execute(&self.pool)
        .await?;

        self.get_user_by_id(&id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Failed to read back created user"))
    }

    async fn get_user_by_username(&self, username: &str) -> anyhow::Result<Option<User>> {
        let row: Option<(String, String, String, bool, bool, String)> = sqlx::query_as(
            "SELECT id, username, password_hash, is_admin, is_enabled, created_at
             FROM users WHERE username = ?",
        )
        .bind(username)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| User {
            id: r.0,
            username: r.1,
            password_hash: r.2,
            is_admin: r.3,
            is_enabled: r.4,
            created_at: r.5,
        }))
    }

    async fn get_user_by_id(&self, id: &str) -> anyhow::Result<Option<User>> {
        let row: Option<(String, String, String, bool, bool, String)> = sqlx::query_as(
            "SELECT id, username, password_hash, is_admin, is_enabled, created_at
             FROM users WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| User {
            id: r.0,
            username: r.1,
            password_hash: r.2,
            is_admin: r.3,
            is_enabled: r.4,
            created_at: r.5,
        }))
    }

    async fn ensure_external_user(
        &self,
        subject: &str,
        username: &str,
        is_admin: bool,
    ) -> anyhow::Result<User> {
        let mut resolved_username = username.trim().to_string();
        if resolved_username.is_empty() {
            resolved_username = subject.to_string();
        }

        if let Some(existing) = self.get_user_by_username(&resolved_username).await? {
            if existing.id != subject {
                resolved_username = format!(
                    "{}#{}",
                    resolved_username,
                    subject.chars().take(6).collect::<String>()
                );
            }
        }

        sqlx::query(
            "INSERT INTO users (id, username, password_hash, is_admin, is_enabled)
             VALUES (?, ?, '', ?, TRUE)
             ON CONFLICT(id) DO UPDATE SET
                username = excluded.username,
                is_admin = excluded.is_admin",
        )
        .bind(subject)
        .bind(&resolved_username)
        .bind(is_admin)
        .execute(&self.pool)
        .await?;

        self.get_user_by_id(subject)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Failed to read back external user"))
    }

    async fn update_user_password(&self, id: &str, password_hash: &str) -> anyhow::Result<()> {
        sqlx::query("UPDATE users SET password_hash = ? WHERE id = ?")
            .bind(password_hash)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn set_user_enabled(&self, id: &str, enabled: bool) -> anyhow::Result<()> {
        sqlx::query("UPDATE users SET is_enabled = ? WHERE id = ?")
            .bind(enabled)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn delete_user(&self, id: &str) -> anyhow::Result<()> {
        sqlx::query("DELETE FROM sessions WHERE user_id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        sqlx::query("DELETE FROM users WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn list_users(&self) -> anyhow::Result<Vec<User>> {
        let rows: Vec<(String, String, String, bool, bool, String)> = sqlx::query_as(
            "SELECT id, username, password_hash, is_admin, is_enabled, created_at
             FROM users ORDER BY created_at",
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| User {
                id: r.0,
                username: r.1,
                password_hash: r.2,
                is_admin: r.3,
                is_enabled: r.4,
                created_at: r.5,
            })
            .collect())
    }

    async fn count_users(&self) -> anyhow::Result<i64> {
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await?;
        Ok(row.0)
    }

    async fn create_session(
        &self,
        user_id: &str,
        token: &str,
        expires_at: Option<&str>,
    ) -> anyhow::Result<SessionRecord> {
        sqlx::query(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
        )
        .bind(token)
        .bind(user_id)
        .bind(expires_at)
        .execute(&self.pool)
        .await?;

        self.get_session(token)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Failed to read back session"))
    }

    async fn get_session(&self, token: &str) -> anyhow::Result<Option<SessionRecord>> {
        let row: Option<(String, String, String, Option<String>)> = sqlx::query_as(
            "SELECT token, user_id, created_at, expires_at FROM sessions WHERE token = ?",
        )
        .bind(token)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| SessionRecord {
            token: r.0,
            user_id: r.1,
            created_at: r.2,
            expires_at: r.3,
        }))
    }

    async fn delete_session(&self, token: &str) -> anyhow::Result<()> {
        sqlx::query("DELETE FROM sessions WHERE token = ?")
            .bind(token)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn delete_sessions_for_user(&self, user_id: &str) -> anyhow::Result<()> {
        sqlx::query("DELETE FROM sessions WHERE user_id = ?")
            .bind(user_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn create_invite(
        &self,
        code: &str,
        created_by: &str,
        expires_at: Option<&str>,
    ) -> anyhow::Result<InviteRecord> {
        sqlx::query(
            "INSERT INTO invites (code, created_by, expires_at) VALUES (?, ?, ?)",
        )
        .bind(code)
        .bind(created_by)
        .bind(expires_at)
        .execute(&self.pool)
        .await?;

        self.get_invite(code)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Failed to read back invite"))
    }

    async fn get_invite(&self, code: &str) -> anyhow::Result<Option<InviteRecord>> {
        let row: Option<(String, String, String, Option<String>, Option<String>, Option<String>)> =
            sqlx::query_as(
                "SELECT code, created_by, created_at, expires_at, consumed_at, consumed_by
                 FROM invites WHERE code = ?",
            )
            .bind(code)
            .fetch_optional(&self.pool)
            .await?;

        Ok(row.map(|r| InviteRecord {
            code: r.0,
            created_by: r.1,
            created_at: r.2,
            expires_at: r.3,
            consumed_at: r.4,
            consumed_by: r.5,
        }))
    }

    async fn consume_invite(&self, code: &str, consumed_by: &str) -> anyhow::Result<()> {
        sqlx::query(
            "UPDATE invites
             SET consumed_at = datetime('now'), consumed_by = ?
             WHERE code = ? AND consumed_at IS NULL",
        )
        .bind(consumed_by)
        .bind(code)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn list_invites(&self) -> anyhow::Result<Vec<InviteRecord>> {
        let rows: Vec<(String, String, String, Option<String>, Option<String>, Option<String>)> =
            sqlx::query_as(
                "SELECT code, created_by, created_at, expires_at, consumed_at, consumed_by
                 FROM invites ORDER BY created_at DESC",
            )
            .fetch_all(&self.pool)
            .await?;

        Ok(rows
            .into_iter()
            .map(|r| InviteRecord {
                code: r.0,
                created_by: r.1,
                created_at: r.2,
                expires_at: r.3,
                consumed_at: r.4,
                consumed_by: r.5,
            })
            .collect())
    }

    // --- Settings operations ---

    async fn get_setting(&self, user_id: &str, key: &str) -> anyhow::Result<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT value FROM settings WHERE user_id = ? AND key = ? AND deleted_at IS NULL",
        )
        .bind(user_id)
        .bind(key)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| r.0))
    }

    async fn put_setting(&self, user_id: &str, key: &str, value: &str) -> anyhow::Result<()> {
        let next_ver = bump_version_sqlite(&self.pool).await?;
        sqlx::query(
            "INSERT INTO settings (user_id, key, value, updated_at, version, deleted_at)
             VALUES (?, ?, ?, datetime('now'), ?, NULL)
             ON CONFLICT(user_id, key) DO UPDATE SET
               value = excluded.value,
               updated_at = datetime('now'),
               version = excluded.version,
               deleted_at = NULL",
        )
        .bind(user_id)
        .bind(key)
        .bind(value)
        .bind(next_ver)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn delete_setting(&self, user_id: &str, key: &str) -> anyhow::Result<()> {
        let next_ver = bump_version_sqlite(&self.pool).await?;
        sqlx::query(
            "UPDATE settings SET deleted_at = datetime('now'), updated_at = datetime('now'), version = ?
             WHERE user_id = ? AND key = ? AND deleted_at IS NULL",
        )
        .bind(next_ver)
        .bind(user_id)
        .bind(key)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn list_settings(&self, user_id: &str) -> anyhow::Result<Vec<(String, String)>> {
        let rows: Vec<(String, String)> = sqlx::query_as(
            "SELECT key, value FROM settings WHERE user_id = ? AND deleted_at IS NULL ORDER BY key",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    // --- Blob metadata operations ---

    async fn put_blob_meta(
        &self,
        id: &str,
        owner: &str,
        filename: &str,
        mime_type: &str,
        size: i64,
    ) -> anyhow::Result<()> {
        let next_ver = bump_version_sqlite(&self.pool).await?;
        sqlx::query(
            "INSERT INTO blobs (id, owner, filename, mime_type, size, version, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL)
             ON CONFLICT(id) DO UPDATE SET
               filename = excluded.filename, mime_type = excluded.mime_type, size = excluded.size,
               version = excluded.version, deleted_at = NULL",
        )
        .bind(id)
        .bind(owner)
        .bind(filename)
        .bind(mime_type)
        .bind(size)
        .bind(next_ver)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get_blob_meta(&self, id: &str) -> anyhow::Result<Option<BlobMeta>> {
        let row: Option<(String, String, String, String, i64, String)> = sqlx::query_as(
            "SELECT id, owner, filename, mime_type, size, created_at
             FROM blobs WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| BlobMeta {
            id: r.0,
            owner: r.1,
            filename: r.2,
            mime_type: r.3,
            size: r.4,
            created_at: r.5,
        }))
    }

    async fn delete_blob_meta(&self, id: &str) -> anyhow::Result<()> {
        let next_ver = bump_version_sqlite(&self.pool).await?;
        sqlx::query(
            "UPDATE blobs SET deleted_at = datetime('now'), version = ?
             WHERE id = ? AND deleted_at IS NULL",
        )
        .bind(next_ver)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn list_blob_metas(&self, owner: &str) -> anyhow::Result<Vec<BlobMeta>> {
        let rows: Vec<(String, String, String, String, i64, String)> = sqlx::query_as(
            "SELECT id, owner, filename, mime_type, size, created_at
             FROM blobs WHERE owner = ? AND deleted_at IS NULL
             ORDER BY created_at DESC",
        )
        .bind(owner)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| BlobMeta {
                id: r.0,
                owner: r.1,
                filename: r.2,
                mime_type: r.3,
                size: r.4,
                created_at: r.5,
            })
            .collect())
    }

    // --- Sync operations ---

    async fn get_changes_since(
        &self,
        user_id: &str,
        since_version: i64,
    ) -> anyhow::Result<Vec<ChangeRecord>> {
        let mut changes = Vec::new();

        let task_rows: Vec<(String, String, i64, i64, Option<String>)> = sqlx::query_as(
            r#"SELECT id,
                json_object(
                    'id', id, 'title', title, 'title_customized', title_customized, 'description', description, 'status', status, 'body', body,
                    'created_at', created_at, 'updated_at', updated_at, 'completed_at', completed_at,
                    'ddl', ddl, 'ddl_type', ddl_type, 'planned_at', planned_at,
                    'role_id', role_id, 'role_ids', role_ids, 'parent_id', parent_id, 'source_stream_id', source_stream_id,
                    'priority', priority, 'promoted', promoted, 'phase', phase, 'kanban_column', kanban_column,
                    'task_type', task_type,
                    'tags', tags, 'subtask_ids', subtask_ids, 'resources', resources,
                    'reminders', reminders, 'submissions', submissions, 'postponements', postponements,
                    'status_history', status_history, 'progress_logs', progress_logs,
                    'version', version, 'deleted_at', deleted_at
                ),
                version, updated_at, deleted_at
                FROM tasks WHERE user_id = ? AND version > ? ORDER BY version"#,
        )
        .bind(user_id)
        .bind(since_version)
        .fetch_all(&self.pool)
        .await?;

        for r in task_rows {
            changes.push(ChangeRecord {
                table: "tasks".into(),
                key: r.0,
                data: if r.4.is_some() { None } else { Some(r.1) },
                version: r.2,
                updated_at: r.3.to_string(),
                deleted_at: r.4,
            });
        }

        let stream_rows: Vec<(String, String, i64, i64, Option<String>)> = sqlx::query_as(
            r#"SELECT id,
                json_object(
                    'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', timestamp,
                    'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                    'tags', tags, 'attachments', attachments, 'version', version, 'deleted_at', deleted_at,
                    'updated_at', COALESCE(updated_at, timestamp)
                ),
                version,
                COALESCE(updated_at, timestamp),
                deleted_at
                FROM stream_entries WHERE user_id = ? AND version > ? ORDER BY version"#,
        )
        .bind(user_id)
        .bind(since_version)
        .fetch_all(&self.pool)
        .await?;

        for r in stream_rows {
            changes.push(ChangeRecord {
                table: "stream_entries".into(),
                key: r.0,
                data: if r.4.is_some() { None } else { Some(r.1) },
                version: r.2,
                updated_at: r.3.to_string(),
                deleted_at: r.4,
            });
        }

        let setting_rows: Vec<(String, Option<String>, i64, String, Option<String>)> =
            sqlx::query_as(
                "SELECT key, value, version, updated_at, deleted_at
             FROM settings WHERE user_id = ? AND version > ? ORDER BY version",
            )
            .bind(user_id)
            .bind(since_version)
            .fetch_all(&self.pool)
            .await?;

        for r in setting_rows {
            let payload = r.1.as_ref().map(|val| {
                serde_json::json!({
                    "key": r.0,
                    "value": val,
                    "version": r.2,
                })
                .to_string()
            });
            changes.push(ChangeRecord {
                table: "settings".into(),
                key: r.0.clone(),
                data: if r.4.is_some() { None } else { payload },
                version: r.2,
                updated_at: r.3,
                deleted_at: r.4,
            });
        }

        let blob_rows: Vec<(String, i64, String, Option<String>)> = sqlx::query_as(
            "SELECT id, version, created_at, deleted_at
             FROM blobs WHERE owner = ? AND version > ? ORDER BY version",
        )
        .bind(user_id)
        .bind(since_version)
        .fetch_all(&self.pool)
        .await?;

        for r in blob_rows {
            changes.push(ChangeRecord {
                table: "blobs".into(),
                key: r.0.clone(),
                data: None,
                version: r.1,
                updated_at: r.2,
                deleted_at: r.3,
            });
        }

        changes.sort_by_key(|c| c.version);
        Ok(changes)
    }

    async fn get_max_version(&self) -> anyhow::Result<i64> {
        let row: (i64,) = sqlx::query_as("SELECT current_version FROM version_seq WHERE id = 1")
            .fetch_one(&self.pool)
            .await
            .unwrap_or((0,));
        Ok(row.0)
    }

    async fn get_max_version_for_user(&self, user_id: &str) -> anyhow::Result<i64> {
        let row: (i64,) = sqlx::query_as(
            r#"SELECT COALESCE(MAX(v), 0) FROM (
                SELECT version AS v FROM tasks WHERE user_id = ?
                UNION ALL
                SELECT version FROM stream_entries WHERE user_id = ?
                UNION ALL
                SELECT version FROM settings WHERE user_id = ?
                UNION ALL
                SELECT version FROM blobs WHERE owner = ?
            )"#,
        )
        .bind(user_id)
        .bind(user_id)
        .bind(user_id)
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0)
    }

    async fn apply_remote_change(
        &self,
        user_id: &str,
        change: &ChangeRecord,
    ) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;
        apply_remote_change_tx(&mut tx, user_id, change).await?;
        tx.commit().await?;
        Ok(())
    }

    async fn apply_remote_changes_batch(
        &self,
        user_id: &str,
        changes: &[ChangeRecord],
    ) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;
        for change in changes {
            apply_remote_change_tx(&mut tx, user_id, change).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    // --- Lifecycle ---

    async fn close(&self) -> anyhow::Result<()> {
        self.pool.close().await;
        Ok(())
    }
}
