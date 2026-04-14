use axum::{
    body::{to_bytes, Body},
    extract::{Path, State},
    http::{HeaderName, Request, Response, StatusCode},
    response::IntoResponse,
    Json,
};
use reqwest::Client;
use serde_json::{json, Value};

use crate::extension_registry::{ExtensionStatus, RegisteredExtension};
use crate::work_thread_facade;
use crate::AppState;

const INSTALLED_REGISTRY_KEY: &str = "plugin:_system:installed_registry";

pub async fn list_work_threads(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> (StatusCode, Json<Value>) {
    match ensure_work_thread_enabled(&state, &user_id).await {
        Ok(()) => match work_thread_facade::list_threads(state.db.as_ref(), &user_id, 200).await {
            Ok(threads) => (StatusCode::OK, Json(json!({ "threads": threads }))),
            Err(error) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": error })),
            ),
        },
        Err(resp) => resp,
    }
}

pub async fn create_work_thread(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(payload): Json<Value>,
) -> (StatusCode, Json<Value>) {
    match ensure_work_thread_enabled(&state, &user_id).await {
        Ok(()) => {
            match work_thread_facade::create_thread(state.db.as_ref(), &user_id, &payload).await {
                Ok(thread) => (StatusCode::OK, Json(thread)),
                Err(error) => (StatusCode::BAD_REQUEST, Json(json!({ "error": error }))),
            }
        }
        Err(resp) => resp,
    }
}

pub async fn get_work_thread(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Path(id): Path<String>,
) -> (StatusCode, Json<Value>) {
    match ensure_work_thread_enabled(&state, &user_id).await {
        Ok(()) => match work_thread_facade::get_thread(state.db.as_ref(), &user_id, &id).await {
            Ok(Some(thread)) => (StatusCode::OK, Json(thread)),
            Ok(None) => (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": format!("Thread not found: {}", id) })),
            ),
            Err(error) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": error })),
            ),
        },
        Err(resp) => resp,
    }
}

pub async fn update_work_thread(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Path(id): Path<String>,
    Json(payload): Json<Value>,
) -> (StatusCode, Json<Value>) {
    match ensure_work_thread_enabled(&state, &user_id).await {
        Ok(()) => {
            match work_thread_facade::update_thread(state.db.as_ref(), &user_id, &id, &payload)
                .await
            {
                Ok(thread) => (StatusCode::OK, Json(thread)),
                Err(error) if error.contains("not found") => {
                    (StatusCode::NOT_FOUND, Json(json!({ "error": error })))
                }
                Err(error) => (StatusCode::BAD_REQUEST, Json(json!({ "error": error }))),
            }
        }
        Err(resp) => resp,
    }
}

pub async fn delete_work_thread(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Path(id): Path<String>,
) -> (StatusCode, Json<Value>) {
    match ensure_work_thread_enabled(&state, &user_id).await {
        Ok(()) => match work_thread_facade::delete_thread(state.db.as_ref(), &user_id, &id).await {
            Ok(true) => (StatusCode::OK, Json(json!({ "id": id, "deleted": true }))),
            Ok(false) => (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": format!("Thread not found: {}", id) })),
            ),
            Err(error) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": error })),
            ),
        },
        Err(resp) => resp,
    }
}

pub async fn set_work_thread_status(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Path(id): Path<String>,
    Json(payload): Json<Value>,
) -> (StatusCode, Json<Value>) {
    match ensure_work_thread_enabled(&state, &user_id).await {
        Ok(()) => {
            let status = payload
                .get("status")
                .and_then(|value| value.as_str())
                .unwrap_or("");
            match work_thread_facade::set_thread_status(state.db.as_ref(), &user_id, &id, status)
                .await
            {
                Ok(thread) => (StatusCode::OK, Json(thread)),
                Err(error) if error.contains("not found") => {
                    (StatusCode::NOT_FOUND, Json(json!({ "error": error })))
                }
                Err(error) => (StatusCode::BAD_REQUEST, Json(json!({ "error": error }))),
            }
        }
        Err(resp) => resp,
    }
}

pub async fn checkpoint_work_thread(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Path(id): Path<String>,
    Json(payload): Json<Value>,
) -> (StatusCode, Json<Value>) {
    match ensure_work_thread_enabled(&state, &user_id).await {
        Ok(()) => {
            let title = payload.get("title").and_then(|value| value.as_str());
            match work_thread_facade::checkpoint_thread(state.db.as_ref(), &user_id, &id, title)
                .await
            {
                Ok(thread) => (StatusCode::OK, Json(thread)),
                Err(error) if error.contains("not found") => {
                    (StatusCode::NOT_FOUND, Json(json!({ "error": error })))
                }
                Err(error) => (StatusCode::BAD_REQUEST, Json(json!({ "error": error }))),
            }
        }
        Err(resp) => resp,
    }
}

pub async fn list_work_thread_events(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Path(id): Path<String>,
) -> (StatusCode, Json<Value>) {
    match ensure_work_thread_enabled(&state, &user_id).await {
        Ok(()) => {
            match work_thread_facade::list_events(state.db.as_ref(), &user_id, &id, 300).await {
                Ok(events) => (StatusCode::OK, Json(json!({ "events": events }))),
                Err(error) => (StatusCode::BAD_REQUEST, Json(json!({ "error": error }))),
            }
        }
        Err(resp) => resp,
    }
}

pub async fn append_work_thread_event(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Path(id): Path<String>,
    Json(payload): Json<Value>,
) -> (StatusCode, Json<Value>) {
    match ensure_work_thread_enabled(&state, &user_id).await {
        Ok(()) => {
            match work_thread_facade::append_event(state.db.as_ref(), &user_id, &id, &payload).await
            {
                Ok(event) => (StatusCode::OK, Json(event)),
                Err(error) if error.contains("not found") => {
                    (StatusCode::NOT_FOUND, Json(json!({ "error": error })))
                }
                Err(error) => (StatusCode::BAD_REQUEST, Json(json!({ "error": error }))),
            }
        }
        Err(resp) => resp,
    }
}

pub async fn register_plugin_extension(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(payload): Json<RegisteredExtension>,
) -> (StatusCode, Json<Value>) {
    match inspect_plugin_server_extension(&state, &user_id, &payload.plugin_id).await {
        Ok(PluginGatewayState::Unknown) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": format!("Plugin provider '{}' not found", payload.plugin_id) })),
        ),
        Ok(PluginGatewayState::Disabled(reason)) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": reason })),
        ),
        Ok(PluginGatewayState::Unavailable(_)) | Ok(PluginGatewayState::Running(_)) => {
            state.extension_registry.upsert(payload.clone()).await;
            (
                StatusCode::OK,
                Json(json!({
                    "ok": true,
                    "pluginId": payload.plugin_id,
                    "status": payload.status,
                })),
            )
        }
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": error })),
        ),
    }
}

pub async fn unregister_plugin_extension(
    State(state): State<AppState>,
    Path(plugin_id): Path<String>,
) -> (StatusCode, Json<Value>) {
    state.extension_registry.remove(&plugin_id).await;
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "pluginId": plugin_id,
        })),
    )
}

pub async fn handle_plugin_gateway_root(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Path(plugin_id): Path<String>,
    req: Request<Body>,
) -> Response<Body> {
    plugin_gateway_response(&state, &user_id, &plugin_id, "", req).await
}

pub async fn handle_plugin_gateway_path(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Path((plugin_id, rest)): Path<(String, String)>,
    req: Request<Body>,
) -> Response<Body> {
    plugin_gateway_response(&state, &user_id, &plugin_id, &rest, req).await
}

async fn plugin_gateway_response(
    state: &AppState,
    user_id: &str,
    plugin_id: &str,
    path: &str,
    req: Request<Body>,
) -> Response<Body> {
    match plugin_id {
        "work-thread" => {
            if !work_thread_facade::work_thread_enabled(state.db.as_ref(), user_id).await {
                return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({ "error": "Plugin provider 'work-thread' is disabled" })),
                )
                    .into_response();
            }
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": format!("Unknown work-thread route: /{}", path) })),
            )
                .into_response()
        }
        _ => match inspect_plugin_server_extension(state, user_id, plugin_id).await {
            Ok(PluginGatewayState::Unknown) => (
                StatusCode::NOT_FOUND,
                Json(
                    json!({ "error": format!("Plugin route provider '{}' not found", plugin_id) }),
                ),
            )
                .into_response(),
            Ok(PluginGatewayState::Disabled(reason)) => (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": reason })),
            )
                .into_response(),
            Ok(PluginGatewayState::Unavailable(reason)) => (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": reason })),
            )
                .into_response(),
            Ok(PluginGatewayState::Running(extension)) => {
                let request_path = normalize_route_path(path);
                let method = req.method().as_str().to_string();
                if state
                    .extension_registry
                    .find_http_route(plugin_id, &method, &request_path)
                    .await
                    .is_none()
                {
                    return (
                        StatusCode::NOT_FOUND,
                        Json(json!({ "error": format!("Unknown plugin route: {} {}", method, request_path) })),
                    )
                        .into_response();
                }
                match proxy_plugin_request(&extension, &request_path, req).await {
                    Ok(response) => response,
                    Err(error) => {
                        (StatusCode::BAD_GATEWAY, Json(json!({ "error": error }))).into_response()
                    }
                }
            }
            Err(error) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": error })),
            )
                .into_response(),
        },
    }
}

async fn proxy_plugin_request(
    extension: &RegisteredExtension,
    request_path: &str,
    req: Request<Body>,
) -> Result<Response<Body>, String> {
    let client = Client::new();
    let method = req.method().clone();
    let query = req
        .uri()
        .query()
        .map(|value| format!("?{}", value))
        .unwrap_or_default();
    let target = format!(
        "{}{}{}",
        extension.proxy_base_url.trim_end_matches('/'),
        request_path,
        query
    );

    let mut request_builder = client.request(
        reqwest::Method::from_bytes(method.as_str().as_bytes()).map_err(|e| e.to_string())?,
        target,
    );
    for (name, value) in req.headers() {
        if should_skip_request_header(name) {
            continue;
        }
        request_builder = request_builder.header(name.as_str(), value.as_bytes());
    }
    if let Some(token) = &extension.runner_token {
        request_builder = request_builder.header("x-mlt-plugin-token", token);
    }
    let body_bytes = to_bytes(req.into_body(), usize::MAX)
        .await
        .map_err(|e| e.to_string())?;
    let upstream = request_builder
        .body(body_bytes.to_vec())
        .send()
        .await
        .map_err(|e| format!("Plugin route proxy failed: {}", e))?;

    let status = upstream.status();
    let headers = upstream.headers().clone();
    let body = upstream
        .bytes()
        .await
        .map_err(|e| format!("Plugin route proxy body failed: {}", e))?;

    let mut response = Response::builder().status(status.as_u16());
    for (name, value) in headers.iter() {
        if should_skip_response_header(name) {
            continue;
        }
        response = response.header(name, value);
    }
    response
        .body(Body::from(body.to_vec()))
        .map_err(|e| e.to_string())
}

fn should_skip_request_header(name: &HeaderName) -> bool {
    matches!(
        name.as_str().to_ascii_lowercase().as_str(),
        "host" | "content-length" | "authorization"
    )
}

fn should_skip_response_header(name: &HeaderName) -> bool {
    matches!(
        name.as_str().to_ascii_lowercase().as_str(),
        "content-length" | "transfer-encoding" | "connection"
    )
}

async fn ensure_work_thread_enabled(
    state: &AppState,
    user_id: &str,
) -> Result<(), (StatusCode, Json<Value>)> {
    if work_thread_facade::work_thread_enabled(state.db.as_ref(), user_id).await {
        Ok(())
    } else {
        Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "error": "Plugin provider 'work-thread' is disabled" })),
        ))
    }
}

enum PluginGatewayState {
    Unknown,
    Disabled(String),
    Unavailable(String),
    Running(RegisteredExtension),
}

async fn inspect_plugin_server_extension(
    state: &AppState,
    user_id: &str,
    plugin_id: &str,
) -> Result<PluginGatewayState, String> {
    let raw = state
        .db
        .get_setting(user_id, INSTALLED_REGISTRY_KEY)
        .await
        .map_err(|e| e.to_string())?;
    let Some(raw) = raw else {
        return Ok(PluginGatewayState::Unknown);
    };
    let parsed = serde_json::from_str::<Value>(&raw).map_err(|e| e.to_string())?;
    let Some(record) = parsed.get(plugin_id) else {
        return Ok(PluginGatewayState::Unknown);
    };

    let enabled = record
        .get("enabled")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    if !enabled {
        return Ok(PluginGatewayState::Disabled(format!(
            "Plugin provider '{}' is disabled",
            plugin_id
        )));
    }

    let manifest = record.get("manifest").unwrap_or(&Value::Null);
    if manifest.get("server").is_none() {
        return Ok(PluginGatewayState::Unknown);
    }

    let approved = record
        .get("serverApproved")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    if !approved {
        return Ok(PluginGatewayState::Disabled(format!(
            "Plugin provider '{}' is awaiting server capability approval",
            plugin_id
        )));
    }

    if let Some(extension) = state.extension_registry.get(plugin_id).await {
        if extension.status == ExtensionStatus::Running {
            return Ok(PluginGatewayState::Running(extension));
        }
    }

    match record
        .get("serverStatus")
        .and_then(|value| value.as_str())
        .unwrap_or("unavailable")
    {
        "running" => Ok(PluginGatewayState::Unavailable(format!(
            "Plugin provider '{}' is marked running but no active runner is registered",
            plugin_id
        ))),
        status => Ok(PluginGatewayState::Unavailable(format!(
            "Plugin provider '{}' is unavailable (status: {})",
            plugin_id, status
        ))),
    }
}

fn normalize_route_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        "/".into()
    } else if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{}", trimmed)
    }
}
