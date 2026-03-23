use async_trait::async_trait;
use sqlx::postgres::{PgPool, PgPoolOptions};

use super::traits::{DatabaseProvider, NewUser, User};

pub struct PostgresProvider {
    pool: PgPool,
}

const CURRENT_SCHEMA_VERSION: i64 = 1;

impl PostgresProvider {
    pub async fn new(database_url: &str) -> anyhow::Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .connect(database_url)
            .await?;

        // Schema version tracking
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

        let _ = CURRENT_SCHEMA_VERSION;
        Ok(Self { pool })
    }
}

#[async_trait]
impl DatabaseProvider for PostgresProvider {
    async fn get_file(&self, path: &str) -> anyhow::Result<Option<String>> {
        let row: Option<(String,)> =
            sqlx::query_as("SELECT content FROM files WHERE path = $1")
                .bind(path)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(|r| r.0))
    }

    async fn put_file(&self, path: &str, content: &str) -> anyhow::Result<()> {
        sqlx::query(
            "INSERT INTO files (path, content, updated_at) VALUES ($1, $2, NOW())
             ON CONFLICT(path) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()",
        )
        .bind(path)
        .bind(content)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn delete_file(&self, path: &str) -> anyhow::Result<()> {
        sqlx::query("DELETE FROM files WHERE path = $1")
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
             WHERE path LIKE $1 AND path NOT LIKE $2 AND path LIKE '%.md'
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
            sqlx::query_as("SELECT path FROM files WHERE path LIKE $1 ORDER BY path")
                .bind(&pattern)
                .fetch_all(&self.pool)
                .await?
        };
        Ok(rows.into_iter().map(|r| r.0).collect())
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
        let row: Option<(String,)> =
            sqlx::query_as("SELECT value FROM settings WHERE user_id = $1 AND key = $2")
                .bind(user_id)
                .bind(key)
                .fetch_optional(&self.pool)
                .await?;
        Ok(row.map(|r| r.0))
    }

    async fn put_setting(&self, user_id: &str, key: &str, value: &str) -> anyhow::Result<()> {
        sqlx::query(
            "INSERT INTO settings (user_id, key, value, updated_at) VALUES ($1, $2, $3, NOW())
             ON CONFLICT(user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
        )
        .bind(user_id)
        .bind(key)
        .bind(value)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn delete_setting(&self, user_id: &str, key: &str) -> anyhow::Result<()> {
        sqlx::query("DELETE FROM settings WHERE user_id = $1 AND key = $2")
            .bind(user_id)
            .bind(key)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn list_settings(&self, user_id: &str) -> anyhow::Result<Vec<(String, String)>> {
        let rows: Vec<(String, String)> =
            sqlx::query_as("SELECT key, value FROM settings WHERE user_id = $1 ORDER BY key")
                .bind(user_id)
                .fetch_all(&self.pool)
                .await?;
        Ok(rows)
    }

    async fn close(&self) -> anyhow::Result<()> {
        self.pool.close().await;
        Ok(())
    }
}
