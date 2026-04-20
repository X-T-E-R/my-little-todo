use async_trait::async_trait;
use sqlx::postgres::{PgPool, PgPoolOptions};
use sqlx::Postgres;

use crate::history_audit::{
    build_history_summary, hydrate_task_revision_snapshot_json, sanitize_history_snapshot_json,
};
use crate::history_context::{current_history_group_id, new_history_group_id};

use super::traits::{
    AuditEventRecord, BlobMeta, ChangeRecord, DatabaseProvider, EntityRevisionRecord, InviteRecord,
    NewUser, SessionRecord, User,
};

async fn bump_version_pg<'e, E: sqlx::Executor<'e, Database = Postgres>>(
    e: E,
) -> anyhow::Result<i64> {
    let row: (i64,) = sqlx::query_as(
        "UPDATE version_seq SET current_version = current_version + 1 WHERE id = 1 RETURNING current_version",
    )
    .fetch_one(e)
    .await?;
    Ok(row.0)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

async fn insert_history_pg_tx(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    entity_type: &str,
    entity_id: &str,
    entity_version: i64,
    global_version: i64,
    action: &str,
    op: &str,
    changed_at: i64,
    snapshot_json: &str,
) -> anyhow::Result<()> {
    let group_id = current_history_group_id().unwrap_or_else(new_history_group_id);
    let sanitized_snapshot_json = sanitize_history_snapshot_json(entity_type, snapshot_json);
    let event_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO audit_events (
            id, group_id, user_id, entity_type, entity_id, entity_version, global_version,
            action, source_kind, actor_type, actor_id, occurred_at, summary_json
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
    )
    .bind(&event_id)
    .bind(&group_id)
    .bind(user_id)
    .bind(entity_type)
    .bind(entity_id)
    .bind(entity_version)
    .bind(global_version)
    .bind(action)
    .bind("server-api")
    .bind("user")
    .bind(user_id)
    .bind(changed_at)
    .bind(build_history_summary(entity_type, &sanitized_snapshot_json))
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        "INSERT INTO entity_revisions (
            id, event_id, group_id, user_id, entity_type, entity_id, entity_version,
            global_version, op, changed_at, snapshot_json
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(event_id)
    .bind(group_id)
    .bind(user_id)
    .bind(entity_type)
    .bind(entity_id)
    .bind(entity_version)
    .bind(global_version)
    .bind(op)
    .bind(changed_at)
    .bind(sanitized_snapshot_json)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn upsert_task_json_tx(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    json: &str,
) -> anyhow::Result<()> {
    let mut v: serde_json::Value = serde_json::from_str(json)?;
    let next_ver = bump_version_pg(&mut **tx).await?;
    let updated_at = v["updated_at"].as_i64().unwrap_or(0);
    let entity_id = v["id"].as_str().unwrap_or("").to_string();
    sqlx::query(
        r#"INSERT INTO tasks (
                user_id, id, title, title_customized, description, status, body, created_at, updated_at, completed_at,
                ddl, ddl_type, planned_at, role_id, role_ids, parent_id, source_stream_id, priority, promoted, phase, kanban_column,
                task_type,
                tags, subtask_ids, resources, reminders, submissions, postponements, status_history, progress_logs,
                version, deleted_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
            ON CONFLICT(user_id, id) DO UPDATE SET
                title=EXCLUDED.title, title_customized=EXCLUDED.title_customized, description=EXCLUDED.description, status=EXCLUDED.status, body=EXCLUDED.body,
                created_at=EXCLUDED.created_at, updated_at=EXCLUDED.updated_at, completed_at=EXCLUDED.completed_at,
                ddl=EXCLUDED.ddl, ddl_type=EXCLUDED.ddl_type, planned_at=EXCLUDED.planned_at,
                role_id=EXCLUDED.role_id, role_ids=EXCLUDED.role_ids, parent_id=EXCLUDED.parent_id, source_stream_id=EXCLUDED.source_stream_id,
                priority=EXCLUDED.priority, promoted=EXCLUDED.promoted, phase=EXCLUDED.phase, kanban_column=EXCLUDED.kanban_column,
                task_type=EXCLUDED.task_type,
                tags=EXCLUDED.tags, subtask_ids=EXCLUDED.subtask_ids, resources=EXCLUDED.resources,
                reminders=EXCLUDED.reminders, submissions=EXCLUDED.submissions, postponements=EXCLUDED.postponements,
                status_history=EXCLUDED.status_history, progress_logs=EXCLUDED.progress_logs,
                version=EXCLUDED.version, deleted_at=EXCLUDED.deleted_at"#,
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
    if let Some(obj) = v.as_object_mut() {
        obj.insert("version".into(), serde_json::json!(next_ver));
        obj.insert("deleted_at".into(), serde_json::Value::Null);
        obj.insert("user_id".into(), serde_json::json!(user_id));
    }
    insert_history_pg_tx(
        tx,
        user_id,
        "tasks",
        &entity_id,
        next_ver,
        next_ver,
        "upsert_task",
        "upsert",
        updated_at,
        &v.to_string(),
    )
    .await?;
    Ok(())
}

async fn upsert_stream_entry_json_tx(
    tx: &mut sqlx::Transaction<'_, Postgres>,
    user_id: &str,
    json: &str,
) -> anyhow::Result<()> {
    let mut v: serde_json::Value = serde_json::from_str(json)?;
    let next_ver = bump_version_pg(&mut **tx).await?;
    let now_ms = now_ms();
    let updated_at = v
        .get("updated_at")
        .and_then(|x| x.as_i64())
        .unwrap_or(now_ms);
    let entity_id = v["id"].as_str().unwrap_or("").to_string();
    sqlx::query(
        r#"INSERT INTO stream_entries (
                user_id, id, content, entry_type, "timestamp", date_key, role_id, extracted_task_id,
                tags, attachments, thread_meta, version, deleted_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            ON CONFLICT(user_id, id) DO UPDATE SET
                content=EXCLUDED.content, entry_type=EXCLUDED.entry_type, "timestamp"=EXCLUDED."timestamp",
                date_key=EXCLUDED.date_key, role_id=EXCLUDED.role_id, extracted_task_id=EXCLUDED.extracted_task_id,
                tags=EXCLUDED.tags, attachments=EXCLUDED.attachments, thread_meta=EXCLUDED.thread_meta, version=EXCLUDED.version, deleted_at=EXCLUDED.deleted_at,
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
    .bind(v["thread_meta"].as_str())
    .bind(next_ver)
    .bind(None::<String>)
    .bind(updated_at)
    .execute(&mut **tx)
    .await?;
    if let Some(obj) = v.as_object_mut() {
        obj.insert("version".into(), serde_json::json!(next_ver));
        obj.insert("deleted_at".into(), serde_json::Value::Null);
        obj.insert("user_id".into(), serde_json::json!(user_id));
        obj.insert("updated_at".into(), serde_json::json!(updated_at));
    }
    insert_history_pg_tx(
        tx,
        user_id,
        "stream_entries",
        &entity_id,
        next_ver,
        next_ver,
        "upsert_stream_entry",
        "upsert",
        updated_at,
        &v.to_string(),
    )
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
                let now_ms = now_ms();
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
                let row: Option<(String,)> = sqlx::query_as(
                    r#"SELECT json_build_object(
                        'id', id, 'title', title, 'title_customized', title_customized, 'description', description, 'status', status, 'body', body,
                        'created_at', created_at, 'updated_at', updated_at, 'completed_at', completed_at,
                        'ddl', ddl, 'ddl_type', ddl_type, 'planned_at', planned_at,
                        'role_id', role_id, 'role_ids', role_ids, 'parent_id', parent_id, 'source_stream_id', source_stream_id,
                        'priority', priority, 'promoted', promoted, 'phase', phase, 'kanban_column', kanban_column,
                        'task_type', task_type,
                        'tags', tags, 'subtask_ids', subtask_ids, 'resources', resources,
                        'reminders', reminders, 'submissions', submissions, 'postponements', postponements,
                        'status_history', status_history, 'progress_logs', progress_logs,
                        'version', version, 'deleted_at', deleted_at, 'user_id', user_id
                    )::text FROM tasks WHERE user_id = $1 AND id = $2 AND version = $3 LIMIT 1"#,
                )
                .bind(user_id)
                .bind(&change.key)
                .bind(next_ver)
                .fetch_optional(&mut **tx)
                .await?;
                if let Some((snapshot_json,)) = row {
                    insert_history_pg_tx(
                        tx,
                        user_id,
                        "tasks",
                        &change.key,
                        next_ver,
                        next_ver,
                        "delete_task",
                        "delete",
                        now_ms,
                        &snapshot_json,
                    )
                    .await?;
                }
            } else if let Some(data) = &change.data {
                upsert_task_json_tx(tx, user_id, data).await?;
            }
        }
        "stream_entries" => {
            if change.deleted_at.is_some() {
                let next_ver = bump_version_pg(&mut **tx).await?;
                let changed_at = now_ms();
                sqlx::query(
                    "UPDATE stream_entries SET deleted_at = NOW()::text, version = $1
                     WHERE user_id = $2 AND id = $3 AND deleted_at IS NULL",
                )
                .bind(next_ver)
                .bind(user_id)
                .bind(&change.key)
                .execute(&mut **tx)
                .await?;
                let row: Option<(String,)> = sqlx::query_as(
                    r#"SELECT json_build_object(
                        'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', "timestamp",
                        'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                        'tags', tags, 'attachments', attachments, 'thread_meta', thread_meta,
                        'version', version, 'deleted_at', deleted_at, 'updated_at', COALESCE(updated_at, "timestamp"),
                        'user_id', user_id
                    )::text FROM stream_entries WHERE user_id = $1 AND id = $2 AND version = $3 LIMIT 1"#,
                )
                .bind(user_id)
                .bind(&change.key)
                .bind(next_ver)
                .fetch_optional(&mut **tx)
                .await?;
                if let Some((snapshot_json,)) = row {
                    insert_history_pg_tx(
                        tx,
                        user_id,
                        "stream_entries",
                        &change.key,
                        next_ver,
                        next_ver,
                        "delete_stream_entry",
                        "delete",
                        changed_at,
                        &snapshot_json,
                    )
                    .await?;
                }
            } else if let Some(data) = &change.data {
                upsert_stream_entry_json_tx(tx, user_id, data).await?;
            }
        }
        "settings" => {
            if change.deleted_at.is_some() {
                let next_ver = bump_version_pg(&mut **tx).await?;
                let changed_at = now_ms();
                sqlx::query(
                    "UPDATE settings SET deleted_at = NOW()::text, updated_at = NOW(), version = $1
                     WHERE user_id = $2 AND key = $3 AND deleted_at IS NULL",
                )
                .bind(next_ver)
                .bind(user_id)
                .bind(&change.key)
                .execute(&mut **tx)
                .await?;
                let row: Option<(String,)> = sqlx::query_as(
                    r#"SELECT json_build_object(
                        'key', key, 'value', value, 'updated_at', EXTRACT(EPOCH FROM updated_at) * 1000, 'version', version,
                        'deleted_at', deleted_at, 'user_id', user_id
                    )::text FROM settings WHERE user_id = $1 AND key = $2 AND version = $3 LIMIT 1"#,
                )
                .bind(user_id)
                .bind(&change.key)
                .bind(next_ver)
                .fetch_optional(&mut **tx)
                .await?;
                if let Some((snapshot_json,)) = row {
                    insert_history_pg_tx(
                        tx,
                        user_id,
                        "settings",
                        &change.key,
                        next_ver,
                        next_ver,
                        "delete_setting",
                        "delete",
                        changed_at,
                        &snapshot_json,
                    )
                    .await?;
                }
            } else if let Some(data) = &change.data {
                let v: serde_json::Value = serde_json::from_str(data)?;
                let value = v["value"].as_str().unwrap_or("");
                let next_ver = bump_version_pg(&mut **tx).await?;
                let changed_at = now_ms();
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
                let snapshot_json = serde_json::json!({
                    "key": change.key,
                    "value": value,
                    "updated_at": changed_at,
                    "version": next_ver,
                    "deleted_at": serde_json::Value::Null,
                    "user_id": user_id,
                })
                .to_string();
                insert_history_pg_tx(
                    tx,
                    user_id,
                    "settings",
                    &change.key,
                    next_ver,
                    next_ver,
                    "put_setting",
                    "upsert",
                    changed_at,
                    &snapshot_json,
                )
                .await?;
            }
        }
        "blobs" => {
            if change.deleted_at.is_some() {
                let next_ver = bump_version_pg(&mut **tx).await?;
                let changed_at = now_ms();
                sqlx::query(
                    "UPDATE blobs SET deleted_at = NOW()::text, version = $1
                     WHERE owner = $2 AND id = $3 AND deleted_at IS NULL",
                )
                .bind(next_ver)
                .bind(user_id)
                .bind(&change.key)
                .execute(&mut **tx)
                .await?;
                let row: Option<(String,)> = sqlx::query_as(
                    r#"SELECT json_build_object(
                        'id', id, 'owner', owner, 'filename', filename, 'mime_type', mime_type,
                        'size', size, 'created_at', EXTRACT(EPOCH FROM created_at) * 1000,
                        'version', version, 'deleted_at', deleted_at
                    )::text FROM blobs WHERE owner = $1 AND id = $2 AND version = $3 LIMIT 1"#,
                )
                .bind(user_id)
                .bind(&change.key)
                .bind(next_ver)
                .fetch_optional(&mut **tx)
                .await?;
                if let Some((snapshot_json,)) = row {
                    insert_history_pg_tx(
                        tx,
                        user_id,
                        "blobs",
                        &change.key,
                        next_ver,
                        next_ver,
                        "delete_blob",
                        "delete",
                        changed_at,
                        &snapshot_json,
                    )
                    .await?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

pub struct PostgresProvider {
    pool: PgPool,
}

/// Schema migrations: 1=initial, 2=blobs, 3=sync columns+version_seq, 4=tasks+stream_entries, 5=stream updated_at, 6=align, 7=tasks.role_ids, 12=stream thread_meta, 13=history tables, 14=history group_id
const CURRENT_SCHEMA_VERSION: i64 = 14;

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

        let current_version: i64 =
            sqlx::query_as::<_, (i64,)>("SELECT COALESCE(MAX(version), 0) FROM schema_version")
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
            sqlx::query(
                "ALTER TABLE settings ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0",
            )
            .execute(&pool)
            .await?;

            sqlx::query("ALTER TABLE blobs ADD COLUMN IF NOT EXISTS deleted_at TEXT")
                .execute(&pool)
                .await?;
            sqlx::query(
                "ALTER TABLE blobs ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0",
            )
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
                    thread_meta TEXT,
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
            sqlx::query(
                r#"UPDATE stream_entries SET updated_at = "timestamp" WHERE updated_at IS NULL"#,
            )
            .execute(&pool)
            .await?;
            sqlx::query("INSERT INTO schema_version (version) VALUES (5) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        if current_version < 6 {
            sqlx::query("INSERT INTO schema_version (version) VALUES (6) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        if current_version < 7 {
            let has_role_ids: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'role_ids'",
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

            sqlx::query("INSERT INTO schema_version (version) VALUES (7) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        if current_version < 8 {
            let has_title_customized: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'title_customized'",
            )
            .fetch_one(&pool)
            .await
            .map(|r| r.0 > 0)
            .unwrap_or(false);

            if !has_title_customized {
                sqlx::query(
                    "ALTER TABLE tasks ADD COLUMN title_customized BIGINT NOT NULL DEFAULT 0",
                )
                .execute(&pool)
                .await?;
                sqlx::query(
                    "UPDATE tasks SET title_customized = CASE WHEN trim(title) <> '' THEN 1 ELSE 0 END",
                )
                    .execute(&pool)
                    .await?;
            }

            sqlx::query("INSERT INTO schema_version (version) VALUES (8) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        if current_version < 9 {
            sqlx::query(
                "UPDATE tasks SET title_customized = 1 WHERE trim(title) <> '' AND title_customized = 0",
            )
            .execute(&pool)
            .await?;

            sqlx::query("INSERT INTO schema_version (version) VALUES (9) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        if current_version < 10 {
            let has_task_type: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'task_type'",
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

            sqlx::query("INSERT INTO schema_version (version) VALUES (10) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        if current_version < 11 {
            let has_is_enabled: bool = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_enabled'",
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
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at TIMESTAMPTZ
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
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at TIMESTAMPTZ,
                    consumed_at TIMESTAMPTZ,
                    consumed_by TEXT
                )",
            )
            .execute(&pool)
            .await?;

            sqlx::query("INSERT INTO schema_version (version) VALUES (11) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        if current_version < 12 {
            sqlx::query("ALTER TABLE stream_entries ADD COLUMN IF NOT EXISTS thread_meta TEXT")
                .execute(&pool)
                .await?;
            sqlx::query("INSERT INTO schema_version (version) VALUES (12) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        if current_version < 13 {
            sqlx::query(
                "CREATE TABLE IF NOT EXISTS audit_events (
                    id TEXT PRIMARY KEY,
                    group_id TEXT,
                    user_id TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    entity_version BIGINT NOT NULL,
                    global_version BIGINT NOT NULL,
                    action TEXT NOT NULL,
                    source_kind TEXT NOT NULL,
                    actor_type TEXT NOT NULL,
                    actor_id TEXT NOT NULL,
                    occurred_at BIGINT NOT NULL,
                    summary_json TEXT
                )",
            )
            .execute(&pool)
            .await?;
            sqlx::query(
                "CREATE TABLE IF NOT EXISTS entity_revisions (
                    id TEXT PRIMARY KEY,
                    event_id TEXT NOT NULL,
                    group_id TEXT,
                    user_id TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id TEXT NOT NULL,
                    entity_version BIGINT NOT NULL,
                    global_version BIGINT NOT NULL,
                    op TEXT NOT NULL,
                    changed_at BIGINT NOT NULL,
                    snapshot_json TEXT NOT NULL
                )",
            )
            .execute(&pool)
            .await?;
            sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_audit_events_user_time ON audit_events (user_id, occurred_at DESC)",
            )
            .execute(&pool)
            .await?;
            sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events (user_id, entity_type, entity_id, occurred_at DESC)",
            )
            .execute(&pool)
            .await?;
            sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_entity_revisions_user_global ON entity_revisions (user_id, global_version DESC)",
            )
            .execute(&pool)
            .await?;
            sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_entity_revisions_entity ON entity_revisions (user_id, entity_type, entity_id, global_version DESC)",
            )
            .execute(&pool)
            .await?;
            sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_entity_revisions_event ON entity_revisions (event_id)",
            )
            .execute(&pool)
            .await?;
            sqlx::query("INSERT INTO schema_version (version) VALUES (13) ON CONFLICT DO NOTHING")
                .execute(&pool)
                .await?;
        }

        if current_version < 14 {
            sqlx::query("ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS group_id TEXT")
                .execute(&pool)
                .await?;
            sqlx::query("ALTER TABLE entity_revisions ADD COLUMN IF NOT EXISTS group_id TEXT")
                .execute(&pool)
                .await?;
            sqlx::query("INSERT INTO schema_version (version) VALUES (14) ON CONFLICT DO NOTHING")
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
            )::text FROM tasks WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        )
        .bind(user_id)
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| r.0))
    }

    async fn upsert_task_json(&self, user_id: &str, json: &str) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;
        upsert_task_json_tx(&mut tx, user_id, json).await?;
        tx.commit().await?;
        Ok(())
    }

    async fn delete_task_row(&self, user_id: &str, id: &str) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;
        let next_ver = bump_version_pg(&mut *tx).await?;
        let changed_at = now_ms();
        sqlx::query(
            "UPDATE tasks SET deleted_at = NOW()::text, updated_at = $1, version = $2
             WHERE user_id = $3 AND id = $4 AND deleted_at IS NULL",
        )
        .bind(changed_at)
        .bind(next_ver)
        .bind(user_id)
        .bind(id)
        .execute(&mut *tx)
        .await?;
        let row: Option<(String,)> = sqlx::query_as(
            r#"SELECT json_build_object(
                'id', id, 'title', title, 'title_customized', title_customized, 'description', description, 'status', status, 'body', body,
                'created_at', created_at, 'updated_at', updated_at, 'completed_at', completed_at,
                'ddl', ddl, 'ddl_type', ddl_type, 'planned_at', planned_at,
                'role_id', role_id, 'role_ids', role_ids, 'parent_id', parent_id, 'source_stream_id', source_stream_id,
                'priority', priority, 'promoted', promoted, 'phase', phase, 'kanban_column', kanban_column,
                'task_type', task_type,
                'tags', tags, 'subtask_ids', subtask_ids, 'resources', resources,
                'reminders', reminders, 'submissions', submissions, 'postponements', postponements,
                'status_history', status_history, 'progress_logs', progress_logs,
                'version', version, 'deleted_at', deleted_at, 'user_id', user_id
            )::text FROM tasks WHERE user_id = $1 AND id = $2 AND version = $3 LIMIT 1"#,
        )
        .bind(user_id)
        .bind(id)
        .bind(next_ver)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((snapshot_json,)) = row {
            insert_history_pg_tx(
                &mut tx,
                user_id,
                "tasks",
                id,
                next_ver,
                next_ver,
                "delete_task",
                "delete",
                changed_at,
                &snapshot_json,
            )
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    async fn list_stream_day_json(
        &self,
        user_id: &str,
        date_key: &str,
    ) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"SELECT json_build_object(
                'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', "timestamp",
                'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                'tags', tags, 'attachments', attachments, 'thread_meta', thread_meta, 'version', version, 'deleted_at', deleted_at,
                'updated_at', COALESCE(updated_at, "timestamp")
            )::text FROM stream_entries WHERE user_id = $1 AND date_key = $2 AND deleted_at IS NULL ORDER BY "timestamp" ASC"#,
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
        let d = days.max(1);
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"SELECT json_build_object(
                'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', "timestamp",
                'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                'tags', tags, 'attachments', attachments, 'thread_meta', thread_meta, 'version', version, 'deleted_at', deleted_at,
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
                'tags', tags, 'attachments', attachments, 'thread_meta', thread_meta, 'version', version, 'deleted_at', deleted_at,
                'updated_at', COALESCE(updated_at, "timestamp")
            )::text FROM stream_entries WHERE user_id = $1 AND deleted_at IS NULL
            ORDER BY date_key DESC, "timestamp" DESC"#,
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
            r#"SELECT json_build_object(
                'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', "timestamp",
                'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                'tags', tags, 'attachments', attachments, 'thread_meta', thread_meta, 'version', version, 'deleted_at', deleted_at,
                'updated_at', COALESCE(updated_at, "timestamp")
            )::text FROM stream_entries WHERE user_id = $1 AND deleted_at IS NULL
            AND position(lower($2) in lower(content)) > 0
            ORDER BY "timestamp" DESC
            LIMIT $3"#,
        )
        .bind(user_id)
        .bind(needle)
        .bind(lim)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    async fn upsert_stream_entry_json(&self, user_id: &str, json: &str) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;
        upsert_stream_entry_json_tx(&mut tx, user_id, json).await?;
        tx.commit().await?;
        Ok(())
    }

    async fn delete_stream_entry_row(&self, user_id: &str, id: &str) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;
        let next_ver = bump_version_pg(&mut *tx).await?;
        let changed_at = now_ms();
        sqlx::query(
            "UPDATE stream_entries SET deleted_at = NOW()::text, version = $1
             WHERE user_id = $2 AND id = $3 AND deleted_at IS NULL",
        )
        .bind(next_ver)
        .bind(user_id)
        .bind(id)
        .execute(&mut *tx)
        .await?;
        let row: Option<(String,)> = sqlx::query_as(
            r#"SELECT json_build_object(
                'id', id, 'content', content, 'entry_type', entry_type, 'timestamp', "timestamp",
                'date_key', date_key, 'role_id', role_id, 'extracted_task_id', extracted_task_id,
                'tags', tags, 'attachments', attachments, 'thread_meta', thread_meta,
                'version', version, 'deleted_at', deleted_at, 'updated_at', COALESCE(updated_at, "timestamp"),
                'user_id', user_id
            )::text FROM stream_entries WHERE user_id = $1 AND id = $2 AND version = $3 LIMIT 1"#,
        )
        .bind(user_id)
        .bind(id)
        .bind(next_ver)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((snapshot_json,)) = row {
            insert_history_pg_tx(
                &mut tx,
                user_id,
                "stream_entries",
                id,
                next_ver,
                next_ver,
                "delete_stream_entry",
                "delete",
                changed_at,
                &snapshot_json,
            )
            .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    async fn create_user(&self, new_user: &NewUser) -> anyhow::Result<User> {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO users (id, username, password_hash, is_admin, is_enabled)
             VALUES ($1, $2, $3, $4, TRUE)",
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
            "SELECT id, username, password_hash, is_admin, is_enabled, created_at::text
             FROM users WHERE username = $1",
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
            "SELECT id, username, password_hash, is_admin, is_enabled, created_at::text
             FROM users WHERE id = $1",
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
             VALUES ($1, $2, '', $3, TRUE)
             ON CONFLICT(id) DO UPDATE SET
                username = EXCLUDED.username,
                is_admin = EXCLUDED.is_admin",
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
        sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
            .bind(password_hash)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn set_user_enabled(&self, id: &str, enabled: bool) -> anyhow::Result<()> {
        sqlx::query("UPDATE users SET is_enabled = $1 WHERE id = $2")
            .bind(enabled)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn delete_user(&self, id: &str) -> anyhow::Result<()> {
        sqlx::query("DELETE FROM sessions WHERE user_id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn list_users(&self) -> anyhow::Result<Vec<User>> {
        let rows: Vec<(String, String, String, bool, bool, String)> = sqlx::query_as(
            "SELECT id, username, password_hash, is_admin, is_enabled, created_at::text
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
            "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3::timestamptz)",
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
            "SELECT token, user_id, created_at::text, expires_at::text FROM sessions WHERE token = $1",
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
        sqlx::query("DELETE FROM sessions WHERE token = $1")
            .bind(token)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn delete_sessions_for_user(&self, user_id: &str) -> anyhow::Result<()> {
        sqlx::query("DELETE FROM sessions WHERE user_id = $1")
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
            "INSERT INTO invites (code, created_by, expires_at) VALUES ($1, $2, $3::timestamptz)",
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
                "SELECT code, created_by, created_at::text, expires_at::text, consumed_at::text, consumed_by
                 FROM invites WHERE code = $1",
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
            "UPDATE invites SET consumed_at = NOW(), consumed_by = $1
             WHERE code = $2 AND consumed_at IS NULL",
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
                "SELECT code, created_by, created_at::text, expires_at::text, consumed_at::text, consumed_by
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
        let mut tx = self.pool.begin().await?;
        let next_ver = bump_version_pg(&mut *tx).await?;
        let changed_at = now_ms();
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
        .execute(&mut *tx)
        .await?;
        let snapshot_json = serde_json::json!({
            "key": key,
            "value": value,
            "updated_at": changed_at,
            "version": next_ver,
            "deleted_at": serde_json::Value::Null,
            "user_id": user_id,
        })
        .to_string();
        insert_history_pg_tx(
            &mut tx,
            user_id,
            "settings",
            key,
            next_ver,
            next_ver,
            "put_setting",
            "upsert",
            changed_at,
            &snapshot_json,
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    async fn delete_setting(&self, user_id: &str, key: &str) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;
        let next_ver = bump_version_pg(&mut *tx).await?;
        let changed_at = now_ms();
        sqlx::query(
            "UPDATE settings SET deleted_at = NOW()::text, updated_at = NOW(), version = $1
             WHERE user_id = $2 AND key = $3 AND deleted_at IS NULL",
        )
        .bind(next_ver)
        .bind(user_id)
        .bind(key)
        .execute(&mut *tx)
        .await?;
        let row: Option<(String,)> = sqlx::query_as(
            r#"SELECT json_build_object(
                'key', key, 'value', value, 'updated_at', EXTRACT(EPOCH FROM updated_at) * 1000, 'version', version,
                'deleted_at', deleted_at, 'user_id', user_id
            )::text FROM settings WHERE user_id = $1 AND key = $2 AND version = $3 LIMIT 1"#,
        )
        .bind(user_id)
        .bind(key)
        .bind(next_ver)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some((snapshot_json,)) = row {
            insert_history_pg_tx(
                &mut tx,
                user_id,
                "settings",
                key,
                next_ver,
                next_ver,
                "delete_setting",
                "delete",
                changed_at,
                &snapshot_json,
            )
            .await?;
        }
        tx.commit().await?;
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
        let mut tx = self.pool.begin().await?;
        let next_ver = bump_version_pg(&mut *tx).await?;
        let changed_at = now_ms();
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
        .execute(&mut *tx)
        .await?;
        let snapshot_json = serde_json::json!({
            "id": id,
            "owner": owner,
            "filename": filename,
            "mime_type": mime_type,
            "size": size,
            "created_at": changed_at,
            "version": next_ver,
            "deleted_at": serde_json::Value::Null,
        })
        .to_string();
        insert_history_pg_tx(
            &mut tx,
            owner,
            "blobs",
            id,
            next_ver,
            next_ver,
            "put_blob_meta",
            "upsert",
            changed_at,
            &snapshot_json,
        )
        .await?;
        tx.commit().await?;
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
        let mut tx = self.pool.begin().await?;
        let row: Option<(String,)> = sqlx::query_as(
            r#"SELECT json_build_object(
                'id', id, 'owner', owner, 'filename', filename, 'mime_type', mime_type,
                'size', size, 'created_at', EXTRACT(EPOCH FROM created_at) * 1000,
                'version', version, 'deleted_at', deleted_at
            )::text FROM blobs WHERE id = $1 AND deleted_at IS NULL LIMIT 1"#,
        )
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some((mut snapshot_json,)) = row else {
            tx.commit().await?;
            return Ok(());
        };
        let owner = serde_json::from_str::<serde_json::Value>(&snapshot_json)
            .ok()
            .and_then(|v| {
                v.get("owner")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_default();
        let next_ver = bump_version_pg(&mut *tx).await?;
        let changed_at = now_ms();
        sqlx::query(
            "UPDATE blobs SET deleted_at = NOW()::text, version = $1
             WHERE id = $2 AND deleted_at IS NULL",
        )
        .bind(next_ver)
        .bind(id)
        .execute(&mut *tx)
        .await?;
        if let Ok(mut snapshot_value) = serde_json::from_str::<serde_json::Value>(&snapshot_json) {
            if let Some(obj) = snapshot_value.as_object_mut() {
                obj.insert("version".into(), serde_json::json!(next_ver));
                obj.insert(
                    "deleted_at".into(),
                    serde_json::json!(changed_at.to_string()),
                );
            }
            snapshot_json = snapshot_value.to_string();
        }
        insert_history_pg_tx(
            &mut tx,
            &owner,
            "blobs",
            id,
            next_ver,
            next_ver,
            "delete_blob",
            "delete",
            changed_at,
            &snapshot_json,
        )
        .await?;
        tx.commit().await?;
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

    async fn get_changes_since(
        &self,
        user_id: &str,
        since_version: i64,
    ) -> anyhow::Result<Vec<ChangeRecord>> {
        let mut changes = Vec::new();

        let task_rows: Vec<(String, String, i64, i64, Option<String>)> = sqlx::query_as(
            r#"SELECT id,
                json_build_object(
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
                data: if r.4.is_some() { None } else { Some(r.1) },
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
                    'tags', tags, 'attachments', attachments, 'thread_meta', thread_meta, 'version', version, 'deleted_at', deleted_at,
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
                data: if r.4.is_some() { None } else { Some(r.1) },
                version: r.2,
                updated_at: r.3.to_string(),
                deleted_at: r.4,
            });
        }

        let setting_rows: Vec<(String, Option<String>, i64, String, Option<String>)> =
            sqlx::query_as(
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

    async fn list_entity_revisions(
        &self,
        user_id: &str,
        entity_type: &str,
        entity_id: &str,
        limit: i64,
    ) -> anyhow::Result<Vec<EntityRevisionRecord>> {
        let lim = limit.clamp(1, 500);
        let rows: Vec<(
            String,
            String,
            Option<String>,
            String,
            String,
            String,
            i64,
            i64,
            String,
            i64,
            String,
        )> =
            sqlx::query_as(
                "SELECT id, event_id, group_id, user_id, entity_type, entity_id, entity_version, global_version, op, changed_at, snapshot_json
                 FROM entity_revisions
                 WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3
                 ORDER BY global_version DESC LIMIT $4",
            )
            .bind(user_id)
            .bind(entity_type)
            .bind(entity_id)
            .bind(lim)
            .fetch_all(&self.pool)
            .await?;
        let mut revisions = Vec::with_capacity(rows.len());
        for row in rows {
            let snapshot_json = if entity_type == "tasks" {
                let stream_snapshot: Option<(String,)> = sqlx::query_as(
                    "SELECT snapshot_json
                     FROM entity_revisions
                     WHERE user_id = $1 AND entity_type = 'stream_entries' AND entity_id = $2 AND global_version <= $3
                     ORDER BY CASE WHEN $4::text IS NOT NULL AND group_id = $4 THEN 0 ELSE 1 END, global_version DESC
                     LIMIT 1",
                )
                .bind(user_id)
                .bind(entity_id)
                .bind(row.7)
                .bind(row.2.as_deref())
                .fetch_optional(&self.pool)
                .await?;
                hydrate_task_revision_snapshot_json(
                    &row.10,
                    stream_snapshot.as_ref().map(|value| value.0.as_str()),
                )
            } else {
                row.10.clone()
            };
            revisions.push(EntityRevisionRecord {
                id: row.0,
                event_id: row.1,
                group_id: row.2,
                user_id: row.3,
                entity_type: row.4,
                entity_id: row.5,
                entity_version: row.6,
                global_version: row.7,
                op: row.8,
                changed_at: row.9,
                snapshot_json,
            });
        }
        Ok(revisions)
    }

    async fn list_audit_events(
        &self,
        user_id: &str,
        limit: i64,
        entity_type: Option<&str>,
        entity_id: Option<&str>,
    ) -> anyhow::Result<Vec<AuditEventRecord>> {
        let lim = limit.clamp(1, 500);
        let rows: Vec<(
            String,
            Option<String>,
            String,
            String,
            String,
            i64,
            i64,
            String,
            String,
            String,
            String,
            i64,
            Option<String>,
        )> = match (entity_type, entity_id) {
            (Some(kind), Some(id)) => {
                sqlx::query_as(
                    "SELECT id, group_id, user_id, entity_type, entity_id, entity_version, global_version, action, source_kind, actor_type, actor_id, occurred_at, summary_json
                     FROM audit_events
                     WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3
                     ORDER BY occurred_at DESC LIMIT $4",
                )
                .bind(user_id)
                .bind(kind)
                .bind(id)
                .bind(lim)
                .fetch_all(&self.pool)
                .await?
            }
            (Some(kind), None) => {
                sqlx::query_as(
                    "SELECT id, group_id, user_id, entity_type, entity_id, entity_version, global_version, action, source_kind, actor_type, actor_id, occurred_at, summary_json
                     FROM audit_events
                     WHERE user_id = $1 AND entity_type = $2
                     ORDER BY occurred_at DESC LIMIT $3",
                )
                .bind(user_id)
                .bind(kind)
                .bind(lim)
                .fetch_all(&self.pool)
                .await?
            }
            _ => {
                sqlx::query_as(
                    "SELECT id, group_id, user_id, entity_type, entity_id, entity_version, global_version, action, source_kind, actor_type, actor_id, occurred_at, summary_json
                     FROM audit_events
                     WHERE user_id = $1
                     ORDER BY occurred_at DESC LIMIT $2",
                )
                .bind(user_id)
                .bind(lim)
                .fetch_all(&self.pool)
                .await?
            }
        };
        Ok(rows
            .into_iter()
            .map(|r| AuditEventRecord {
                id: r.0,
                group_id: r.1,
                user_id: r.2,
                entity_type: r.3,
                entity_id: r.4,
                entity_version: r.5,
                global_version: r.6,
                action: r.7,
                source_kind: r.8,
                actor_type: r.9,
                actor_id: r.10,
                occurred_at: r.11,
                summary_json: r.12,
            })
            .collect())
    }

    async fn close(&self) -> anyhow::Result<()> {
        self.pool.close().await;
        Ok(())
    }
}
