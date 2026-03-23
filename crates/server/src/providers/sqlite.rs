use async_trait::async_trait;
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};

use super::traits::{DatabaseProvider, NewUser, User};

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

        Ok(Self { pool })
    }
}

#[async_trait]
impl DatabaseProvider for SqliteProvider {
    // --- File operations ---

    async fn get_file(&self, path: &str) -> anyhow::Result<Option<String>> {
        let row: Option<(String,)> =
            sqlx::query_as("SELECT content FROM files WHERE path = ?")
                .bind(path)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(|r| r.0))
    }

    async fn put_file(&self, path: &str, content: &str) -> anyhow::Result<()> {
        sqlx::query(
            "INSERT INTO files (path, content, updated_at) VALUES (?, ?, datetime('now'))
             ON CONFLICT(path) DO UPDATE SET content = excluded.content, updated_at = datetime('now')",
        )
        .bind(path)
        .bind(content)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn delete_file(&self, path: &str) -> anyhow::Result<()> {
        sqlx::query("DELETE FROM files WHERE path = ?")
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
            sqlx::query_as("SELECT path FROM files ORDER BY path")
                .fetch_all(&self.pool)
                .await?
        } else {
            let pattern = format!("{}/%", prefix);
            sqlx::query_as("SELECT path FROM files WHERE path LIKE ? ORDER BY path")
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
        let row: Option<(String,)> =
            sqlx::query_as("SELECT value FROM settings WHERE user_id = ? AND key = ?")
                .bind(user_id)
                .bind(key)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(|r| r.0))
    }

    async fn put_setting(&self, user_id: &str, key: &str, value: &str) -> anyhow::Result<()> {
        sqlx::query(
            "INSERT INTO settings (user_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
             ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        )
        .bind(user_id)
        .bind(key)
        .bind(value)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn delete_setting(&self, user_id: &str, key: &str) -> anyhow::Result<()> {
        sqlx::query("DELETE FROM settings WHERE user_id = ? AND key = ?")
            .bind(user_id)
            .bind(key)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn list_settings(&self, user_id: &str) -> anyhow::Result<Vec<(String, String)>> {
        let rows: Vec<(String, String)> =
            sqlx::query_as("SELECT key, value FROM settings WHERE user_id = ? ORDER BY key")
                .bind(user_id)
                .fetch_all(&self.pool)
                .await?;
        Ok(rows)
    }

    // --- Lifecycle ---

    async fn close(&self) -> anyhow::Result<()> {
        self.pool.close().await;
        Ok(())
    }
}
