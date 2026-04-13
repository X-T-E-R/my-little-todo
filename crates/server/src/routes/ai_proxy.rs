//! Proxies OpenAI-compatible `POST .../chat/completions` to the admin-configured shared AI endpoint.
//! Used by the web client when the user has no API key but shared AI is enabled.

use axum::{
    body::{Body, Bytes},
    extract::State,
    http::{header, StatusCode},
    response::Response,
};
use futures_util::StreamExt;
use reqwest::Client;

use crate::AppState;

async fn admin_shared_ai_url_and_key(state: &AppState) -> Result<(String, String), &'static str> {
    let users = state.db.list_users().await.map_err(|_| "db")?;
    let admin = users.into_iter().find(|u| u.is_admin).ok_or("no admin")?;
    let admin_id = admin.id;

    let enabled = state
        .db
        .get_setting(&admin_id, "admin:ai-shared-enabled")
        .await
        .map_err(|_| "db")?;
    if enabled.as_deref() != Some("true") {
        return Err("disabled");
    }

    let key = state
        .db
        .get_setting(&admin_id, "admin:ai-shared-key")
        .await
        .map_err(|_| "db")?
        .filter(|s| !s.trim().is_empty())
        .ok_or("no key")?;

    let endpoint = state
        .db
        .get_setting(&admin_id, "admin:ai-shared-endpoint")
        .await
        .map_err(|_| "db")?
        .filter(|s| !s.trim().is_empty())
        .ok_or("no endpoint")?;

    Ok((endpoint.trim().trim_end_matches('/').to_string(), key))
}

/// `POST /api/ai/chat/completions` — body is forwarded as-is to `{admin:ai-shared-endpoint}/chat/completions`.
pub async fn proxy_chat_completions(
    State(state): State<AppState>,
    body: Bytes,
) -> Result<Response<Body>, (StatusCode, String)> {
    let (base, key) = admin_shared_ai_url_and_key(&state)
        .await
        .map_err(|e| (StatusCode::SERVICE_UNAVAILABLE, e.to_string()))?;

    let url = format!("{}/chat/completions", base);

    let client = Client::new();
    let upstream = client
        .post(&url)
        .header(header::AUTHORIZATION, format!("Bearer {}", key))
        .header(header::CONTENT_TYPE, "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

    let status = upstream.status();
    let ct = upstream.headers().get(header::CONTENT_TYPE).cloned();

    let stream = upstream.bytes_stream().map(|result| {
        result.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
    });

    let mut builder = Response::builder().status(status);
    if let Some(ct) = ct {
        builder = builder.header(header::CONTENT_TYPE, ct);
    }

    let body = Body::from_stream(stream);
    builder
        .body(body)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}
