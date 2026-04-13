use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use crate::AppState;

#[derive(Serialize)]
pub struct ErrorBody {
    pub error: String,
}

type BackupResult<T> = Result<Json<T>, (axum::http::StatusCode, Json<ErrorBody>)>;

fn forbidden(msg: &str) -> (axum::http::StatusCode, Json<ErrorBody>) {
    (
        axum::http::StatusCode::FORBIDDEN,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

fn internal(msg: &str) -> (axum::http::StatusCode, Json<ErrorBody>) {
    (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

async fn require_admin(
    state: &AppState,
    user_id: &str,
) -> Result<(), (axum::http::StatusCode, Json<ErrorBody>)> {
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

#[derive(Serialize)]
pub struct BackupConfigResponse {
    pub provider: Option<String>,
    pub configured: bool,
}

pub async fn get_config(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> BackupResult<BackupConfigResponse> {
    require_admin(&state, &user_id).await?;
    crate::routes::admin::log_admin_action(&user_id, "backup_get_config", "read");
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
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(_body): Json<BackupConfigRequest>,
) -> BackupResult<serde_json::Value> {
    require_admin(&state, &user_id).await?;
    crate::routes::admin::log_admin_action(&user_id, "backup_update_config", "not_implemented");
    Err((
        axum::http::StatusCode::NOT_IMPLEMENTED,
        Json(ErrorBody {
            error: "Server-side backup/sync target configuration is not implemented yet. Use the desktop app (Tauri) for WebDAV/API sync targets.".to_string(),
        }),
    ))
}

pub async fn run_backup(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> BackupResult<serde_json::Value> {
    require_admin(&state, &user_id).await?;
    crate::routes::admin::log_admin_action(&user_id, "backup_run", "not_configured");
    Err(internal("Backup provider not configured"))
}

#[derive(Serialize)]
pub struct BackupListResponse {
    pub backups: Vec<String>,
}

pub async fn list_backups(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> BackupResult<BackupListResponse> {
    require_admin(&state, &user_id).await?;
    crate::routes::admin::log_admin_action(&user_id, "backup_list", "not_configured");
    Ok(Json(BackupListResponse { backups: vec![] }))
}

pub async fn restore_backup(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> BackupResult<serde_json::Value> {
    require_admin(&state, &user_id).await?;
    crate::routes::admin::log_admin_action(&user_id, "backup_restore", "not_configured");
    Err(internal("Backup provider not configured"))
}
