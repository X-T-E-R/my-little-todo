use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde_json::{json, Value};

use crate::task_stream_facade;
use crate::AppState;

fn data_partition(state: &AppState, ext_user_id: &str) -> String {
    let _ = state;
    ext_user_id.to_string()
}

#[derive(serde::Serialize)]
pub struct ErrorBody {
    pub error: String,
}

type ApiResult<T> = Result<Json<T>, (StatusCode, Json<ErrorBody>)>;

fn internal(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorBody { error: msg.into() }),
    )
}

fn bad_request(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorBody { error: msg.into() }),
    )
}

/// GET /api/tasks
pub async fn list_tasks(
    State(state): State<AppState>,
    axum::Extension(ext_id): axum::Extension<String>,
) -> ApiResult<Vec<Value>> {
    let user_id = data_partition(&state, &ext_id);
    let rows = task_stream_facade::list_tasks(state.db.as_ref(), &user_id)
        .await
        .map_err(|e| internal(&e))?;
    Ok(Json(rows))
}

/// GET /api/tasks/:id
pub async fn get_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    axum::Extension(ext_id): axum::Extension<String>,
) -> Result<Json<Value>, (StatusCode, Json<ErrorBody>)> {
    let user_id = data_partition(&state, &ext_id);
    let Some(task) = task_stream_facade::get_task(state.db.as_ref(), &user_id, &id)
        .await
        .map_err(|e| internal(&e))?
    else {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorBody {
                error: "Task not found".into(),
            }),
        ));
    };
    Ok(Json(task))
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
    task_stream_facade::validate_public_task_payload(&body).map_err(|e| bad_request(&e))?;
    let task = task_stream_facade::put_task(state.db.as_ref(), &user_id, &id, &body)
        .await
        .map_err(|e| internal(&e))?;
    Ok(Json(task))
}

/// DELETE /api/tasks/:id
pub async fn delete_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    axum::Extension(ext_id): axum::Extension<String>,
) -> ApiResult<Value> {
    let user_id = data_partition(&state, &ext_id);
    task_stream_facade::delete_task(state.db.as_ref(), &user_id, &id)
        .await
        .map_err(|e| internal(&e))?;
    Ok(Json(json!({ "ok": true })))
}
