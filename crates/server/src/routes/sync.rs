use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::config::AuthMode;
use crate::providers::traits::ChangeRecord;
use crate::AppState;

fn data_partition(state: &AppState, ext_user_id: &str) -> String {
    match state.config.auth_mode {
        AuthMode::Multi => ext_user_id.to_string(),
        AuthMode::Single | AuthMode::None => String::new(),
    }
}

#[derive(Deserialize)]
pub struct SinceParam {
    pub since: Option<i64>,
}

#[derive(Serialize)]
pub struct ChangesResponse {
    pub changes: Vec<ChangeRecord>,
    pub current_version: i64,
}

#[derive(Serialize)]
pub struct StatusResponse {
    pub current_version: i64,
}

#[derive(Deserialize)]
pub struct PushRequest {
    pub changes: Vec<ChangeRecord>,
}

#[derive(Serialize)]
pub struct PushResponse {
    pub ok: bool,
    pub applied: usize,
    pub current_version: i64,
}

#[derive(Serialize)]
pub struct ErrorBody {
    pub error: String,
}

type ApiResult<T> = Result<Json<T>, (axum::http::StatusCode, Json<ErrorBody>)>;

fn internal(msg: &str) -> (axum::http::StatusCode, Json<ErrorBody>) {
    (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

/// GET /api/sync/changes?since={version}
pub async fn get_changes(
    State(state): State<AppState>,
    Query(params): Query<SinceParam>,
    axum::Extension(ext_id): axum::Extension<String>,
) -> ApiResult<ChangesResponse> {
    let user_id = data_partition(&state, &ext_id);
    let since = params.since.unwrap_or(0);
    let changes = state
        .db
        .get_changes_since(&user_id, since)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    let current_version = match state.config.auth_mode {
        AuthMode::Multi => state
            .db
            .get_max_version_for_user(&user_id)
            .await
            .map_err(|e| internal(&e.to_string()))?,
        AuthMode::Single | AuthMode::None => state
            .db
            .get_max_version()
            .await
            .map_err(|e| internal(&e.to_string()))?,
    };

    Ok(Json(ChangesResponse {
        changes,
        current_version,
    }))
}

/// GET /api/sync/status
pub async fn get_status(
    State(state): State<AppState>,
    axum::Extension(ext_id): axum::Extension<String>,
) -> ApiResult<StatusResponse> {
    let user_id = data_partition(&state, &ext_id);
    let current_version = match state.config.auth_mode {
        AuthMode::Multi => state
            .db
            .get_max_version_for_user(&user_id)
            .await
            .map_err(|e| internal(&e.to_string()))?,
        AuthMode::Single | AuthMode::None => state
            .db
            .get_max_version()
            .await
            .map_err(|e| internal(&e.to_string()))?,
    };
    Ok(Json(StatusResponse { current_version }))
}

/// POST /api/sync/push
pub async fn push_changes(
    State(state): State<AppState>,
    axum::Extension(ext_id): axum::Extension<String>,
    Json(body): Json<PushRequest>,
) -> ApiResult<PushResponse> {
    let user_id = data_partition(&state, &ext_id);
    let applied = body.changes.len();
    state
        .db
        .apply_remote_changes_batch(&user_id, &body.changes)
        .await
        .map_err(|e| internal(&e.to_string()))?;

    let current_version = match state.config.auth_mode {
        AuthMode::Multi => state
            .db
            .get_max_version_for_user(&user_id)
            .await
            .map_err(|e| internal(&e.to_string()))?,
        AuthMode::Single | AuthMode::None => state
            .db
            .get_max_version()
            .await
            .map_err(|e| internal(&e.to_string()))?,
    };

    Ok(Json(PushResponse {
        ok: true,
        applied,
        current_version,
    }))
}
