use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::fs;

use crate::AppState;

#[derive(Serialize)]
pub struct ErrorBody {
    pub error: String,
}

#[derive(Serialize)]
pub struct UploadResponse {
    pub id: String,
    pub url: String,
    pub filename: String,
    pub mime_type: String,
    pub size: i64,
}

#[derive(Deserialize)]
pub struct ListQuery {
    pub limit: Option<i64>,
}

type ApiResult<T> = Result<Json<T>, (StatusCode, Json<ErrorBody>)>;

fn bad_request(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

fn internal_error(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

fn blob_dir(state: &AppState) -> PathBuf {
    PathBuf::from(&state.config.data_dir).join("blobs")
}

async fn check_attachments_enabled(state: &AppState) -> Result<(), (StatusCode, Json<ErrorBody>)> {
    let admin_users = state.db.list_users().await.map_err(|e| internal_error(&e.to_string()))?;
    let admin = admin_users.into_iter().find(|u| u.is_admin);
    if let Some(admin) = admin {
        let enabled = state
            .db
            .get_setting(&admin.id, "admin:allow-attachments")
            .await
            .map_err(|e| internal_error(&e.to_string()))?;
        if enabled.as_deref() == Some("false") {
            return Err(bad_request("Attachments are disabled by admin"));
        }
    }
    Ok(())
}

pub async fn upload_blob(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    mut multipart: Multipart,
) -> ApiResult<UploadResponse> {
    check_attachments_enabled(&state).await?;

    let max_size: i64 = {
        let admin_users = state.db.list_users().await.unwrap_or_default();
        let admin = admin_users.into_iter().find(|u| u.is_admin);
        if let Some(admin) = admin {
            state
                .db
                .get_setting(&admin.id, "admin:attachment-max-size")
                .await
                .ok()
                .flatten()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10 * 1024 * 1024) // 10MB default
        } else {
            10 * 1024 * 1024
        }
    };

    let field = match multipart.next_field().await {
        Ok(Some(f)) => f,
        Ok(None) => return Err(bad_request("No file field in multipart body")),
        Err(e) => return Err(bad_request(&e.to_string())),
    };

    let filename = field
        .file_name()
        .unwrap_or("upload")
        .to_string();

    let mime_type = field
        .content_type()
        .unwrap_or("application/octet-stream")
        .to_string();

    let data = match field.bytes().await {
        Ok(d) => d,
        Err(e) => return Err(bad_request(&e.to_string())),
    };

    if data.len() as i64 > max_size {
        return Err(bad_request(&format!(
            "File too large: {} bytes (max: {} bytes)",
            data.len(),
            max_size
        )));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let ext = std::path::Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let storage_name = format!("{}.{}", id, ext);

    let dir = blob_dir(&state);
    fs::create_dir_all(&dir)
        .await
        .map_err(|e: std::io::Error| internal_error(&e.to_string()))?;

    let file_path = dir.join(&storage_name);
    fs::write(&file_path, &data)
        .await
        .map_err(|e: std::io::Error| internal_error(&e.to_string()))?;

    let size = data.len() as i64;

    state
        .db
        .put_blob_meta(&id, &user_id, &filename, &mime_type, size)
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    let url = format!("/api/blobs/{}", id);

    Ok(Json(UploadResponse {
        id,
        url,
        filename,
        mime_type,
        size,
    }))
}

pub async fn get_blob(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, (StatusCode, Json<ErrorBody>)> {
    let meta = state
        .db
        .get_blob_meta(&id)
        .await
        .map_err(|e| internal_error(&e.to_string()))?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorBody {
                    error: "Blob not found".into(),
                }),
            )
        })?;

    let ext = std::path::Path::new(&meta.filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let storage_name = format!("{}.{}", id, ext);
    let file_path = blob_dir(&state).join(&storage_name);

    let data = fs::read(&file_path)
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, &meta.mime_type)
        .header(
            header::CONTENT_DISPOSITION,
            format!("inline; filename=\"{}\"", meta.filename),
        )
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(Body::from(data))
        .map_err(|e| internal_error(&e.to_string()))?;

    Ok(response)
}

pub async fn delete_blob(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Path(id): Path<String>,
) -> ApiResult<serde_json::Value> {
    let meta = state
        .db
        .get_blob_meta(&id)
        .await
        .map_err(|e| internal_error(&e.to_string()))?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorBody {
                    error: "Blob not found".into(),
                }),
            )
        })?;

    if meta.owner != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorBody {
                error: "Not the owner of this blob".into(),
            }),
        ));
    }

    let ext = std::path::Path::new(&meta.filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let storage_name = format!("{}.{}", id, ext);
    let file_path = blob_dir(&state).join(&storage_name);

    let _ = fs::remove_file(&file_path).await;

    state
        .db
        .delete_blob_meta(&id)
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true, "id": id })))
}

pub async fn list_blobs(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Query(_params): Query<ListQuery>,
) -> ApiResult<Vec<crate::providers::BlobMeta>> {
    let blobs = state
        .db
        .list_blob_metas(&user_id)
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    Ok(Json(blobs))
}

pub async fn get_attachment_config(
    State(state): State<AppState>,
    axum::Extension(_user_id): axum::Extension<String>,
) -> ApiResult<serde_json::Value> {
    let admin_users = state
        .db
        .list_users()
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    let admin = admin_users.into_iter().find(|u| u.is_admin);
    let admin_id = match admin {
        Some(u) => u.id,
        None => {
            return Ok(Json(serde_json::json!({
                "allow_attachments": true,
                "max_size": 10 * 1024 * 1024,
                "storage": "local",
            })));
        }
    };

    let allow = state
        .db
        .get_setting(&admin_id, "admin:allow-attachments")
        .await
        .map_err(|e| internal_error(&e.to_string()))?
        .unwrap_or_else(|| "true".to_string());

    let max_size = state
        .db
        .get_setting(&admin_id, "admin:attachment-max-size")
        .await
        .map_err(|e| internal_error(&e.to_string()))?
        .unwrap_or_else(|| (10 * 1024 * 1024).to_string());

    let storage = state
        .db
        .get_setting(&admin_id, "admin:attachment-storage")
        .await
        .map_err(|e| internal_error(&e.to_string()))?
        .unwrap_or_else(|| "local".to_string());

    let image_host_url = state
        .db
        .get_setting(&admin_id, "admin:image-host-url")
        .await
        .map_err(|e| internal_error(&e.to_string()))?
        .unwrap_or_default();

    Ok(Json(serde_json::json!({
        "allow_attachments": allow == "true",
        "max_size": max_size.parse::<i64>().unwrap_or(10 * 1024 * 1024),
        "storage": storage,
        "image_host_url": image_host_url,
    })))
}
