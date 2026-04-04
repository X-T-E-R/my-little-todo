use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::config::AuthMode;
use crate::AppState;

fn data_partition(state: &AppState, ext_user_id: &str) -> String {
    match state.config.auth_mode {
        AuthMode::Multi => ext_user_id.to_string(),
        AuthMode::Single | AuthMode::None => String::new(),
    }
}

#[derive(serde::Serialize)]
pub struct ErrorBody {
    pub error: String,
}

type ApiResult<T> = Result<Json<T>, (StatusCode, Json<ErrorBody>)>;

fn internal(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorBody {
            error: msg.into(),
        }),
    )
}

#[derive(Deserialize)]
pub struct StreamDateQuery {
    pub date: String,
}

#[derive(Deserialize)]
pub struct StreamRecentQuery {
    #[serde(default = "default_days")]
    pub days: i32,
}

fn default_days() -> i32 {
    14
}

/// GET /api/stream?date=YYYY-MM-DD
pub async fn list_stream_day(
    State(state): State<AppState>,
    Query(q): Query<StreamDateQuery>,
    axum::Extension(ext_id): axum::Extension<String>,
) -> ApiResult<Vec<String>> {
    let user_id = data_partition(&state, &ext_id);
    let rows = state
        .db
        .list_stream_day_json(&user_id, &q.date)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    Ok(Json(rows))
}

/// GET /api/stream/dates — distinct YYYY-MM-DD keys (newest first)
pub async fn list_stream_dates(
    State(state): State<AppState>,
    axum::Extension(ext_id): axum::Extension<String>,
) -> ApiResult<Vec<String>> {
    let user_id = data_partition(&state, &ext_id);
    let rows = state
        .db
        .list_stream_date_keys(&user_id)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    Ok(Json(rows))
}

/// GET /api/stream/recent?days=14
pub async fn list_stream_recent(
    State(state): State<AppState>,
    Query(q): Query<StreamRecentQuery>,
    axum::Extension(ext_id): axum::Extension<String>,
) -> ApiResult<Vec<String>> {
    let user_id = data_partition(&state, &ext_id);
    let rows = state
        .db
        .list_stream_recent_json(&user_id, q.days)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    Ok(Json(rows))
}

/// PUT /api/stream/:id — body is full stream entry JSON
pub async fn put_stream_entry(
    State(state): State<AppState>,
    Path(id): Path<String>,
    axum::Extension(ext_id): axum::Extension<String>,
    Json(mut body): Json<Value>,
) -> ApiResult<Value> {
    let user_id = data_partition(&state, &ext_id);
    if let Some(obj) = body.as_object_mut() {
        obj.insert("id".into(), json!(id));
    }
    let s = body.to_string();
    state
        .db
        .upsert_stream_entry_json(&user_id, &s)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    Ok(Json(json!({ "ok": true })))
}

/// DELETE /api/stream/:id
pub async fn delete_stream_entry(
    State(state): State<AppState>,
    Path(id): Path<String>,
    axum::Extension(ext_id): axum::Extension<String>,
) -> ApiResult<Value> {
    let user_id = data_partition(&state, &ext_id);
    state
        .db
        .delete_stream_entry_row(&user_id, &id)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    Ok(Json(json!({ "ok": true })))
}
