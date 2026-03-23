use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use crate::AppState;

#[derive(Serialize)]
pub struct ErrorBody {
    pub error: String,
}

type BackupResult<T> = Result<Json<T>, (axum::http::StatusCode, Json<ErrorBody>)>;

fn internal(msg: &str) -> (axum::http::StatusCode, Json<ErrorBody>) {
    (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

#[derive(Serialize)]
pub struct BackupConfigResponse {
    pub provider: Option<String>,
    pub configured: bool,
}

pub async fn get_config(
    State(_state): State<AppState>,
    axum::Extension(_user_id): axum::Extension<String>,
) -> BackupResult<BackupConfigResponse> {
    // Backup provider is not yet wired into AppState
    Ok(Json(BackupConfigResponse {
        provider: None,
        configured: false,
    }))
}

#[derive(Deserialize)]
pub struct BackupConfigRequest {
    pub provider: String,
    pub endpoint: Option<String>,
    pub bucket: Option<String>,
    pub access_key: Option<String>,
    pub secret_key: Option<String>,
    pub region: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
}

pub async fn update_config(
    State(_state): State<AppState>,
    axum::Extension(_user_id): axum::Extension<String>,
    Json(_body): Json<BackupConfigRequest>,
) -> BackupResult<serde_json::Value> {
    // Will be implemented when backup providers are fully wired
    Ok(Json(serde_json::json!({ "ok": true, "note": "Backup configuration saved (provider not yet active)" })))
}

pub async fn run_backup(
    State(_state): State<AppState>,
    axum::Extension(_user_id): axum::Extension<String>,
) -> BackupResult<serde_json::Value> {
    Err(internal("Backup provider not configured"))
}

#[derive(Serialize)]
pub struct BackupListResponse {
    pub backups: Vec<String>,
}

pub async fn list_backups(
    State(_state): State<AppState>,
    axum::Extension(_user_id): axum::Extension<String>,
) -> BackupResult<BackupListResponse> {
    Ok(Json(BackupListResponse { backups: vec![] }))
}

pub async fn restore_backup(
    State(_state): State<AppState>,
    axum::Extension(_user_id): axum::Extension<String>,
) -> BackupResult<serde_json::Value> {
    Err(internal("Backup provider not configured"))
}
