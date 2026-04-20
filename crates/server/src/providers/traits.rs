use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub is_admin: bool,
    pub is_enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewUser {
    pub username: String,
    pub password_hash: String,
    pub is_admin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub token: String,
    pub user_id: String,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteRecord {
    pub code: String,
    pub created_by: String,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub consumed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub consumed_by: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEventRecord {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    pub user_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub entity_version: i64,
    pub global_version: i64,
    pub action: String,
    pub source_kind: String,
    pub actor_type: String,
    pub actor_id: String,
    pub occurred_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityRevisionRecord {
    pub id: String,
    pub event_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    pub user_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub entity_version: i64,
    pub global_version: i64,
    pub op: String,
    pub changed_at: i64,
    pub snapshot_json: String,
}

#[async_trait]
pub trait DatabaseProvider: Send + Sync {
    async fn list_tasks_json(&self, user_id: &str) -> anyhow::Result<Vec<String>>;
    async fn get_task_json(&self, user_id: &str, id: &str) -> anyhow::Result<Option<String>>;
    async fn upsert_task_json(&self, user_id: &str, json: &str) -> anyhow::Result<()>;
    async fn delete_task_row(&self, user_id: &str, id: &str) -> anyhow::Result<()>;

    async fn list_stream_day_json(
        &self,
        user_id: &str,
        date_key: &str,
    ) -> anyhow::Result<Vec<String>>;
    async fn list_stream_recent_json(
        &self,
        user_id: &str,
        days: i32,
    ) -> anyhow::Result<Vec<String>>;
    async fn list_stream_date_keys(&self, user_id: &str) -> anyhow::Result<Vec<String>>;
    async fn list_all_stream_json(&self, user_id: &str) -> anyhow::Result<Vec<String>>;
    async fn search_stream_json(
        &self,
        user_id: &str,
        q: &str,
        limit: i64,
    ) -> anyhow::Result<Vec<String>>;
    async fn upsert_stream_entry_json(&self, user_id: &str, json: &str) -> anyhow::Result<()>;
    async fn delete_stream_entry_row(&self, user_id: &str, id: &str) -> anyhow::Result<()>;

    async fn create_user(&self, new_user: &NewUser) -> anyhow::Result<User>;
    async fn get_user_by_username(&self, username: &str) -> anyhow::Result<Option<User>>;
    async fn get_user_by_id(&self, id: &str) -> anyhow::Result<Option<User>>;
    async fn ensure_external_user(
        &self,
        subject: &str,
        username: &str,
        is_admin: bool,
    ) -> anyhow::Result<User>;
    async fn update_user_password(&self, id: &str, password_hash: &str) -> anyhow::Result<()>;
    async fn set_user_enabled(&self, id: &str, enabled: bool) -> anyhow::Result<()>;
    async fn delete_user(&self, id: &str) -> anyhow::Result<()>;
    async fn list_users(&self) -> anyhow::Result<Vec<User>>;
    async fn count_users(&self) -> anyhow::Result<i64>;

    async fn create_session(
        &self,
        user_id: &str,
        token: &str,
        expires_at: Option<&str>,
    ) -> anyhow::Result<SessionRecord>;
    async fn get_session(&self, token: &str) -> anyhow::Result<Option<SessionRecord>>;
    async fn delete_session(&self, token: &str) -> anyhow::Result<()>;
    async fn delete_sessions_for_user(&self, user_id: &str) -> anyhow::Result<()>;

    async fn create_invite(
        &self,
        code: &str,
        created_by: &str,
        expires_at: Option<&str>,
    ) -> anyhow::Result<InviteRecord>;
    async fn get_invite(&self, code: &str) -> anyhow::Result<Option<InviteRecord>>;
    async fn consume_invite(&self, code: &str, consumed_by: &str) -> anyhow::Result<()>;
    async fn list_invites(&self) -> anyhow::Result<Vec<InviteRecord>>;

    async fn get_setting(&self, user_id: &str, key: &str) -> anyhow::Result<Option<String>>;
    async fn put_setting(&self, user_id: &str, key: &str, value: &str) -> anyhow::Result<()>;
    async fn delete_setting(&self, user_id: &str, key: &str) -> anyhow::Result<()>;
    async fn list_settings(&self, user_id: &str) -> anyhow::Result<Vec<(String, String)>>;

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

    async fn get_changes_since(
        &self,
        user_id: &str,
        since_version: i64,
    ) -> anyhow::Result<Vec<ChangeRecord>>;
    async fn get_max_version(&self) -> anyhow::Result<i64>;
    async fn get_max_version_for_user(&self, user_id: &str) -> anyhow::Result<i64>;
    async fn apply_remote_change(&self, user_id: &str, change: &ChangeRecord)
        -> anyhow::Result<()>;
    async fn apply_remote_changes_batch(
        &self,
        user_id: &str,
        changes: &[ChangeRecord],
    ) -> anyhow::Result<()>;

    async fn list_entity_revisions(
        &self,
        user_id: &str,
        entity_type: &str,
        entity_id: &str,
        limit: i64,
    ) -> anyhow::Result<Vec<EntityRevisionRecord>>;
    async fn list_audit_events(
        &self,
        user_id: &str,
        limit: i64,
        entity_type: Option<&str>,
        entity_id: Option<&str>,
    ) -> anyhow::Result<Vec<AuditEventRecord>>;

    async fn close(&self) -> anyhow::Result<()>;
}
