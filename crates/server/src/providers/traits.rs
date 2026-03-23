use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub is_admin: bool,
    pub created_at: String,
}

#[derive(Debug)]
pub struct NewUser {
    pub username: String,
    pub password_hash: String,
    pub is_admin: bool,
}

#[async_trait]
pub trait DatabaseProvider: Send + Sync {
    // --- File operations (L2 content) ---
    async fn get_file(&self, path: &str) -> anyhow::Result<Option<String>>;
    async fn put_file(&self, path: &str, content: &str) -> anyhow::Result<()>;
    async fn delete_file(&self, path: &str) -> anyhow::Result<()>;
    async fn list_files(&self, dir: &str) -> anyhow::Result<Vec<String>>;
    /// List all file paths under a given prefix (recursive). Empty prefix = all files.
    async fn list_all_files(&self, prefix: &str) -> anyhow::Result<Vec<String>>;

    // --- User operations ---
    async fn get_user_by_username(&self, username: &str) -> anyhow::Result<Option<User>>;
    async fn get_user_by_id(&self, id: &str) -> anyhow::Result<Option<User>>;
    async fn create_user(&self, user: &NewUser) -> anyhow::Result<User>;
    async fn update_user_password(&self, id: &str, password_hash: &str) -> anyhow::Result<()>;
    async fn delete_user(&self, id: &str) -> anyhow::Result<()>;
    async fn list_users(&self) -> anyhow::Result<Vec<User>>;
    async fn count_users(&self) -> anyhow::Result<i64>;

    // --- Settings operations (L1 per-user key-value) ---
    async fn get_setting(&self, user_id: &str, key: &str) -> anyhow::Result<Option<String>>;
    async fn put_setting(&self, user_id: &str, key: &str, value: &str) -> anyhow::Result<()>;
    async fn delete_setting(&self, user_id: &str, key: &str) -> anyhow::Result<()>;
    async fn list_settings(&self, user_id: &str) -> anyhow::Result<Vec<(String, String)>>;

    // --- Lifecycle ---
    async fn close(&self) -> anyhow::Result<()>;
}
