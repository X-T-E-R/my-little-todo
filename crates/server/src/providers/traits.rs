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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlobMeta {
    pub id: String,
    pub owner: String,
    pub filename: String,
    pub mime_type: String,
    pub size: i64,
    pub created_at: String,
}

#[derive(Debug)]
pub struct NewUser {
    pub username: String,
    pub password_hash: String,
    pub is_admin: bool,
}

/// Sync / replication record (JSON `data` is row payload, null when deleted).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeRecord {
    pub table: String,
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    pub version: i64,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

#[async_trait]
pub trait DatabaseProvider: Send + Sync {
    // --- Tasks (JSON rows, snake_case keys matching TS TaskDbRow) ---
    async fn list_tasks_json(&self, user_id: &str) -> anyhow::Result<Vec<String>>;
    async fn get_task_json(&self, user_id: &str, id: &str) -> anyhow::Result<Option<String>>;
    async fn upsert_task_json(&self, user_id: &str, json: &str) -> anyhow::Result<()>;
    async fn delete_task_row(&self, user_id: &str, id: &str) -> anyhow::Result<()>;

    // --- Stream entries (JSON rows, snake_case keys matching TS StreamEntryDbRow) ---
    async fn list_stream_day_json(&self, user_id: &str, date_key: &str) -> anyhow::Result<Vec<String>>;
    async fn list_stream_recent_json(&self, user_id: &str, days: i32) -> anyhow::Result<Vec<String>>;
    /// Distinct `date_key` values (newest first) for calendar navigation.
    async fn list_stream_date_keys(&self, user_id: &str) -> anyhow::Result<Vec<String>>;
    /// All stream entries for export / search (non-deleted).
    async fn list_all_stream_json(&self, user_id: &str) -> anyhow::Result<Vec<String>>;
    /// Full-text-ish search over `content` (case-insensitive substring).
    async fn search_stream_json(&self, user_id: &str, q: &str, limit: i64) -> anyhow::Result<Vec<String>>;
    async fn upsert_stream_entry_json(&self, user_id: &str, json: &str) -> anyhow::Result<()>;
    async fn delete_stream_entry_row(&self, user_id: &str, id: &str) -> anyhow::Result<()>;

    // --- User operations ---
    async fn get_user_by_username(&self, username: &str) -> anyhow::Result<Option<User>>;
    async fn get_user_by_id(&self, id: &str) -> anyhow::Result<Option<User>>;
    async fn create_user(&self, user: &NewUser) -> anyhow::Result<User>;
    async fn update_user_password(&self, id: &str, password_hash: &str) -> anyhow::Result<()>;
    async fn delete_user(&self, id: &str) -> anyhow::Result<()>;
    async fn list_users(&self) -> anyhow::Result<Vec<User>>;
    async fn count_users(&self) -> anyhow::Result<i64>;

    // --- Settings (L1 per-user key-value) ---
    async fn get_setting(&self, user_id: &str, key: &str) -> anyhow::Result<Option<String>>;
    async fn put_setting(&self, user_id: &str, key: &str, value: &str) -> anyhow::Result<()>;
    async fn delete_setting(&self, user_id: &str, key: &str) -> anyhow::Result<()>;
    async fn list_settings(&self, user_id: &str) -> anyhow::Result<Vec<(String, String)>>;

    // --- Blob metadata ---
    async fn put_blob_meta(
        &self,
        id: &str,
        owner: &str,
        filename: &str,
        mime_type: &str,
        size: i64,
    ) -> anyhow::Result<()>;
    async fn get_blob_meta(&self, id: &str) -> anyhow::Result<Option<BlobMeta>>;
    async fn delete_blob_meta(&self, id: &str) -> anyhow::Result<()>;
    async fn list_blob_metas(&self, owner: &str) -> anyhow::Result<Vec<BlobMeta>>;

    // --- Sync (scoped to user_id for row data) ---
    async fn get_changes_since(&self, user_id: &str, since_version: i64) -> anyhow::Result<Vec<ChangeRecord>>;
    async fn get_max_version(&self) -> anyhow::Result<i64>;
    /// Max `version` across this user's synced rows (tasks, stream, settings, blobs). Used in multi-tenant sync status.
    async fn get_max_version_for_user(&self, user_id: &str) -> anyhow::Result<i64>;
    async fn apply_remote_change(&self, user_id: &str, change: &ChangeRecord) -> anyhow::Result<()>;
    /// Apply all changes in one DB transaction (push is all-or-nothing).
    async fn apply_remote_changes_batch(&self, user_id: &str, changes: &[ChangeRecord]) -> anyhow::Result<()>;

    async fn close(&self) -> anyhow::Result<()>;
}
