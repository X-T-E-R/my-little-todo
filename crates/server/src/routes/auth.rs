use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use crate::auth::jwt;
use crate::config::AuthMode;
use crate::providers::NewUser;
use crate::AppState;

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct TokenResponse {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Serialize, Clone)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
    pub is_admin: bool,
}

#[derive(Serialize)]
pub struct AuthModeResponse {
    pub mode: String,
    pub needs_setup: bool,
}

#[derive(Serialize)]
pub struct ErrorBody {
    pub error: String,
}

type AuthResult<T> = Result<Json<T>, (axum::http::StatusCode, Json<ErrorBody>)>;

fn unauthorized(msg: &str) -> (axum::http::StatusCode, Json<ErrorBody>) {
    (
        axum::http::StatusCode::UNAUTHORIZED,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

fn bad_request(msg: &str) -> (axum::http::StatusCode, Json<ErrorBody>) {
    (
        axum::http::StatusCode::BAD_REQUEST,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

fn conflict(msg: &str) -> (axum::http::StatusCode, Json<ErrorBody>) {
    (
        axum::http::StatusCode::CONFLICT,
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

pub async fn get_mode(State(state): State<AppState>) -> AuthResult<AuthModeResponse> {
    let count = state
        .db
        .count_users()
        .await
        .map_err(|e| internal(&e.to_string()))?;
    let mode = match state.config.auth_mode {
        AuthMode::None => "none",
        AuthMode::Single => "single",
        AuthMode::Multi => "multi",
    };
    Ok(Json(AuthModeResponse {
        mode: mode.to_string(),
        needs_setup: count == 0,
    }))
}

pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> AuthResult<TokenResponse> {
    if body.username.trim().is_empty() || body.password.is_empty() {
        return Err(bad_request("Username and password are required"));
    }
    if body.username.len() > 64 || body.password.len() > 256 {
        return Err(bad_request("Username or password too long"));
    }

    let existing = state
        .db
        .get_user_by_username(&body.username)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    if existing.is_some() {
        return Err(conflict("Username already taken"));
    }

    if state.config.auth_mode == AuthMode::Single {
        let count = state
            .db
            .count_users()
            .await
            .map_err(|e| internal(&e.to_string()))?;
        if count > 0 {
            return Err(bad_request("Single-user mode: registration disabled"));
        }
    }

    let count = state
        .db
        .count_users()
        .await
        .map_err(|e| internal(&e.to_string()))?;
    let is_admin = count == 0;

    let password_hash =
        crate::auth::hash_password(&body.password).map_err(|e| internal(&e.to_string()))?;

    let user = state
        .db
        .create_user(&NewUser {
            username: body.username.clone(),
            password_hash,
            is_admin,
        })
        .await
        .map_err(|e| internal(&e.to_string()))?;

    let token = jwt::sign_token(
        &user.id,
        &user.username,
        user.is_admin,
        &state.config.jwt_secret,
    )
    .map_err(|e| internal(&e.to_string()))?;

    Ok(Json(TokenResponse {
        token,
        user: UserInfo {
            id: user.id,
            username: user.username,
            is_admin: user.is_admin,
        },
    }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> AuthResult<TokenResponse> {
    let user = state
        .db
        .get_user_by_username(&body.username)
        .await
        .map_err(|e| internal(&e.to_string()))?
        .ok_or_else(|| unauthorized("Invalid username or password"))?;

    if !crate::auth::verify_password(&body.password, &user.password_hash)
        .map_err(|e| internal(&e.to_string()))?
    {
        return Err(unauthorized("Invalid username or password"));
    }

    let token = jwt::sign_token(
        &user.id,
        &user.username,
        user.is_admin,
        &state.config.jwt_secret,
    )
    .map_err(|e| internal(&e.to_string()))?;

    Ok(Json(TokenResponse {
        token,
        user: UserInfo {
            id: user.id,
            username: user.username,
            is_admin: user.is_admin,
        },
    }))
}

pub async fn me(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> AuthResult<UserInfo> {
    let user = state
        .db
        .get_user_by_id(&user_id)
        .await
        .map_err(|e| internal(&e.to_string()))?
        .ok_or_else(|| unauthorized("User not found"))?;

    Ok(Json(UserInfo {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
    }))
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub old_password: String,
    pub new_password: String,
}

pub async fn change_password(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(body): Json<ChangePasswordRequest>,
) -> AuthResult<serde_json::Value> {
    let user = state
        .db
        .get_user_by_id(&user_id)
        .await
        .map_err(|e| internal(&e.to_string()))?
        .ok_or_else(|| unauthorized("User not found"))?;

    if !crate::auth::verify_password(&body.old_password, &user.password_hash)
        .map_err(|e| internal(&e.to_string()))?
    {
        return Err(unauthorized("Current password is incorrect"));
    }

    let new_hash =
        crate::auth::hash_password(&body.new_password).map_err(|e| internal(&e.to_string()))?;

    state
        .db
        .update_user_password(&user_id, &new_hash)
        .await
        .map_err(|e| internal(&e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct ApiTokenRequest {
    /// Duration in seconds. 0 = never expires.
    pub duration: Option<u64>,
}

#[derive(Serialize)]
pub struct ApiTokenResponse {
    pub token: String,
    pub expires_at: usize,
}

/// POST /api/auth/api-token — generate a long-lived API token for sync / MCP usage.
pub async fn generate_api_token(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(body): Json<ApiTokenRequest>,
) -> AuthResult<ApiTokenResponse> {
    let user = state
        .db
        .get_user_by_id(&user_id)
        .await
        .map_err(|e| internal(&e.to_string()))?
        .ok_or_else(|| unauthorized("User not found"))?;

    let duration_secs = body.duration.unwrap_or(365 * 24 * 3600);

    let (token, expires_at) = jwt::sign_long_lived_token(
        &user.id,
        &user.username,
        user.is_admin,
        &state.config.jwt_secret,
        duration_secs,
    )
    .map_err(|e| internal(&e.to_string()))?;

    Ok(Json(ApiTokenResponse { token, expires_at }))
}
