use async_trait::async_trait;
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};

use super::traits::{BlobMeta, ChangeRecord, DatabaseProvider, NewUser, User};

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

        let current_version: i64 = sqlx::query_as::<_, (i64,)>(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        )
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
            sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_files_updated ON files (updated_at)",
            )
            .execute(&pool)
            .await?;

            sqlx::query(
                "CREATE INDEX IF NOT EXISTS idx_settings_user ON settings (user_id)",
            )
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

        Ok(Self { pool })
    }
}

#[async_trait]
impl DatabaseProvider for SqliteProvider {
    // --- File operations ---

    async fn get_file(&self, path: &str) -> anyhow::Result<Option<String>> {
        let row: Option<(String,)> =
            sqlx::query_as("SELECT content FROM files WHERE path = ? AND deleted_at IS NULL")
                .bind(path)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(|r| r.0))
    }

    async fn put_file(&self, path: &str, content: &str) -> anyhow::Result<()> {
        let next_ver = self.next_version().await?;
        sqlx::query(
            "INSERT INTO files (path, content, updated_at, version, deleted_at)
             VALUES (?, ?, datetime('now'), ?, NULL)
             ON CONFLICT(path) DO UPDATE SET
               content = excluded.content,
               updated_at = datetime('now'),
               version = excluded.version,
               deleted_at = NULL",
        )
        .bind(path)
        .bind(content)
        .bind(next_ver)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn delete_file(&self, path: &str) -> anyhow::Result<()> {
        let next_ver = self.next_version().await?;
        sqlx::query(
            "UPDATE files SET deleted_at = datetime('now'), updated_at = datetime('now'), version = ?
             WHERE path = ? AND deleted_at IS NULL",
        )
        .bind(next_ver)
        .bind(path)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn list_files(&self, dir: &str) -> anyhow::Result<Vec<String>> {
        let prefix = if dir.ends_with('/') {
            dir.to_string()
        } else {
            format!("{}/", dir)
        };
        let like_direct = format!("{}%", prefix);
        let like_nested = format!("{}%/%", prefix);

        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT path FROM files
             WHERE path LIKE ? AND path NOT LIKE ? AND path LIKE '%.md'
               AND deleted_at IS NULL
             ORDER BY path DESC",
        )
        .bind(&like_direct)
        .bind(&like_nested)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| r.0[prefix.len()..].to_string())
            .collect())
    }

    async fn list_all_files(&self, prefix: &str) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String,)> = if prefix.is_empty() {
            sqlx::query_as("SELECT path FROM files WHERE deleted_at IS NULL ORDER BY path")
                .fetch_all(&self.pool)
                .await?
        } else {
            let pattern = format!("{}/%", prefix);
            sqlx::query_as(
                "SELECT path FROM files WHERE path LIKE ? AND deleted_at IS NULL ORDER BY path",
            )
            .bind(&pattern)
            .fetch_all(&self.pool)
            .await?
        };
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    // --- User operations ---

    async fn get_user_by_username(&self, username: &str) -> anyhow::Result<Option<User>> {
        let row: Option<(String, String, String, bool, String)> = sqlx::query_as(
            "SELECT id, username, password_hash, is_admin, created_at FROM users WHERE username = ?",
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
            "SELECT id, username, password_hash, is_admin, created_at FROM users WHERE id = ?",
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
            "INSERT INTO users (id, username, password_hash, is_admin) VALUES (?, ?, ?, ?)",
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
        sqlx::query("UPDATE users SET password_hash = ? WHERE id = ?")
            .bind(password_hash)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn delete_user(&self, id: &str) -> anyhow::Result<()> {
        sqlx::query("DELETE FROM users WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn list_users(&self) -> anyhow::Result<Vec<User>> {
        let rows: Vec<(String, String, String, bool, String)> = sqlx::query_as(
            "SELECT id, username, password_hash, is_admin, created_at FROM users ORDER BY created_at",
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
        let next_ver = self.next_version().await?;
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
        let next_ver = self.next_version().await?;
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
        sqlx::query(
            "INSERT INTO blobs (id, owner, filename, mime_type, size) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET filename = excluded.filename, mime_type = excluded.mime_type, size = excluded.size",
        )
        .bind(id)
        .bind(owner)
        .bind(filename)
        .bind(mime_type)
        .bind(size)
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
        let next_ver = self.next_version().await?;
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

    async fn get_changes_since(&self, since_version: i64) -> anyhow::Result<Vec<ChangeRecord>> {
        let mut changes = Vec::new();

        let file_rows: Vec<(String, Option<String>, i64, String, Option<String>)> =
            sqlx::query_as(
                "SELECT path, content, version, updated_at, deleted_at
                 FROM files WHERE version > ? ORDER BY version",
            )
            .bind(since_version)
            .fetch_all(&self.pool)
            .await?;

        for r in file_rows {
            changes.push(ChangeRecord {
                table: "files".into(),
                key: r.0,
                content: r.1,
                version: r.2,
                updated_at: r.3,
                deleted_at: r.4,
            });
        }

        let setting_rows: Vec<(String, String, Option<String>, i64, String, Option<String>)> =
            sqlx::query_as(
                "SELECT user_id, key, value, version, updated_at, deleted_at
                 FROM settings WHERE version > ? ORDER BY version",
            )
            .bind(since_version)
            .fetch_all(&self.pool)
            .await?;

        for r in setting_rows {
            changes.push(ChangeRecord {
                table: "settings".into(),
                key: format!("{}:{}", r.0, r.1),
                content: r.2,
                version: r.3,
                updated_at: r.4,
                deleted_at: r.5,
            });
        }

        let blob_rows: Vec<(String, i64, String, Option<String>)> = sqlx::query_as(
            "SELECT id, version, created_at, deleted_at
             FROM blobs WHERE version > ? ORDER BY version",
        )
        .bind(since_version)
        .fetch_all(&self.pool)
        .await?;

        for r in blob_rows {
            changes.push(ChangeRecord {
                table: "blobs".into(),
                key: r.0,
                content: None,
                version: r.1,
                updated_at: r.2,
                deleted_at: r.3,
            });
        }

        changes.sort_by_key(|c| c.version);
        Ok(changes)
    }

    async fn get_max_version(&self) -> anyhow::Result<i64> {
        let row: (i64,) =
            sqlx::query_as("SELECT current_version FROM version_seq WHERE id = 1")
                .fetch_one(&self.pool)
                .await
                .unwrap_or((0,));
        Ok(row.0)
    }

    async fn apply_remote_change(&self, change: &ChangeRecord) -> anyhow::Result<()> {
        let next_ver = self.next_version().await?;
        match change.table.as_str() {
            "files" => {
                if change.deleted_at.is_some() {
                    sqlx::query(
                        "UPDATE files SET deleted_at = ?, updated_at = ?, version = ?
                         WHERE path = ?",
                    )
                    .bind(&change.deleted_at)
                    .bind(&change.updated_at)
                    .bind(next_ver)
                    .bind(&change.key)
                    .execute(&self.pool)
                    .await?;
                } else if let Some(content) = &change.content {
                    sqlx::query(
                        "INSERT INTO files (path, content, updated_at, version, deleted_at)
                         VALUES (?, ?, ?, ?, NULL)
                         ON CONFLICT(path) DO UPDATE SET
                           content = excluded.content,
                           updated_at = excluded.updated_at,
                           version = excluded.version,
                           deleted_at = NULL",
                    )
                    .bind(&change.key)
                    .bind(content)
                    .bind(&change.updated_at)
                    .bind(next_ver)
                    .execute(&self.pool)
                    .await?;
                }
            }
            "settings" => {
                let parts: Vec<&str> = change.key.splitn(2, ':').collect();
                if parts.len() == 2 {
                    let (user_id, key) = (parts[0], parts[1]);
                    if change.deleted_at.is_some() {
                        sqlx::query(
                            "UPDATE settings SET deleted_at = ?, updated_at = ?, version = ?
                             WHERE user_id = ? AND key = ?",
                        )
                        .bind(&change.deleted_at)
                        .bind(&change.updated_at)
                        .bind(next_ver)
                        .bind(user_id)
                        .bind(key)
                        .execute(&self.pool)
                        .await?;
                    } else if let Some(value) = &change.content {
                        sqlx::query(
                            "INSERT INTO settings (user_id, key, value, updated_at, version, deleted_at)
                             VALUES (?, ?, ?, ?, ?, NULL)
                             ON CONFLICT(user_id, key) DO UPDATE SET
                               value = excluded.value,
                               updated_at = excluded.updated_at,
                               version = excluded.version,
                               deleted_at = NULL",
                        )
                        .bind(user_id)
                        .bind(key)
                        .bind(value)
                        .bind(&change.updated_at)
                        .bind(next_ver)
                        .execute(&self.pool)
                        .await?;
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    // --- Lifecycle ---

    async fn close(&self) -> anyhow::Result<()> {
        self.pool.close().await;
        Ok(())
    }
}

impl SqliteProvider {
    async fn next_version(&self) -> anyhow::Result<i64> {
        let row: (i64,) = sqlx::query_as(
            "UPDATE version_seq SET current_version = current_version + 1
             WHERE id = 1 RETURNING current_version",
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0)
    }
}
