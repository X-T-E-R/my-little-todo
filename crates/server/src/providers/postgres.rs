use async_trait::async_trait;
use sqlx::Postgres;
use sqlx::postgres::{PgPool, PgPoolOptions};

use super::traits::{BlobMeta, ChangeRecord, DatabaseProvider, NewUser, User};

async fn bump_version_pg<'e, E: sqlx::Executor<'e, Database = Postgres>>(e: E) -> anyhow::Result<i64> {
    let row: (i64,) = sqlx::query_as(
        "UPDATE version_seq SET current_version = current_version + 1 WHERE id = 1 RETURNING current_version",
    )
    .fetch_one(e)
    .await?;
    Ok(row.0)
}

async fn upsert_task_json_tx(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    json: &str,
) -> anyhow::Result<()> {
    let v: serde_json::Value = serde_json::from_str(json)?;
    let next_ver = bump_version_pg(&mut **tx).await?;
    sqlx::query(
        r#"INSERT INTO tasks (
                user_id, id, title, description, status, body, created_at, updated_at, completed_at,
                ddl, ddl_type, planned_at, role_id, parent_id, source_stream_id, priority, promoted, phase, kanban_column,
                tags, subtask_ids, resources, reminders, submissions, postponements, status_history, progress_logs,
                version, deleted_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
            ON CONFLICT(user_id, id) DO UPDATE SET
                title=EXCLUDED.title, description=EXCLUDED.description, status=EXCLUDED.status, body=EXCLUDED.body,
                created_at=EXCLUDED.created_at, updated_at=EXCLUDED.updated_at, completed_at=EXCLUDED.completed_at,
                ddl=EXCLUDED.ddl, ddl_type=EXCLUDED.ddl_type, planned_at=EXCLUDED.planned_at,
                role_id=EXCLUDED.role_id, parent_id=EXCLUDED.parent_id, source_stream_id=EXCLUDED.source_stream_id,
                priority=EXCLUDED.priority, promoted=EXCLUDED.promoted, phase=EXCLUDED.phase, kanban_column=EXCLUDED.kanban_column,
                tags=EXCLUDED.tags, subtask_ids=EXCLUDED.subtask_ids, resources=EXCLUDED.resources,
                reminders=EXCLUDED.reminders, submissions=EXCLUDED.submissions, postponements=EXCLUDED.postponements,
                status_history=EXCLUDED.status_history, progress_logs=EXCLUDED.progress_logs,
                version=EXCLUDED.version, deleted_at=EXCLUDED.deleted_at"#,
    )
    .bind(user_id)
    .bind(v["id"].as_str().unwrap_or(""))
    .bind(v["title"].as_str().unwrap_or(""))
    .bind(v["description"].as_str())
    .bind(v["status"].as_str().unwrap_or("inbox"))
    .bind(v["body"].as_str().unwrap_or(""))
    .bind(v["created_at"].as_i64().unwrap_or(0))
    .bind(v["updated_at"].as_i64().unwrap_or(0))
    .bind(v["completed_at"].as_i64())
    .bind(v["ddl"].as_i64())
    .bind(v["ddl_type"].as_str())
    .bind(v["planned_at"].as_i64())
    .bind(v["role_id"].as_str())
    .bind(v["parent_id"].as_str())
    .bind(v["source_stream_id"].as_str())
    .bind(v["priority"].as_f64())
    .bind(v["promoted"].as_i64())
    .bind(v["phase"].as_str())
    .bind(v["kanban_column"].as_str())
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
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    json: &str,
) -> anyhow::Result<()> {
    let v: serde_json::Value = serde_json::from_str(json)?;
    let next_ver = bump_version_pg(&mut **tx).await?;
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
                user_id, id, content, entry_type, "timestamp", date_key, role_id, extracted_task_id,
                tags, attachments, version, deleted_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            ON CONFLICT(user_id, id) DO UPDATE SET
                content=EXCLUDED.content, entry_type=EXCLUDED.entry_type, "timestamp"=EXCLUDED."timestamp",
                date_key=EXCLUDED.date_key, role_id=EXCLUDED.role_id, extracted_task_id=EXCLUDED.extracted_task_id,
                tags=EXCLUDED.tags, attachments=EXCLUDED.attachments, version=EXCLUDED.version, deleted_at=EXCLUDED.deleted_at,
                updated_at=EXCLUDED.updated_at"#,
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
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    change: &ChangeRecord,
) -> anyhow::Result<()> {
    match change.table.as_str() {
        "tasks" => {
            if change.deleted_at.is_some() {
                let next_ver = bump_version_pg(&mut **tx).await?;
                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);
                sqlx::query(
                    "UPDATE tasks SET deleted_at = NOW()::text, updated_at = $1, version = $2
                     WHERE user_id = $3 AND id = $4 AND deleted_at IS NULL",
                )
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
                let next_ver = bump_version_pg(&mut **tx).await?;
                sqlx::query(
                    "UPDATE stream_entries SET deleted_at = NOW()::text, version = $1
                     WHERE user_id = $2 AND id = $3 AND deleted_at IS NULL",
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
                let next_ver = bump_version_pg(&mut **tx).await?;
                sqlx::query(
                    "UPDATE settings SET deleted_at = NOW()::text, updated_at = NOW(), version = $1
                     WHERE user_id = $2 AND key = $3 AND deleted_at IS NULL",
                )
                .bind(next_ver)
                .bind(user_id)
                .bind(&change.key)
                .execute(&mut **tx)
                .await?;
            } else if let Some(data) = &change.data {
                let v: serde_json::Value = serde_json::from_str(data)?;
                let value = v["value"].as_str().unwrap_or("");
                let next_ver = bump_version_pg(&mut **tx).await?;
                sqlx::query(
                    r#"INSERT INTO settings (user_id, key, value, updated_at, version, deleted_at)
                     VALUES ($1, $2, $3, NOW(), $4, NULL)
                     ON CONFLICT(user_id, key) DO UPDATE SET
                       value = EXCLUDED.value,
                       updated_at = NOW(),
                       version = EXCLUDED.version,
                       deleted_at = NULL"#,
                )
                .bind(user_id)
                .bind(&change.key)
                .bind(value)
                .bind(next_ver)
                .execute(&mut **tx)
                .await?;
            }
        }
        "blobs" => {}
        _ => {}
    }
    Ok(())
}

pub struct PostgresProvider {
    pool: PgPool,
}

/// Schema migrations: 1=initial, 2=blobs, 3=sync columns+version_seq, 4=tasks+stream_entries, 5=stream updated_at
const CURRENT_SCHEMA_VERSION: i64 = 5;

impl PostgresProvider {
    pub async fn new(database_url: &str) -> anyhow::Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )",
        )
        .execute(&pool)
        .await?;

        let current_version: i64 = sqlx::query_as::<_, (i64,)>(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        )
        .fetch_one(&pool)
        .await
        .map(|r| r.0)
        .unwrap_or(0);

        if current_version < 1 {
            sqlx::query(
                "CREATE TABLE IF NOT EXISTS files (
                    path TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )",
            )
            .execute(&pool)
            .await?;

            sqlx::query(
                "CREATE TABLE IF NOT EXISTS settings (
                    user_id TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (user_id, key)
                )",
            )
            .execute(&pool)
            .await?;

            sqlx::query("CREATE INDEX IF NOT EXISTS idx_files_updated ON files (updated_at)")
                .execute(&pool)
                .await?;
            sqlx::query("CREATE INDEX IF NOT EXISTS idx_settings_user ON settings (user_id)")
                .execute(&pool)
                .await?;

            sqlx::query("INSERT INTO schema_version (version) VALUES (1) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        if current_version < 2 {
            sqlx::query(
                "CREATE TABLE IF NOT EXISTS blobs (
                    id TEXT PRIMARY KEY,
                    owner TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
                    size BIGINT NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )",
            )
            .execute(&pool)
            .await?;

            sqlx::query("CREATE INDEX IF NOT EXISTS idx_blobs_owner ON blobs (owner)")
                .execute(&pool)
                .await?;

            sqlx::query("INSERT INTO schema_version (version) VALUES (2) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        if current_version < 3 {
            sqlx::query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS deleted_at TEXT")
                .execute(&pool)
                .await?;
            sqlx::query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0")
                .execute(&pool)
                .await?;

            sqlx::query("ALTER TABLE blobs ADD COLUMN IF NOT EXISTS deleted_at TEXT")
                .execute(&pool)
                .await?;
            sqlx::query("ALTER TABLE blobs ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0")
                .execute(&pool)
                .await?;

            sqlx::query(
                "CREATE TABLE IF NOT EXISTS version_seq (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    current_version BIGINT NOT NULL DEFAULT 0
                )",
            )
            .execute(&pool)
            .await?;
            sqlx::query(
                "INSERT INTO version_seq (id, current_version) VALUES (1, 0) ON CONFLICT (id) DO NOTHING",
            )
            .execute(&pool)
            .await?;

            sqlx::query("CREATE INDEX IF NOT EXISTS idx_settings_version ON settings (version)")
                .execute(&pool)
                .await?;
            sqlx::query("CREATE INDEX IF NOT EXISTS idx_blobs_version ON blobs (version)")
                .execute(&pool)
                .await?;

            sqlx::query("INSERT INTO schema_version (version) VALUES (3) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        if current_version < 4 {
            sqlx::query(
                "CREATE TABLE IF NOT EXISTS tasks (
                    user_id TEXT NOT NULL,
                    id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    status TEXT NOT NULL DEFAULT 'inbox',
                    body TEXT NOT NULL DEFAULT '',
                    created_at BIGINT NOT NULL,
                    updated_at BIGINT NOT NULL,
                    completed_at BIGINT,
                    ddl BIGINT,
                    ddl_type TEXT,
                    planned_at BIGINT,
                    role_id TEXT,
                    parent_id TEXT,
                    source_stream_id TEXT,
                    priority DOUBLE PRECISION,
                    promoted BIGINT,
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
                    version BIGINT NOT NULL DEFAULT 0,
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
                    \"timestamp\" BIGINT NOT NULL,
                    date_key TEXT NOT NULL,
                    role_id TEXT,
                    extracted_task_id TEXT,
                    tags TEXT NOT NULL DEFAULT '[]',
                    attachments TEXT NOT NULL DEFAULT '[]',
                    version BIGINT NOT NULL DEFAULT 0,
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

            sqlx::query("INSERT INTO schema_version (version) VALUES (4) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        if current_version < 5 {
            sqlx::query("ALTER TABLE stream_entries ADD COLUMN IF NOT EXISTS updated_at BIGINT")
                .execute(&pool)
                .await?;
            sqlx::query(r#"UPDATE stream_entries SET updated_at = "timestamp" WHERE updated_at IS NULL"#)
                .execute(&pool)
                .await?;
            sqlx::query("INSERT INTO schema_version (version) VALUES (5) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        let _ = CURRENT_SCHEMA_VERSION;
        Ok(Self { pool })
    }
}

#[async_trait]
impl DatabaseProvider for PostgresProvider {
    async fn list_tasks_json(&self, user_id: &str) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"SELECT json_build_object(
                'id', id, 'title', title, 'description', description, 'status', status, 'body', body,
                'created_at', created_at, 'updated_at', updated_at, 'completed_at', completed_at,
                'ddl', ddl, 'ddl_type', ddl_type, 'planned_at', planned_at,
                'role_id', role_id, 'parent_id', parent_id, 'source_stream_id', source_stream_id,
                'priority', priority, 'promoted', promoted, 'phase', phase, 'kanban_column', kanban_column,
                'tags', tags, 'subtask_ids', subtask_ids, 'resources', resources,
                'reminders', reminders, 'submissions', submissions, 'postponements', postponements,
                'status_history', status_history, 'progress_logs', progress_logs,
                'version', version, 'deleted_at', deleted_at
            )::text FROM tasks WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC"#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn get_task_json(&self, user_id: &str, id: &str) -> anyhow::Result<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as(
            r#"SELECT json_build_object(
                'id', id, 'title', title, 'description', description, 'status', status, 'body', body,
                'created_at', created_at, 'updated_at', updated_at, 'completed_at', completed_at,
                'ddl', ddl, 'ddl_type', ddl_type, 'planned_at', planned_at,
                'role_id', role_id, 'parent_id', parent_id, 'source_stream_id', source_stream_id,
                'priority', priority, 'promoted', promoted, 'phase', phase, 'kanban_column', kanban_column,
                'tags', tags, 'subtask_ids', subtask_ids, 'resources', resources,
                'reminders', reminders, 'submissions', submissions, 'postponements', postponements,
                'status_history', status_history, 'progress_logs', progress_logs,
                'version', version, 'deleted_at', deleted_at
            )::text FROM tasks WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        )
        .bind(user_id)
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| r.0))
    }

    async fn upsert_task_json(&self, user_id: &str, json: &str) -> anyhow::Result<()> {
        let v: serde_json::Value = serde_json::from_str(json)?;
        let next_ver = bump_version_pg(&self.pool).await?;
        sqlx::query(
            r#"INSERT INTO tasks (
                user_id, id, title, description, status, body, created_at, updated_at, completed_at,
                ddl, ddl_type, planned_at, role_id, parent_id, source_stream_id, priority, promoted, phase, kanban_column,
                tags, subtask_ids, resources, reminders, submissions, postponements, status_history, progress_logs,
                version, deleted_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
            ON CONFLICT(user_id, id) DO UPDATE SET
                title=EXCLUDED.title, description=EXCLUDED.description, status=EXCLUDED.status, body=EXCLUDED.body,
                created_at=EXCLUDED.created_at, updated_at=EXCLUDED.updated_at, completed_at=EXCLUDED.completed_at,
                ddl=EXCLUDED.ddl, ddl_type=EXCLUDED.ddl_type, planned_at=EXCLUDED.planned_at,
                role_id=EXCLUDED.role_id, parent_id=EXCLUDED.parent_id, source_stream_id=EXCLUDED.source_stream_id,
                priority=EXCLUDED.priority, promoted=EXCLUDED.promoted, phase=EXCLUDED.phase, kanban_column=EXCLUDED.kanban_column,
                tags=EXCLUDED.tags, subtask_ids=EXCLUDED.subtask_ids, resources=EXCLUDED.resources,
                reminders=EXCLUDED.reminders, submissions=EXCLUDED.submissions, postponements=EXCLUDED.postponements,
                status_history=EXCLUDED.status_history, progress_logs=EXCLUDED.progress_logs,
                version=EXCLUDED.version, deleted_at=EXCLUDED.deleted_at"#,
        )
        .bind(user_id)
        .bind(v["id"].as_str().unwrap_or(""))
        .bind(v["title"].as_str().unwrap_or(""))
        .bind(v["description"].as_str())
        .bind(v["status"].as_str().unwrap_or("inbox"))
        .bind(v["body"].as_str().unwrap_or(""))
        .bind(v["created_at"].as_i64().unwrap_or(0))
        .bind(v["updated_at"].as_i64().unwrap_or(0))
        .bind(v["completed_at"].as_i64())
        .bind(v["ddl"].as_i64())
        .bind(v["ddl_type"].as_str())
        .bind(v["planned_at"].as_i64())
        .bind(v["role_id"].as_str())
        .bind(v["parent_id"].as_str())
        .bind(v["source_stream_id"].as_str())
        .bind(v["priority"].as_f64())
        .bind(v["promoted"].as_i64())
        .bind(v["phase"].as_str())
        .bind(v["kanban_column"].as_str())
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
        let next_ver = bump_version_pg(&self.pool).await?;
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        sqlx::query(
            "UPDATE tasks SET deleted_at = NOW()::text, updated_at = $1, version = $2
             WHERE user_id = $3 AND id = $4 AND deleted_at IS NULL",
        )
        .bind(now_ms)
        .bind(next_ver)
        .bind(user_id)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn list_stream_day_json(&self, user_id: &str, date_key: &str) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"SELECT json_build_object(
                'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', "timestamp",
                'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                'tags', tags, 'attachments', attachments, 'version', version, 'deleted_at', deleted_at,
                'updated_at', COALESCE(updated_at, "timestamp")
            )::text FROM stream_entries WHERE user_id = $1 AND date_key = $2 AND deleted_at IS NULL ORDER BY "timestamp" ASC"#,
        )
        .bind(user_id)
        .bind(date_key)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn list_stream_recent_json(&self, user_id: &str, days: i32) -> anyhow::Result<Vec<String>> {
        let d = days.max(1);
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"SELECT json_build_object(
                'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', "timestamp",
                'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                'tags', tags, 'attachments', attachments, 'version', version, 'deleted_at', deleted_at,
                'updated_at', COALESCE(updated_at, "timestamp")
            )::text FROM stream_entries WHERE user_id = $1 AND deleted_at IS NULL
            AND date_key::date >= (CURRENT_DATE - $2::integer) ORDER BY "timestamp" DESC"#,
        )
        .bind(user_id)
        .bind(d as i64)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn list_stream_date_keys(&self, user_id: &str) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT DISTINCT date_key FROM stream_entries WHERE user_id = $1 AND deleted_at IS NULL ORDER BY date_key DESC",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn list_all_stream_json(&self, user_id: &str) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"SELECT json_build_object(
                'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', "timestamp",
                'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                'tags', tags, 'attachments', attachments, 'version', version, 'deleted_at', deleted_at,
                'updated_at', COALESCE(updated_at, "timestamp")
            )::text FROM stream_entries WHERE user_id = $1 AND deleted_at IS NULL
            ORDER BY date_key DESC, "timestamp" DESC"#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn upsert_stream_entry_json(&self, user_id: &str, json: &str) -> anyhow::Result<()> {
        let v: serde_json::Value = serde_json::from_str(json)?;
        let next_ver = bump_version_pg(&self.pool).await?;
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
                user_id, id, content, entry_type, "timestamp", date_key, role_id, extracted_task_id,
                tags, attachments, version, deleted_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            ON CONFLICT(user_id, id) DO UPDATE SET
                content=EXCLUDED.content, entry_type=EXCLUDED.entry_type, "timestamp"=EXCLUDED."timestamp",
                date_key=EXCLUDED.date_key, role_id=EXCLUDED.role_id, extracted_task_id=EXCLUDED.extracted_task_id,
                tags=EXCLUDED.tags, attachments=EXCLUDED.attachments, version=EXCLUDED.version, deleted_at=EXCLUDED.deleted_at,
                updated_at=EXCLUDED.updated_at"#,
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
        let next_ver = bump_version_pg(&self.pool).await?;
        sqlx::query(
            "UPDATE stream_entries SET deleted_at = NOW()::text, version = $1
             WHERE user_id = $2 AND id = $3 AND deleted_at IS NULL",
        )
        .bind(next_ver)
        .bind(user_id)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn get_user_by_username(&self, username: &str) -> anyhow::Result<Option<User>> {
        let row: Option<(String, String, String, bool, String)> = sqlx::query_as(
            "SELECT id, username, password_hash, is_admin, created_at::text FROM users WHERE username = $1",
        )
        .bind(username)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| User {
            id: r.0,
            username: r.1,
            password_hash: r.2,
            is_admin: r.3,
            created_at: r.4,
        }))
    }

    async fn get_user_by_id(&self, id: &str) -> anyhow::Result<Option<User>> {
        let row: Option<(String, String, String, bool, String)> = sqlx::query_as(
            "SELECT id, username, password_hash, is_admin, created_at::text FROM users WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| User {
            id: r.0,
            username: r.1,
            password_hash: r.2,
            is_admin: r.3,
            created_at: r.4,
        }))
    }

    async fn create_user(&self, user: &NewUser) -> anyhow::Result<User> {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO users (id, username, password_hash, is_admin) VALUES ($1, $2, $3, $4)",
        )
        .bind(&id)
        .bind(&user.username)
        .bind(&user.password_hash)
        .bind(user.is_admin)
        .execute(&self.pool)
        .await?;

        self.get_user_by_id(&id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Failed to read back created user"))
    }

    async fn update_user_password(&self, id: &str, password_hash: &str) -> anyhow::Result<()> {
        sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
            .bind(password_hash)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn delete_user(&self, id: &str) -> anyhow::Result<()> {
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn list_users(&self) -> anyhow::Result<Vec<User>> {
        let rows: Vec<(String, String, String, bool, String)> = sqlx::query_as(
            "SELECT id, username, password_hash, is_admin, created_at::text FROM users ORDER BY created_at",
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
                created_at: r.4,
            })
            .collect())
    }

    async fn count_users(&self) -> anyhow::Result<i64> {
        let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await?;
        Ok(row.0)
    }

    async fn get_setting(&self, user_id: &str, key: &str) -> anyhow::Result<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT value FROM settings WHERE user_id = $1 AND key = $2 AND deleted_at IS NULL",
        )
        .bind(user_id)
        .bind(key)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| r.0))
    }

    async fn put_setting(&self, user_id: &str, key: &str, value: &str) -> anyhow::Result<()> {
        let next_ver = bump_version_pg(&self.pool).await?;
        sqlx::query(
            "INSERT INTO settings (user_id, key, value, updated_at, version, deleted_at)
             VALUES ($1, $2, $3, NOW(), $4, NULL)
             ON CONFLICT(user_id, key) DO UPDATE SET
               value = EXCLUDED.value,
               updated_at = NOW(),
               version = EXCLUDED.version,
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
        let next_ver = bump_version_pg(&self.pool).await?;
        sqlx::query(
            "UPDATE settings SET deleted_at = NOW()::text, updated_at = NOW(), version = $1
             WHERE user_id = $2 AND key = $3 AND deleted_at IS NULL",
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
            "SELECT key, value FROM settings WHERE user_id = $1 AND deleted_at IS NULL ORDER BY key",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    async fn put_blob_meta(
        &self,
        id: &str,
        owner: &str,
        filename: &str,
        mime_type: &str,
        size: i64,
    ) -> anyhow::Result<()> {
        let next_ver = bump_version_pg(&self.pool).await?;
        sqlx::query(
            "INSERT INTO blobs (id, owner, filename, mime_type, size, version, deleted_at)
             VALUES ($1, $2, $3, $4, $5, $6, NULL)
             ON CONFLICT(id) DO UPDATE SET
               filename = EXCLUDED.filename, mime_type = EXCLUDED.mime_type, size = EXCLUDED.size,
               version = EXCLUDED.version, deleted_at = NULL",
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
            "SELECT id, owner, filename, mime_type, size, created_at::text
             FROM blobs WHERE id = $1 AND deleted_at IS NULL",
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
        let next_ver = bump_version_pg(&self.pool).await?;
        sqlx::query(
            "UPDATE blobs SET deleted_at = NOW()::text, version = $1
             WHERE id = $2 AND deleted_at IS NULL",
        )
        .bind(next_ver)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn list_blob_metas(&self, owner: &str) -> anyhow::Result<Vec<BlobMeta>> {
        let rows: Vec<(String, String, String, String, i64, String)> = sqlx::query_as(
            "SELECT id, owner, filename, mime_type, size, created_at::text
             FROM blobs WHERE owner = $1 AND deleted_at IS NULL
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

    async fn get_changes_since(&self, user_id: &str, since_version: i64) -> anyhow::Result<Vec<ChangeRecord>> {
        let mut changes = Vec::new();

        let task_rows: Vec<(String, String, i64, i64, Option<String>)> = sqlx::query_as(
            r#"SELECT id,
                json_build_object(
                    'id', id, 'title', title, 'description', description, 'status', status, 'body', body,
                    'created_at', created_at, 'updated_at', updated_at, 'completed_at', completed_at,
                    'ddl', ddl, 'ddl_type', ddl_type, 'planned_at', planned_at,
                    'role_id', role_id, 'parent_id', parent_id, 'source_stream_id', source_stream_id,
                    'priority', priority, 'promoted', promoted, 'phase', phase, 'kanban_column', kanban_column,
                    'tags', tags, 'subtask_ids', subtask_ids, 'resources', resources,
                    'reminders', reminders, 'submissions', submissions, 'postponements', postponements,
                    'status_history', status_history, 'progress_logs', progress_logs,
                    'version', version, 'deleted_at', deleted_at
                )::text,
                version, updated_at, deleted_at
                FROM tasks WHERE user_id = $1 AND version > $2 ORDER BY version"#,
        )
        .bind(user_id)
        .bind(since_version)
        .fetch_all(&self.pool)
        .await?;

        for r in task_rows {
            changes.push(ChangeRecord {
                table: "tasks".into(),
                key: r.0,
                data: if r.4.is_some() {
                    None
                } else {
                    Some(r.1)
                },
                version: r.2,
                updated_at: r.3.to_string(),
                deleted_at: r.4,
            });
        }

        let stream_rows: Vec<(String, String, i64, i64, Option<String>)> = sqlx::query_as(
            r#"SELECT id,
                json_build_object(
                    'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', "timestamp",
                    'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                    'tags', tags, 'attachments', attachments, 'version', version, 'deleted_at', deleted_at,
                    'updated_at', COALESCE(updated_at, "timestamp")
                )::text,
                version,
                COALESCE(updated_at, "timestamp"),
                deleted_at
                FROM stream_entries WHERE user_id = $1 AND version > $2 ORDER BY version"#,
        )
        .bind(user_id)
        .bind(since_version)
        .fetch_all(&self.pool)
        .await?;

        for r in stream_rows {
            changes.push(ChangeRecord {
                table: "stream_entries".into(),
                key: r.0,
                data: if r.4.is_some() {
                    None
                } else {
                    Some(r.1)
                },
                version: r.2,
                updated_at: r.3.to_string(),
                deleted_at: r.4,
            });
        }

        let setting_rows: Vec<(String, Option<String>, i64, String, Option<String>)> = sqlx::query_as(
            "SELECT key, value, version, updated_at::text, deleted_at
             FROM settings WHERE user_id = $1 AND version > $2 ORDER BY version",
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
            "SELECT id, version, created_at::text, deleted_at
             FROM blobs WHERE owner = $1 AND version > $2 ORDER BY version",
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
                SELECT version AS v FROM tasks WHERE user_id = $1
                UNION ALL
                SELECT version FROM stream_entries WHERE user_id = $1
                UNION ALL
                SELECT version FROM settings WHERE user_id = $1
                UNION ALL
                SELECT version FROM blobs WHERE owner = $1
            ) AS t"#,
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0)
    }

    async fn apply_remote_change(&self, user_id: &str, change: &ChangeRecord) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;
        apply_remote_change_tx(&mut tx, user_id, change).await?;
        tx.commit().await?;
        Ok(())
    }

    async fn apply_remote_changes_batch(&self, user_id: &str, changes: &[ChangeRecord]) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;
        for change in changes {
            apply_remote_change_tx(&mut tx, user_id, change).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    async fn close(&self) -> anyhow::Result<()> {
        self.pool.close().await;
        Ok(())
    }
}
