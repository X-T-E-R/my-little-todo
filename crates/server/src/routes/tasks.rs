use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
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

/// GET /api/tasks
pub async fn list_tasks(
    State(state): State<AppState>,
    axum::Extension(ext_id): axum::Extension<String>,
) -> ApiResult<Vec<String>> {
    let user_id = data_partition(&state, &ext_id);
    let rows = state
        .db
        .list_tasks_json(&user_id)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    Ok(Json(rows))
}

/// GET /api/tasks/:id
pub async fn get_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    axum::Extension(ext_id): axum::Extension<String>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    let user_id = data_partition(&state, &ext_id);
    let s = state
        .db
        .get_task_json(&user_id, &id)
        .await
        .map_err(|e| internal(&e.to_string()))?;

    let Some(raw) = s else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorBody {
                error: "Task not found".into(),
            }),
        ));
    };

    let v: Value =
        serde_json::from_str(&raw).map_err(|e| internal(&format!("Invalid task JSON: {}", e)))?;
    Ok(Json(v))
}

/// PUT /api/tasks/:id — body is full task JSON object
pub async fn put_task(
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
        .upsert_task_json(&user_id, &s)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    Ok(Json(json!({ "ok": true })))
}

/// DELETE /api/tasks/:id
pub async fn delete_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    axum::Extension(ext_id): axum::Extension<String>,
) -> ApiResult<Value> {
    let user_id = data_partition(&state, &ext_id);
    state
        .db
        .delete_task_row(&user_id, &id)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    Ok(Json(json!({ "ok": true })))
}
