use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::utils::validate_path;
use crate::AppState;

#[derive(Deserialize)]
pub struct PathParam {
    pub path: Option<String>,
}

#[derive(Deserialize)]
pub struct DirParam {
    pub dir: Option<String>,
}

#[derive(Serialize)]
pub struct FileResponse {
    pub path: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct PutBody {
    pub content: Option<String>,
}

#[derive(Serialize)]
pub struct OkResponse {
    pub ok: bool,
    pub path: String,
}

#[derive(Serialize)]
pub struct ListResponse {
    pub dir: String,
    pub files: Vec<String>,
}

#[derive(Serialize)]
pub struct ErrorBody {
    pub error: String,
}

type ApiResult<T> = Result<Json<T>, (axum::http::StatusCode, Json<ErrorBody>)>;

fn bad_request(msg: &str) -> (axum::http::StatusCode, Json<ErrorBody>) {
    (
        axum::http::StatusCode::BAD_REQUEST,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

fn internal_error(msg: &str) -> (axum::http::StatusCode, Json<ErrorBody>) {
    (
        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

fn resolve_path(state: &AppState, user_id: &str, path: &str) -> String {
    use crate::config::AuthMode;
    if state.config.auth_mode == AuthMode::Multi {
        format!("{}/{}", user_id, path)
    } else {
        path.to_string()
    }
}

pub async fn get_file(
    State(state): State<AppState>,
    Query(params): Query<PathParam>,
    axum::Extension(user_id): axum::Extension<String>,
) -> ApiResult<FileResponse> {
    let path = params
        .path
        .ok_or_else(|| bad_request("Missing \"path\" query parameter"))?;
    let path = validate_path(&path).map_err(|e| bad_request(&e.to_string()))?;
    let resolved = resolve_path(&state, &user_id, &path);

    let content = state
        .db
        .get_file(&resolved)
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    match content {
        Some(content) => Ok(Json(FileResponse { path, content })),
        None => Err((
            axum::http::StatusCode::NOT_FOUND,
            Json(ErrorBody {
                error: "File not found".into(),
            }),
        )),
    }
}

pub async fn put_file(
    State(state): State<AppState>,
    Query(params): Query<PathParam>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(body): Json<PutBody>,
) -> ApiResult<OkResponse> {
    let path = params
        .path
        .ok_or_else(|| bad_request("Missing \"path\" query parameter"))?;
    let path = validate_path(&path).map_err(|e| bad_request(&e.to_string()))?;
    let content = body
        .content
        .ok_or_else(|| bad_request("Missing \"content\" in request body"))?;
    let resolved = resolve_path(&state, &user_id, &path);

    state
        .db
        .put_file(&resolved, &content)
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    {
        let db = state.db.clone();
        let uid = user_id.clone();
        let p = path.clone();
        let c = content.clone();
        tokio::spawn(async move {
            crate::export::mirror_file_to_disk(&db, &uid, &p, &c).await;
        });
    }

    Ok(Json(OkResponse { ok: true, path }))
}

pub async fn delete_file(
    State(state): State<AppState>,
    Query(params): Query<PathParam>,
    axum::Extension(user_id): axum::Extension<String>,
) -> ApiResult<OkResponse> {
    let path = params
        .path
        .ok_or_else(|| bad_request("Missing \"path\" query parameter"))?;
    let path = validate_path(&path).map_err(|e| bad_request(&e.to_string()))?;
    let resolved = resolve_path(&state, &user_id, &path);

    state
        .db
        .delete_file(&resolved)
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    {
        let db = state.db.clone();
        let uid = user_id.clone();
        let p = path.clone();
        tokio::spawn(async move {
            crate::export::mirror_delete_from_disk(&db, &uid, &p).await;
        });
    }

    Ok(Json(OkResponse { ok: true, path }))
}

pub async fn list_files(
    State(state): State<AppState>,
    Query(params): Query<DirParam>,
    axum::Extension(user_id): axum::Extension<String>,
) -> ApiResult<ListResponse> {
    let dir = params
        .dir
        .ok_or_else(|| bad_request("Missing \"dir\" query parameter"))?;
    let resolved = resolve_path(&state, &user_id, &dir);

    let files = state
        .db
        .list_files(&resolved)
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    Ok(Json(ListResponse { dir, files }))
}
