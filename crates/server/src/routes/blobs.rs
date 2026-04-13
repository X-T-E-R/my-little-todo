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

#[derive(Serialize)]
pub struct FileHostConfigResponse {
    pub enabled: bool,
    pub max_size: i64,
    pub default_provider: String,
    pub public_base_url: String,
    pub allow_attachments: bool,
    pub storage: String,
    pub image_host_url: String,
}

#[derive(Deserialize)]
pub struct UpdateFileHostConfigRequest {
    pub enabled: Option<bool>,
    pub max_size: Option<i64>,
    pub default_provider: Option<String>,
    pub public_base_url: Option<String>,
}

struct EffectiveFileHostConfig {
    enabled: bool,
    max_size: i64,
    default_provider: String,
    public_base_url: String,
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

async fn is_admin(state: &AppState, user_id: &str) -> Result<bool, (StatusCode, Json<ErrorBody>)> {
    let user = state
        .db
        .get_user_by_id(user_id)
        .await
        .map_err(|e| internal_error(&e.to_string()))?;
    Ok(user.map(|u| u.is_admin).unwrap_or(false))
}

async fn check_attachments_enabled(state: &AppState) -> Result<(), (StatusCode, Json<ErrorBody>)> {
    let config = load_effective_file_host_config(state).await?;
    if !config.enabled {
        return Err(bad_request("File host is disabled by admin"));
    }
    Ok(())
}

async fn admin_settings_owner_id(
    state: &AppState,
) -> Result<Option<String>, (StatusCode, Json<ErrorBody>)> {
    let admin_users = state
        .db
        .list_users()
        .await
        .map_err(|e| internal_error(&e.to_string()))?;
    Ok(admin_users.into_iter().find(|u| u.is_admin).map(|u| u.id))
}

async fn get_admin_setting_with_fallback(
    state: &AppState,
    admin_id: &str,
    primary_key: &str,
    legacy_key: Option<&str>,
) -> Result<Option<String>, (StatusCode, Json<ErrorBody>)> {
    let primary = state
        .db
        .get_setting(admin_id, primary_key)
        .await
        .map_err(|e| internal_error(&e.to_string()))?;
    if primary.is_some() {
        return Ok(primary);
    }
    if let Some(legacy_key) = legacy_key {
        return state
            .db
            .get_setting(admin_id, legacy_key)
            .await
            .map_err(|e| internal_error(&e.to_string()));
    }
    Ok(None)
}

fn normalize_default_provider(raw: Option<String>) -> String {
    match raw.as_deref() {
        Some("local") | Some("local-files") => "local-files".to_string(),
        Some("mlt-server") => "mlt-server".to_string(),
        Some("webdav") => "webdav".to_string(),
        _ => "local-files".to_string(),
    }
}

fn provider_to_legacy_storage(provider: &str) -> String {
    match provider {
        "local-files" => "local".to_string(),
        "mlt-server" => "mlt-server".to_string(),
        "webdav" => "webdav".to_string(),
        _ => "local".to_string(),
    }
}

async fn load_effective_file_host_config(
    state: &AppState,
) -> Result<EffectiveFileHostConfig, (StatusCode, Json<ErrorBody>)> {
    let Some(admin_id) = admin_settings_owner_id(state).await? else {
        return Ok(EffectiveFileHostConfig {
            enabled: true,
            max_size: 10 * 1024 * 1024,
            default_provider: "local-files".to_string(),
            public_base_url: String::new(),
        });
    };

    let enabled = get_admin_setting_with_fallback(
        state,
        &admin_id,
        "admin:file-host:enabled",
        Some("admin:allow-attachments"),
    )
    .await?;
    let max_size = get_admin_setting_with_fallback(
        state,
        &admin_id,
        "admin:file-host:max-size",
        Some("admin:attachment-max-size"),
    )
    .await?;
    let default_provider = get_admin_setting_with_fallback(
        state,
        &admin_id,
        "admin:file-host:default-provider",
        Some("admin:attachment-storage"),
    )
    .await?;
    let public_base_url = get_admin_setting_with_fallback(
        state,
        &admin_id,
        "admin:file-host:public-base-url",
        Some("admin:image-host-url"),
    )
    .await?;

    Ok(EffectiveFileHostConfig {
        enabled: enabled.as_deref() != Some("false"),
        max_size: max_size
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(10 * 1024 * 1024),
        default_provider: normalize_default_provider(default_provider),
        public_base_url: public_base_url.unwrap_or_default(),
    })
}

fn file_host_config_response(config: &EffectiveFileHostConfig) -> FileHostConfigResponse {
    FileHostConfigResponse {
        enabled: config.enabled,
        max_size: config.max_size,
        default_provider: config.default_provider.clone(),
        public_base_url: config.public_base_url.clone(),
        allow_attachments: config.enabled,
        storage: provider_to_legacy_storage(&config.default_provider),
        image_host_url: config.public_base_url.clone(),
    }
}

async fn upload_blob_internal(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    mut multipart: Multipart,
    url_prefix: &str,
) -> Result<UploadResponse, (StatusCode, Json<ErrorBody>)> {
    check_attachments_enabled(&state).await?;

    let max_size = load_effective_file_host_config(&state).await?.max_size;

    let field = match multipart.next_field().await {
        Ok(Some(f)) => f,
        Ok(None) => return Err(bad_request("No file field in multipart body")),
        Err(e) => return Err(bad_request(&e.to_string())),
    };

    let filename = field.file_name().unwrap_or("upload").to_string();

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

    let url = format!("{}/{}", url_prefix, id);

    Ok(UploadResponse {
        id,
        url,
        filename,
        mime_type,
        size,
    })
}

pub async fn upload_blob(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    multipart: Multipart,
) -> ApiResult<UploadResponse> {
    Ok(Json(
        upload_blob_internal(
            State(state),
            axum::Extension(user_id),
            multipart,
            "/api/blobs",
        )
        .await?,
    ))
}

pub async fn upload_file_host(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    multipart: Multipart,
) -> ApiResult<UploadResponse> {
    Ok(Json(
        upload_blob_internal(
            State(state),
            axum::Extension(user_id),
            multipart,
            "/api/file-host",
        )
        .await?,
    ))
}

pub async fn get_blob(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
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

    let admin = is_admin(&state, &user_id).await?;
    if meta.owner != user_id && !admin {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorBody {
                error: "Not authorized to read this blob".into(),
            }),
        ));
    }

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
        let admin = is_admin(&state, &user_id).await?;
        if admin {
            state
                .db
                .delete_blob_meta(&id)
                .await
                .map_err(|e| internal_error(&e.to_string()))?;
            let ext = std::path::Path::new(&meta.filename)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("bin");
            let storage_name = format!("{}.{}", id, ext);
            let file_path = blob_dir(&state).join(&storage_name);
            let _ = fs::remove_file(&file_path).await;
            return Ok(Json(serde_json::json!({ "ok": true, "id": id })));
        }
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

pub async fn get_file_host(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Path(id): Path<String>,
) -> Result<Response, (StatusCode, Json<ErrorBody>)> {
    get_blob(State(state), axum::Extension(user_id), Path(id)).await
}

pub async fn delete_file_host(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Path(id): Path<String>,
) -> ApiResult<serde_json::Value> {
    delete_blob(State(state), axum::Extension(user_id), Path(id)).await
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
    let config = load_effective_file_host_config(&state).await?;
    Ok(Json(serde_json::to_value(file_host_config_response(&config)).map_err(|e| {
        internal_error(&e.to_string())
    })?))
}

pub async fn get_file_host_config(
    State(state): State<AppState>,
    axum::Extension(_user_id): axum::Extension<String>,
) -> ApiResult<FileHostConfigResponse> {
    let config = load_effective_file_host_config(&state).await?;
    Ok(Json(file_host_config_response(&config)))
}

pub async fn get_admin_file_host_config(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> ApiResult<FileHostConfigResponse> {
    let admin = is_admin(&state, &user_id).await?;
    if !admin {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorBody {
                error: "Admin access required".into(),
            }),
        ));
    }

    let config = load_effective_file_host_config(&state).await?;
    Ok(Json(file_host_config_response(&config)))
}

pub async fn put_admin_file_host_config(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(body): Json<UpdateFileHostConfigRequest>,
) -> ApiResult<serde_json::Value> {
    let admin = is_admin(&state, &user_id).await?;
    if !admin {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorBody {
                error: "Admin access required".into(),
            }),
        ));
    }

    if let Some(max_size) = body.max_size {
        if max_size <= 0 {
            return Err(bad_request("max_size must be positive"));
        }
    }

    if let Some(provider) = body.default_provider.as_deref() {
        if !matches!(provider, "local-files" | "mlt-server" | "webdav" | "local") {
            return Err(bad_request("default_provider must be local-files, mlt-server, or webdav"));
        }
    }

    let admin_id = admin_settings_owner_id(&state)
        .await?
        .unwrap_or_else(|| user_id.clone());
    let current = load_effective_file_host_config(&state).await?;
    let next_enabled = body.enabled.unwrap_or(current.enabled);
    let next_max_size = body.max_size.unwrap_or(current.max_size);
    let next_provider =
        normalize_default_provider(body.default_provider.or(Some(current.default_provider)));
    let next_public_base_url = body
        .public_base_url
        .unwrap_or(current.public_base_url);

    state
        .db
        .put_setting(
            &admin_id,
            "admin:file-host:enabled",
            if next_enabled { "true" } else { "false" },
        )
        .await
        .map_err(|e| internal_error(&e.to_string()))?;
    state
        .db
        .put_setting(
            &admin_id,
            "admin:file-host:max-size",
            &next_max_size.to_string(),
        )
        .await
        .map_err(|e| internal_error(&e.to_string()))?;
    state
        .db
        .put_setting(
            &admin_id,
            "admin:file-host:default-provider",
            &next_provider,
        )
        .await
        .map_err(|e| internal_error(&e.to_string()))?;
    state
        .db
        .put_setting(
            &admin_id,
            "admin:file-host:public-base-url",
            &next_public_base_url,
        )
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    state
        .db
        .put_setting(
            &admin_id,
            "admin:allow-attachments",
            if next_enabled { "true" } else { "false" },
        )
        .await
        .map_err(|e| internal_error(&e.to_string()))?;
    state
        .db
        .put_setting(
            &admin_id,
            "admin:attachment-max-size",
            &next_max_size.to_string(),
        )
        .await
        .map_err(|e| internal_error(&e.to_string()))?;
    state
        .db
        .put_setting(
            &admin_id,
            "admin:attachment-storage",
            &provider_to_legacy_storage(&next_provider),
        )
        .await
        .map_err(|e| internal_error(&e.to_string()))?;
    state
        .db
        .put_setting(
            &admin_id,
            "admin:image-host-url",
            &next_public_base_url,
        )
        .await
        .map_err(|e| internal_error(&e.to_string()))?;

    Ok(Json(serde_json::json!({
        "ok": true,
        "config": file_host_config_response(&EffectiveFileHostConfig {
            enabled: next_enabled,
            max_size: next_max_size,
            default_provider: next_provider,
            public_base_url: next_public_base_url,
        }),
    })))
}
