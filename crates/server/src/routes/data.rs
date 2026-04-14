use std::collections::HashSet;

use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::fs;

use crate::config::{DbType, ServerConfig};
use crate::providers;
use crate::AppState;

const BACKUP_KIND: &str = "my-little-todo-backup";
const CURRENT_SCHEMA_VERSION: u32 = 1;
const EXPORT_FORMAT_VERSION: u32 = 3;

#[derive(Serialize)]
pub struct ErrorBody {
    pub error: String,
}

type ApiResult<T> = Result<Json<T>, (StatusCode, Json<ErrorBody>)>;

fn bad_request(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorBody { error: msg.into() }),
    )
}

fn forbidden(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (StatusCode::FORBIDDEN, Json(ErrorBody { error: msg.into() }))
}

fn internal(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorBody { error: msg.into() }),
    )
}

async fn require_admin(
    state: &AppState,
    user_id: &str,
) -> Result<(), (StatusCode, Json<ErrorBody>)> {
    let user = state
        .db
        .get_user_by_id(user_id)
        .await
        .map_err(|e| internal(&e.to_string()))?
        .ok_or_else(|| forbidden("User not found"))?;

    if !user.is_admin {
        return Err(forbidden("Admin access required"));
    }

    Ok(())
}

fn data_partition(state: &AppState, user_id: &str) -> String {
    let _ = state;
    user_id.to_string()
}

fn auth_provider_name(state: &AppState) -> &'static str {
    match state.config.auth_provider {
        crate::config::AuthProvider::None => "none",
        crate::config::AuthProvider::Embedded => "embedded",
        crate::config::AuthProvider::Zitadel => "zitadel",
    }
}

fn blob_dir(state: &AppState) -> std::path::PathBuf {
    std::path::PathBuf::from(&state.config.data_dir).join("blobs")
}

fn blob_storage_name(id: &str, filename: &str) -> String {
    let ext = std::path::Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    format!("{}.{}", id, ext)
}

fn extract_row_id(raw: &str, field_name: &str) -> anyhow::Result<String> {
    let value: serde_json::Value = serde_json::from_str(raw)?;
    value
        .get(field_name)
        .and_then(|v| v.as_str())
        .map(ToOwned::to_owned)
        .ok_or_else(|| anyhow::anyhow!("Missing string field `{}`", field_name))
}

fn normalize_role_ids(obj: &mut serde_json::Map<String, Value>) {
    let role_ids = obj
        .get("role_ids")
        .and_then(|v| v.as_str())
        .and_then(|raw| serde_json::from_str::<Vec<String>>(raw).ok())
        .unwrap_or_default();
    if !role_ids.is_empty() {
        obj.insert(
            "role_ids".into(),
            Value::String(serde_json::to_string(&role_ids).unwrap_or_else(|_| "[]".into())),
        );
        return;
    }
    if let Some(role_id) = obj.get("role_id").and_then(|v| v.as_str()) {
        obj.insert(
            "role_ids".into(),
            Value::String(serde_json::to_string(&vec![role_id]).unwrap_or_else(|_| "[]".into())),
        );
    }
}

fn sanitize_task_export_row(raw: &str) -> anyhow::Result<String> {
    let mut value: Value = serde_json::from_str(raw)?;
    if let Some(obj) = value.as_object_mut() {
        normalize_role_ids(obj);
        obj.insert("body".into(), Value::String(String::new()));
        obj.insert("role_id".into(), Value::Null);
        obj.insert("source_stream_id".into(), Value::Null);
    }
    Ok(value.to_string())
}

fn sanitize_stream_export_row(raw: &str) -> anyhow::Result<String> {
    let mut value: Value = serde_json::from_str(raw)?;
    if let Some(obj) = value.as_object_mut() {
        obj.insert("extracted_task_id".into(), Value::Null);
    }
    Ok(value.to_string())
}

fn hydrate_task_import_row(
    raw: &str,
    stream_rows_by_id: &std::collections::HashMap<String, Value>,
) -> anyhow::Result<String> {
    let mut value: Value = serde_json::from_str(raw)?;
    if let Some(obj) = value.as_object_mut() {
        normalize_role_ids(obj);
        let task_id = obj
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let linked_stream = stream_rows_by_id.get(&task_id).or_else(|| {
            obj.get("source_stream_id")
                .and_then(|v| v.as_str())
                .and_then(|id| stream_rows_by_id.get(id))
        });

        if obj
            .get("body")
            .and_then(|v| v.as_str())
            .map(|s| s.is_empty())
            .unwrap_or(true)
        {
            if let Some(content) = linked_stream
                .and_then(|stream| stream.get("content"))
                .and_then(|v| v.as_str())
            {
                obj.insert("body".into(), Value::String(content.to_string()));
            }
        }

        if obj
            .get("source_stream_id")
            .map(|v| v.is_null())
            .unwrap_or(true)
            && !task_id.is_empty()
        {
            obj.insert("source_stream_id".into(), Value::String(task_id));
        }

        if obj.get("role_id").map(|v| v.is_null()).unwrap_or(true) {
            if let Some(primary_role) = obj
                .get("role_ids")
                .and_then(|v| v.as_str())
                .and_then(|raw_ids| serde_json::from_str::<Vec<String>>(raw_ids).ok())
                .and_then(|ids| ids.into_iter().next())
            {
                obj.insert("role_id".into(), Value::String(primary_role));
            }
        }
    }
    Ok(value.to_string())
}

#[derive(Serialize)]
pub struct StorageInfoResponse {
    pub db_type: String,
    pub data_dir: String,
    pub database_url: Option<String>,
    pub auth_provider: String,
    pub l0_config_toml: String,
    pub admin_export_enabled: bool,
}

pub async fn storage_info(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> ApiResult<StorageInfoResponse> {
    require_admin(&state, &user_id).await?;
    crate::routes::admin::log_admin_action(&user_id, "storage_info", "read");

    let c = &state.config;
    Ok(Json(StorageInfoResponse {
        db_type: serde_json::to_value(&c.db_type)
            .ok()
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| format!("{:?}", c.db_type)),
        data_dir: c.data_dir.clone(),
        database_url: c.database_url.clone().map(|u| {
            if let Some(at) = u.find('@') {
                format!("***@{}", &u[at + 1..])
            } else {
                u
            }
        }),
        auth_provider: auth_provider_name(&state).to_string(),
        l0_config_toml: c.to_toml_string(),
        admin_export_enabled: !c.admin_export_dirs.is_empty(),
    }))
}

#[derive(Deserialize)]
pub struct MigrateRequest {
    pub target_db_type: String,
    pub target_data_dir: Option<String>,
    pub target_database_url: Option<String>,
}

#[derive(Serialize)]
pub struct MigrateResponse {
    pub ok: bool,
    pub tasks_migrated: usize,
    pub stream_migrated: usize,
    pub settings_migrated: usize,
    pub message: String,
}

pub async fn migrate_data(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(body): Json<MigrateRequest>,
) -> ApiResult<MigrateResponse> {
    require_admin(&state, &user_id).await?;
    crate::routes::admin::log_admin_action(
        &user_id,
        "migrate_data",
        &format!("target_db_type={}", body.target_db_type),
    );

    let target_db = match body.target_db_type.as_str() {
        "sqlite" => DbType::Sqlite,
        "postgres" | "postgresql" => DbType::Postgres,
        other => return Err(bad_request(&format!("Unknown db_type: {}", other))),
    };

    let target_config = ServerConfig {
        db_type: target_db,
        data_dir: body
            .target_data_dir
            .unwrap_or_else(|| state.config.data_dir.clone()),
        database_url: body.target_database_url,
        port: state.config.port,
        host: state.config.host.clone(),
        auth_provider: state.config.auth_provider.clone(),
        embedded_signup_policy: state.config.embedded_signup_policy.clone(),
        sync_mode: state.config.sync_mode.clone(),
        zitadel_issuer: state.config.zitadel_issuer.clone(),
        zitadel_client_id: state.config.zitadel_client_id.clone(),
        zitadel_audience: state.config.zitadel_audience.clone(),
        zitadel_admin_role: state.config.zitadel_admin_role.clone(),
        static_dir: None,
        cors_allowed_origins: state.config.cors_allowed_origins.clone(),
        admin_export_dirs: state.config.admin_export_dirs.clone(),
    };

    let target_provider = providers::create_provider(&target_config)
        .await
        .map_err(|e| internal(&format!("Failed to create target provider: {}", e)))?;

    let prefix = data_partition(&state, &user_id);

    let task_rows = state
        .db
        .list_tasks_json(&prefix)
        .await
        .map_err(|e| internal(&format!("Failed listing tasks: {}", e)))?;

    let mut tasks_migrated = 0usize;
    for json in &task_rows {
        target_provider
            .upsert_task_json(&prefix, json)
            .await
            .map_err(|e| internal(&format!("Failed upserting task: {}", e)))?;
        tasks_migrated += 1;
    }

    let stream_rows = state
        .db
        .list_all_stream_json(&prefix)
        .await
        .map_err(|e| internal(&format!("Failed listing stream: {}", e)))?;

    let mut stream_migrated = 0usize;
    for json in &stream_rows {
        target_provider
            .upsert_stream_entry_json(&prefix, json)
            .await
            .map_err(|e| internal(&format!("Failed upserting stream entry: {}", e)))?;
        stream_migrated += 1;
    }

    let all_users = state
        .db
        .list_users()
        .await
        .map_err(|e| internal(&format!("Failed listing users: {}", e)))?;

    let mut settings_migrated = 0usize;
    for user in &all_users {
        let settings = state
            .db
            .list_settings(&user.id)
            .await
            .map_err(|e| internal(&format!("Settings error: {}", e)))?;
        for (key, value) in &settings {
            target_provider
                .put_setting(&user.id, key, value)
                .await
                .map_err(|e| internal(&format!("Setting write error: {}", e)))?;
            settings_migrated += 1;
        }
    }

    target_provider.close().await.ok();

    Ok(Json(MigrateResponse {
        ok: true,
        tasks_migrated,
        stream_migrated,
        settings_migrated,
        message: format!(
            "Migration complete. Update your config to use {:?} and restart.",
            body.target_db_type
        ),
    }))
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ExportBlob {
    pub id: String,
    pub filename: String,
    pub mime_type: String,
    pub size: i64,
    pub content_base64: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ExportJsonResponse {
    pub kind: String,
    pub schema_version: u32,
    pub export_version: u32,
    pub platform: String,
    pub includes_blobs: bool,
    pub tasks: Vec<String>,
    pub stream_entries: Vec<String>,
    pub settings: Vec<(String, String)>,
    #[serde(default)]
    pub blobs: Vec<ExportBlob>,
}

async fn collect_blob_exports(
    state: &AppState,
    user_id: &str,
) -> Result<Vec<ExportBlob>, (StatusCode, Json<ErrorBody>)> {
    let metas = state
        .db
        .list_blob_metas(user_id)
        .await
        .map_err(|e| internal(&e.to_string()))?;

    let mut blobs = Vec::with_capacity(metas.len());
    for meta in metas {
        let file_path = blob_dir(state).join(blob_storage_name(&meta.id, &meta.filename));
        let bytes = fs::read(&file_path)
            .await
            .map_err(|e| internal(&format!("Failed reading blob {}: {}", meta.id, e)))?;
        blobs.push(ExportBlob {
            id: meta.id,
            filename: meta.filename,
            mime_type: meta.mime_type,
            size: meta.size,
            content_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        });
    }

    Ok(blobs)
}

pub async fn export_json(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> ApiResult<ExportJsonResponse> {
    let prefix = data_partition(&state, &user_id);

    let tasks = state
        .db
        .list_tasks_json(&prefix)
        .await
        .map_err(|e| internal(&e.to_string()))?
        .into_iter()
        .map(|raw| sanitize_task_export_row(&raw))
        .collect::<anyhow::Result<Vec<_>>>()
        .map_err(|e| internal(&e.to_string()))?;

    let stream_entries = state
        .db
        .list_all_stream_json(&prefix)
        .await
        .map_err(|e| internal(&e.to_string()))?
        .into_iter()
        .map(|raw| sanitize_stream_export_row(&raw))
        .collect::<anyhow::Result<Vec<_>>>()
        .map_err(|e| internal(&e.to_string()))?;

    let settings = state
        .db
        .list_settings(&user_id)
        .await
        .map_err(|e| internal(&e.to_string()))?;

    let blobs = collect_blob_exports(&state, &user_id).await?;

    Ok(Json(ExportJsonResponse {
        kind: BACKUP_KIND.to_string(),
        schema_version: CURRENT_SCHEMA_VERSION,
        export_version: EXPORT_FORMAT_VERSION,
        platform: "server".to_string(),
        includes_blobs: !blobs.is_empty(),
        tasks,
        stream_entries,
        settings,
        blobs,
    }))
}

pub async fn export_markdown(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> impl IntoResponse {
    let prefix = data_partition(&state, &user_id);

    let tasks = match state.db.list_tasks_json(&prefix).await {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                [(header::CONTENT_TYPE, "application/json")],
                serde_json::json!({ "error": e.to_string() }).to_string(),
            );
        }
    };

    let mut entries = Vec::new();
    for raw in tasks {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
            let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("task");
            let title = v.get("title").and_then(|x| x.as_str()).unwrap_or("");
            let body = v.get("body").and_then(|x| x.as_str()).unwrap_or("");
            let md = format!("# {}\n\n{}", title, body);
            entries.push(
                serde_json::json!({ "path": format!("data/tasks/{}.md", id), "content": md }),
            );
        }
    }

    let json = serde_json::to_string(&entries).unwrap_or_else(|_| "[]".into());

    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/json")],
        json,
    )
}

#[derive(Deserialize)]
pub struct ImportFile {
    pub path: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct ImportJsonRequest {
    pub kind: Option<String>,
    pub schema_version: Option<u32>,
    pub export_version: Option<u32>,
    pub platform: Option<String>,
    pub includes_blobs: Option<bool>,
    #[serde(default)]
    pub tasks: Vec<String>,
    #[serde(default)]
    pub stream_entries: Vec<String>,
    #[serde(default)]
    pub files: Vec<ImportFile>,
    #[serde(default)]
    pub settings: Vec<(String, String)>,
    #[serde(default)]
    pub blobs: Vec<ExportBlob>,
}

#[derive(Serialize)]
pub struct ImportJsonResponse {
    pub ok: bool,
    pub tasks_imported: usize,
    pub stream_imported: usize,
    pub settings_imported: usize,
    pub blobs_imported: usize,
}

#[derive(Clone)]
struct UserDataSnapshot {
    tasks: Vec<String>,
    stream_entries: Vec<String>,
    settings: Vec<(String, String)>,
    blobs: Vec<ExportBlob>,
}

async fn collect_snapshot(
    state: &AppState,
    relational_user_id: &str,
    settings_user_id: &str,
) -> Result<UserDataSnapshot, (StatusCode, Json<ErrorBody>)> {
    Ok(UserDataSnapshot {
        tasks: state
            .db
            .list_tasks_json(relational_user_id)
            .await
            .map_err(|e| internal(&e.to_string()))?,
        stream_entries: state
            .db
            .list_all_stream_json(relational_user_id)
            .await
            .map_err(|e| internal(&e.to_string()))?,
        settings: state
            .db
            .list_settings(settings_user_id)
            .await
            .map_err(|e| internal(&e.to_string()))?,
        blobs: collect_blob_exports(state, settings_user_id).await?,
    })
}

async fn restore_snapshot(
    state: &AppState,
    relational_user_id: &str,
    settings_user_id: &str,
    snapshot: &UserDataSnapshot,
) -> anyhow::Result<()> {
    let snapshot_task_ids = snapshot
        .tasks
        .iter()
        .map(|raw| extract_row_id(raw, "id"))
        .collect::<anyhow::Result<HashSet<_>>>()?;
    let current_tasks = state.db.list_tasks_json(relational_user_id).await?;
    for raw in current_tasks {
        let id = extract_row_id(&raw, "id")?;
        if !snapshot_task_ids.contains(&id) {
            state.db.delete_task_row(relational_user_id, &id).await?;
        }
    }
    for raw in &snapshot.tasks {
        state.db.upsert_task_json(relational_user_id, raw).await?;
    }

    let snapshot_stream_ids = snapshot
        .stream_entries
        .iter()
        .map(|raw| extract_row_id(raw, "id"))
        .collect::<anyhow::Result<HashSet<_>>>()?;
    let current_stream = state.db.list_all_stream_json(relational_user_id).await?;
    for raw in current_stream {
        let id = extract_row_id(&raw, "id")?;
        if !snapshot_stream_ids.contains(&id) {
            state
                .db
                .delete_stream_entry_row(relational_user_id, &id)
                .await?;
        }
    }
    for raw in &snapshot.stream_entries {
        state
            .db
            .upsert_stream_entry_json(relational_user_id, raw)
            .await?;
    }

    let snapshot_setting_keys = snapshot
        .settings
        .iter()
        .map(|(key, _)| key.clone())
        .collect::<HashSet<_>>();
    let current_settings = state.db.list_settings(settings_user_id).await?;
    for (key, _) in current_settings {
        if !snapshot_setting_keys.contains(&key) {
            state.db.delete_setting(settings_user_id, &key).await?;
        }
    }
    for (key, value) in &snapshot.settings {
        state.db.put_setting(settings_user_id, key, value).await?;
    }

    let snapshot_blob_ids = snapshot
        .blobs
        .iter()
        .map(|blob| blob.id.clone())
        .collect::<HashSet<_>>();
    let current_blobs = state.db.list_blob_metas(settings_user_id).await?;
    for blob in current_blobs {
        if snapshot_blob_ids.contains(&blob.id) {
            continue;
        }
        let path = blob_dir(state).join(blob_storage_name(&blob.id, &blob.filename));
        let _ = fs::remove_file(path).await;
        state.db.delete_blob_meta(&blob.id).await?;
    }

    fs::create_dir_all(blob_dir(state)).await?;
    for blob in &snapshot.blobs {
        let bytes = base64::engine::general_purpose::STANDARD.decode(&blob.content_base64)?;
        let path = blob_dir(state).join(blob_storage_name(&blob.id, &blob.filename));
        fs::write(path, bytes).await?;
        state
            .db
            .put_blob_meta(
                &blob.id,
                settings_user_id,
                &blob.filename,
                &blob.mime_type,
                blob.size,
            )
            .await?;
    }

    Ok(())
}

fn validate_import_json(body: &ImportJsonRequest) -> Result<(), (StatusCode, Json<ErrorBody>)> {
    if let Some(kind) = &body.kind {
        if kind != BACKUP_KIND {
            return Err(bad_request("Unsupported backup kind"));
        }
    }

    if let Some(schema_version) = body.schema_version {
        if schema_version != CURRENT_SCHEMA_VERSION {
            return Err(bad_request(&format!(
                "Unsupported schema_version: {}",
                schema_version
            )));
        }
    }

    for raw in &body.tasks {
        extract_row_id(raw, "id").map_err(|e| bad_request(&format!("Invalid task row: {}", e)))?;
    }
    for raw in &body.stream_entries {
        extract_row_id(raw, "id")
            .map_err(|e| bad_request(&format!("Invalid stream entry row: {}", e)))?;
    }
    for (key, _) in &body.settings {
        if key.trim().is_empty() {
            return Err(bad_request("Setting key must not be empty"));
        }
    }
    for blob in &body.blobs {
        if blob.id.trim().is_empty() || blob.filename.trim().is_empty() {
            return Err(bad_request("Blob id and filename are required"));
        }
        base64::engine::general_purpose::STANDARD
            .decode(&blob.content_base64)
            .map_err(|e| bad_request(&format!("Invalid blob payload for {}: {}", blob.id, e)))?;
    }

    Ok(())
}

pub async fn import_json(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(body): Json<ImportJsonRequest>,
) -> ApiResult<ImportJsonResponse> {
    let relational_user_id = data_partition(&state, &user_id);

    if !body.files.is_empty() {
        return Err(bad_request(
            "Legacy `files` import is no longer supported; use DB migration or re-export from a current client.",
        ));
    }

    validate_import_json(&body)?;
    let snapshot = collect_snapshot(&state, &relational_user_id, &user_id).await?;

    let result: Result<ImportJsonResponse, (StatusCode, Json<ErrorBody>)> = async {
        let stream_rows_by_id = body
            .stream_entries
            .iter()
            .map(|raw| {
                let value: Value = serde_json::from_str(raw)?;
                let id = value
                    .get("id")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing stream entry id"))?;
                Ok((id.to_string(), value))
            })
            .collect::<anyhow::Result<std::collections::HashMap<_, _>>>()
            .map_err(|e| bad_request(&format!("Invalid stream entry row: {}", e)))?;

        let mut tasks_imported = 0usize;
        for json in &body.tasks {
            let hydrated = hydrate_task_import_row(json, &stream_rows_by_id)
                .map_err(|e| bad_request(&format!("Invalid task row: {}", e)))?;
            state
                .db
                .upsert_task_json(&relational_user_id, &hydrated)
                .await
                .map_err(|e| internal(&format!("Failed importing task: {}", e)))?;
            tasks_imported += 1;
        }

        let mut stream_imported = 0usize;
        for json in &body.stream_entries {
            state
                .db
                .upsert_stream_entry_json(&relational_user_id, json)
                .await
                .map_err(|e| internal(&format!("Failed importing stream entry: {}", e)))?;
            stream_imported += 1;
        }

        let mut settings_imported = 0usize;
        for (key, value) in &body.settings {
            state
                .db
                .put_setting(&user_id, key, value)
                .await
                .map_err(|e| internal(&format!("Failed writing setting {}: {}", key, e)))?;
            settings_imported += 1;
        }

        fs::create_dir_all(blob_dir(&state))
            .await
            .map_err(|e| internal(&format!("Failed preparing blob directory: {}", e)))?;

        let mut blobs_imported = 0usize;
        for blob in &body.blobs {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(&blob.content_base64)
                .map_err(|e| {
                    bad_request(&format!("Invalid blob payload for {}: {}", blob.id, e))
                })?;
            let file_path = blob_dir(&state).join(blob_storage_name(&blob.id, &blob.filename));
            fs::write(&file_path, bytes)
                .await
                .map_err(|e| internal(&format!("Failed writing blob {}: {}", blob.id, e)))?;
            state
                .db
                .put_blob_meta(
                    &blob.id,
                    &user_id,
                    &blob.filename,
                    &blob.mime_type,
                    blob.size,
                )
                .await
                .map_err(|e| {
                    internal(&format!("Failed writing blob metadata {}: {}", blob.id, e))
                })?;
            blobs_imported += 1;
        }

        Ok(ImportJsonResponse {
            ok: true,
            tasks_imported,
            stream_imported,
            settings_imported,
            blobs_imported,
        })
    }
    .await;

    match result {
        Ok(response) => Ok(Json(response)),
        Err(err) => {
            if let Err(restore_err) =
                restore_snapshot(&state, &relational_user_id, &user_id, &snapshot).await
            {
                return Err(internal(&format!(
                    "Import failed and rollback also failed: {}; rollback error: {}",
                    err.1.error, restore_err
                )));
            }
            Err(err)
        }
    }
}

#[derive(Deserialize)]
pub struct ExportDiskRequest {
    pub path: String,
}

#[derive(Serialize)]
pub struct ExportDiskResponse {
    pub ok: bool,
    pub files_exported: usize,
}

pub async fn export_to_disk(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(body): Json<ExportDiskRequest>,
) -> ApiResult<ExportDiskResponse> {
    require_admin(&state, &user_id).await?;

    if body.path.trim().is_empty() {
        return Err(bad_request("Missing export path"));
    }

    let export_dir = crate::export::resolve_admin_export_dir(&state.config, &body.path)
        .map_err(|e| bad_request(&format!("Export path rejected: {}", e)))?;

    crate::routes::admin::log_admin_action(
        &user_id,
        "export_to_disk",
        export_dir.to_string_lossy().as_ref(),
    );

    let count = crate::export::full_export_to_disk(
        &state.db,
        &data_partition(&state, &user_id),
        &user_id,
        &export_dir,
        &blob_dir(&state),
        "server",
    )
    .await
    .map_err(|e| internal(&format!("Export failed: {}", e)))?;

    Ok(Json(ExportDiskResponse {
        ok: true,
        files_exported: count,
    }))
}

#[derive(Deserialize)]
pub struct SettingKeyParam {
    pub key: Option<String>,
}

#[derive(Deserialize)]
pub struct PutSettingBody {
    pub key: String,
    pub value: String,
}

pub async fn get_settings(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Query(params): Query<SettingKeyParam>,
) -> ApiResult<serde_json::Value> {
    if let Some(key) = &params.key {
        let value = state
            .db
            .get_setting(&user_id, key)
            .await
            .map_err(|e| internal(&e.to_string()))?;
        Ok(Json(serde_json::json!({ "key": key, "value": value })))
    } else {
        let all = state
            .db
            .list_settings(&user_id)
            .await
            .map_err(|e| internal(&e.to_string()))?;
        let map: serde_json::Map<String, serde_json::Value> = all
            .into_iter()
            .map(|(k, v)| (k, serde_json::Value::String(v)))
            .collect();
        Ok(Json(serde_json::Value::Object(map)))
    }
}

pub async fn put_setting(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(body): Json<PutSettingBody>,
) -> ApiResult<serde_json::Value> {
    if body.key.trim().is_empty() {
        return Err(bad_request("Setting key must not be empty"));
    }
    state
        .db
        .put_setting(&user_id, &body.key, &body.value)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    Ok(Json(serde_json::json!({ "ok": true, "key": body.key })))
}

pub async fn delete_setting(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Query(params): Query<SettingKeyParam>,
) -> ApiResult<serde_json::Value> {
    let key = params
        .key
        .ok_or_else(|| bad_request("Missing \"key\" query parameter"))?;
    state
        .db
        .delete_setting(&user_id, &key)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
