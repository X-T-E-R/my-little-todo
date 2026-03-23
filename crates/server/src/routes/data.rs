use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::config::{AuthMode, DbType, ServerConfig};
use crate::providers;
use crate::AppState;

// ── Shared error helpers ─────────────────────────────────────────────

#[derive(Serialize)]
pub struct ErrorBody {
    pub error: String,
}

type ApiResult<T> = Result<Json<T>, (StatusCode, Json<ErrorBody>)>;

fn bad_request(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (StatusCode::BAD_REQUEST, Json(ErrorBody { error: msg.into() }))
}

fn internal(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorBody { error: msg.into() }))
}

// ── GET /api/admin/storage — current storage info ────────────────────

#[derive(Serialize)]
pub struct StorageInfoResponse {
    pub db_type: String,
    pub data_dir: String,
    pub database_url: Option<String>,
    pub auth_mode: String,
    pub l0_config_toml: String,
}

pub async fn storage_info(
    State(state): State<AppState>,
    axum::Extension(_user_id): axum::Extension<String>,
) -> ApiResult<StorageInfoResponse> {
    let c = &state.config;
    Ok(Json(StorageInfoResponse {
        db_type: serde_json::to_value(&c.db_type)
            .ok()
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| format!("{:?}", c.db_type)),
        data_dir: c.data_dir.clone(),
        database_url: c.database_url.clone().map(|u| {
            // Mask credentials in URL
            if let Some(at) = u.find('@') {
                format!("***@{}", &u[at + 1..])
            } else {
                u
            }
        }),
        auth_mode: serde_json::to_value(&c.auth_mode)
            .ok()
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| format!("{:?}", c.auth_mode)),
        l0_config_toml: c.to_toml_string(),
    }))
}

// ── POST /api/admin/migrate — migrate data between backends ──────────

#[derive(Deserialize)]
pub struct MigrateRequest {
    pub target_db_type: String,
    pub target_data_dir: Option<String>,
    pub target_database_url: Option<String>,
}

#[derive(Serialize)]
pub struct MigrateResponse {
    pub ok: bool,
    pub files_migrated: usize,
    pub settings_migrated: usize,
    pub message: String,
}

pub async fn migrate_data(
    State(state): State<AppState>,
    axum::Extension(_user_id): axum::Extension<String>,
    Json(body): Json<MigrateRequest>,
) -> ApiResult<MigrateResponse> {
    let target_db = match body.target_db_type.as_str() {
        "sqlite" => DbType::Sqlite,
        "postgres" | "postgresql" => DbType::Postgres,
        "mysql" => DbType::Mysql,
        "mongodb" => DbType::Mongodb,
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
        auth_mode: state.config.auth_mode.clone(),
        jwt_secret: state.config.jwt_secret.clone(),
        default_admin_password: state.config.default_admin_password.clone(),
        static_dir: None,
    };

    let target_provider = providers::create_provider(&target_config)
        .await
        .map_err(|e| internal(&format!("Failed to create target provider: {}", e)))?;

    // Determine prefix for multi-user
    let prefix = if state.config.auth_mode == AuthMode::Multi {
        _user_id.clone()
    } else {
        String::new()
    };

    // Migrate files
    let all_files = state
        .db
        .list_all_files(&prefix)
        .await
        .map_err(|e| internal(&format!("Failed listing files: {}", e)))?;

    let mut files_migrated = 0usize;
    for file_path in &all_files {
        let full_path = if prefix.is_empty() {
            file_path.clone()
        } else {
            format!("{}/{}", prefix, file_path)
        };

        if let Ok(Some(content)) = state.db.get_file(&full_path).await {
            target_provider
                .put_file(&full_path, &content)
                .await
                .map_err(|e| {
                    internal(&format!("Failed writing file {}: {}", full_path, e))
                })?;
            files_migrated += 1;
        }
    }

    // Migrate settings
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
        files_migrated,
        settings_migrated,
        message: format!(
            "Migration complete. Update your config to use {:?} and restart.",
            body.target_db_type
        ),
    }))
}

// ── GET /api/export/json — export all user data as JSON ──────────────

#[derive(Serialize)]
pub struct ExportFile {
    pub path: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct ExportJsonResponse {
    pub files: Vec<ExportFile>,
    pub settings: Vec<(String, String)>,
}

pub async fn export_json(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> ApiResult<ExportJsonResponse> {
    let prefix = if state.config.auth_mode == AuthMode::Multi {
        user_id.clone()
    } else {
        String::new()
    };

    let all_paths = state
        .db
        .list_all_files(&prefix)
        .await
        .map_err(|e| internal(&e.to_string()))?;

    let mut files = Vec::with_capacity(all_paths.len());
    for rel in &all_paths {
        let full = if prefix.is_empty() {
            rel.clone()
        } else {
            format!("{}/{}", prefix, rel)
        };
        if let Ok(Some(content)) = state.db.get_file(&full).await {
            files.push(ExportFile {
                path: rel.clone(),
                content,
            });
        }
    }

    let settings = state
        .db
        .list_settings(&user_id)
        .await
        .map_err(|e| internal(&e.to_string()))?;

    Ok(Json(ExportJsonResponse { files, settings }))
}

// ── GET /api/export/markdown — download all .md files as concatenated JSON
//    (frontend can convert to ZIP via JSZip) ──────────────────────────

pub async fn export_markdown(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> impl IntoResponse {
    let prefix = if state.config.auth_mode == AuthMode::Multi {
        user_id.clone()
    } else {
        String::new()
    };

    let all_paths = match state.db.list_all_files(&prefix).await {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                [(header::CONTENT_TYPE, "application/json")],
                format!("{{\"error\":\"{}\"}}", e),
            );
        }
    };

    let mut entries = Vec::new();
    for rel in &all_paths {
        let full = if prefix.is_empty() {
            rel.clone()
        } else {
            format!("{}/{}", prefix, rel)
        };
        if let Ok(Some(content)) = state.db.get_file(&full).await {
            entries.push(serde_json::json!({ "path": rel, "content": content }));
        }
    }

    let json = serde_json::to_string(&entries).unwrap_or_else(|_| "[]".into());

    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/json")],
        json,
    )
}

// ── POST /api/import/json — import data from JSON (reverse of export_json) ───

#[derive(Deserialize)]
pub struct ImportFile {
    pub path: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct ImportJsonRequest {
    pub files: Vec<ImportFile>,
    #[serde(default)]
    pub settings: Vec<(String, String)>,
}

#[derive(Serialize)]
pub struct ImportJsonResponse {
    pub ok: bool,
    pub files_imported: usize,
    pub settings_imported: usize,
}

pub async fn import_json(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(body): Json<ImportJsonRequest>,
) -> ApiResult<ImportJsonResponse> {
    let prefix = if state.config.auth_mode == AuthMode::Multi {
        user_id.clone()
    } else {
        String::new()
    };

    let mut files_imported = 0usize;
    for file in &body.files {
        let validated = crate::utils::validate_path(&file.path)
            .map_err(|e| bad_request(&format!("Invalid path '{}': {}", file.path, e)))?;
        let full = if prefix.is_empty() {
            validated
        } else {
            format!("{}/{}", prefix, validated)
        };
        state
            .db
            .put_file(&full, &file.content)
            .await
            .map_err(|e| internal(&format!("Failed writing file {}: {}", full, e)))?;
        files_imported += 1;
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

    Ok(Json(ImportJsonResponse {
        ok: true,
        files_imported,
        settings_imported,
    }))
}

// ── POST /api/export/disk — full export to a local directory ──────────

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
    let prefix = if state.config.auth_mode == AuthMode::Multi {
        user_id.clone()
    } else {
        String::new()
    };

    let count = crate::export::full_export_to_disk(&state.db, &user_id, &body.path, &prefix)
        .await
        .map_err(|e| internal(&format!("Export failed: {}", e)))?;

    Ok(Json(ExportDiskResponse {
        ok: true,
        files_exported: count,
    }))
}

// ── Settings CRUD ─────────────────────────────────────────────────────

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
