use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::{
    auth,
    auth::external,
    config::{AuthProvider, EmbeddedSignupPolicy, SyncMode},
    providers::NewUser,
    AppState,
};

#[derive(Serialize)]
pub struct ErrorBody {
    pub error: String,
}

type SessionResult<T> = Result<Json<T>, (StatusCode, Json<ErrorBody>)>;

fn unauthorized(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (
        StatusCode::UNAUTHORIZED,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

fn bad_request(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

fn conflict(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (
        StatusCode::CONFLICT,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

fn internal(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

fn auth_provider_name(provider: &AuthProvider) -> &'static str {
    match provider {
        AuthProvider::Embedded => "embedded",
        AuthProvider::Zitadel => "zitadel",
    }
}

fn signup_policy_name(policy: &EmbeddedSignupPolicy) -> &'static str {
    match policy {
        EmbeddedSignupPolicy::AdminOnly => "admin_only",
        EmbeddedSignupPolicy::Open => "open",
        EmbeddedSignupPolicy::InviteOnly => "invite_only",
    }
}

fn sync_mode_name(mode: &SyncMode) -> &'static str {
    match mode {
        SyncMode::Hosted => "hosted",
    }
}

fn require_embedded(state: &AppState) -> Result<(), (StatusCode, Json<ErrorBody>)> {
    if state.config.auth_provider != AuthProvider::Embedded {
        return Err(bad_request(
            "Embedded session APIs are only available when auth_provider=embedded",
        ));
    }
    Ok(())
}

fn extract_bearer_token(headers: &HeaderMap) -> Result<String, (StatusCode, Json<ErrorBody>)> {
    headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(|value| value.to_string())
        .ok_or_else(|| unauthorized("Authentication required"))
}

fn session_expires_at() -> String {
    (Utc::now() + Duration::days(30)).to_rfc3339()
}

fn invite_expires_at(days: i64) -> String {
    (Utc::now() + Duration::days(days)).to_rfc3339()
}

fn is_expired(expires_at: Option<&str>) -> bool {
    expires_at
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value < Utc::now())
        .unwrap_or(false)
}

fn generate_session_token() -> String {
    format!("mlt_sess_{}", uuid::Uuid::new_v4().simple())
}

#[derive(Serialize)]
pub struct SessionBootstrapResponse {
    pub auth_provider: String,
    pub needs_setup: bool,
    pub signup_policy: String,
    pub sync_mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub issuer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audience: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub admin_role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discovery_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authorization_endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_session_endpoint: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct SessionUserResponse {
    pub id: String,
    pub username: String,
    pub is_admin: bool,
    pub is_enabled: bool,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct SessionTokenResponse {
    pub token: String,
    pub user: SessionUserResponse,
}

#[derive(Deserialize)]
pub struct SetupRequest {
    pub username: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub invite_code: Option<String>,
}

fn validate_credentials(username: &str, password: &str) -> Result<(), (StatusCode, Json<ErrorBody>)> {
    if username.trim().is_empty() || password.is_empty() {
        return Err(bad_request("Username and password are required"));
    }
    if username.len() > 64 || password.len() > 256 {
        return Err(bad_request("Username or password too long"));
    }
    Ok(())
}

fn to_session_user(user: crate::providers::User) -> SessionUserResponse {
    SessionUserResponse {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
        is_enabled: user.is_enabled,
        created_at: user.created_at,
    }
}

async fn issue_session(
    state: &AppState,
    user: crate::providers::User,
) -> SessionResult<SessionTokenResponse> {
    let token = generate_session_token();
    let expires_at = session_expires_at();
    state
        .db
        .create_session(&user.id, &token, Some(&expires_at))
        .await
        .map_err(|err| internal(&err.to_string()))?;

    Ok(Json(SessionTokenResponse {
        token,
        user: to_session_user(user),
    }))
}

pub async fn bootstrap(State(state): State<AppState>) -> SessionResult<SessionBootstrapResponse> {
    let needs_setup = if state.config.auth_provider == AuthProvider::Embedded {
        state
            .db
            .count_users()
            .await
            .map_err(|err| internal(&err.to_string()))?
            == 0
    } else {
        false
    };

    let oidc = if state.config.auth_provider == AuthProvider::Zitadel && external::is_configured(state.config.as_ref()) {
        Some(
            external::fetch_openid_configuration(state.config.as_ref())
                .await
                .map_err(|err| internal(&err.to_string()))?,
        )
    } else {
        None
    };

    Ok(Json(SessionBootstrapResponse {
        auth_provider: auth_provider_name(&state.config.auth_provider).to_string(),
        needs_setup,
        signup_policy: signup_policy_name(&state.config.embedded_signup_policy).to_string(),
        sync_mode: sync_mode_name(&state.config.sync_mode).to_string(),
        issuer: (state.config.auth_provider == AuthProvider::Zitadel)
            .then(|| state.config.zitadel_issuer.clone())
            .filter(|value| !value.is_empty()),
        client_id: (state.config.auth_provider == AuthProvider::Zitadel)
            .then(|| state.config.zitadel_client_id.clone())
            .filter(|value| !value.is_empty()),
        audience: (state.config.auth_provider == AuthProvider::Zitadel)
            .then(|| state.config.zitadel_audience.clone())
            .flatten(),
        admin_role: (state.config.auth_provider == AuthProvider::Zitadel)
            .then(|| state.config.zitadel_admin_role.clone())
            .flatten(),
        discovery_url: (state.config.auth_provider == AuthProvider::Zitadel)
            .then(|| external::discovery_url(state.config.as_ref()))
            .flatten(),
        authorization_endpoint: oidc.as_ref().map(|config| config.authorization_endpoint.clone()),
        token_endpoint: oidc.as_ref().map(|config| config.token_endpoint.clone()),
        end_session_endpoint: oidc.and_then(|config| config.end_session_endpoint),
    }))
}

pub async fn setup(
    State(state): State<AppState>,
    Json(body): Json<SetupRequest>,
) -> SessionResult<SessionTokenResponse> {
    require_embedded(&state)?;
    validate_credentials(&body.username, &body.password)?;

    let existing_users = state
        .db
        .count_users()
        .await
        .map_err(|err| internal(&err.to_string()))?;
    if existing_users > 0 {
        return Err(conflict("Initial setup has already been completed"));
    }

    let password_hash =
        auth::hash_password(&body.password).map_err(|err| internal(&err.to_string()))?;
    let user = state
        .db
        .create_user(&NewUser {
            username: body.username.trim().to_string(),
            password_hash,
            is_admin: true,
        })
        .await
        .map_err(|err| conflict(&err.to_string()))?;

    issue_session(&state, user).await
}

pub async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> SessionResult<SessionTokenResponse> {
    require_embedded(&state)?;
    validate_credentials(&body.username, &body.password)?;

    if state
        .db
        .count_users()
        .await
        .map_err(|err| internal(&err.to_string()))?
        == 0
    {
        return Err(conflict(
            "Run /api/session/setup first to create the initial owner account",
        ));
    }

    if state
        .db
        .get_user_by_username(body.username.trim())
        .await
        .map_err(|err| internal(&err.to_string()))?
        .is_some()
    {
        return Err(conflict("Username already taken"));
    }

    let invite = match state.config.embedded_signup_policy {
        EmbeddedSignupPolicy::AdminOnly => {
            return Err(bad_request("Self-service signup is disabled by the server policy"));
        }
        EmbeddedSignupPolicy::Open => None,
        EmbeddedSignupPolicy::InviteOnly => {
            let invite_code = body
                .invite_code
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| bad_request("Invite code is required"))?;
            let invite = state
                .db
                .get_invite(invite_code)
                .await
                .map_err(|err| internal(&err.to_string()))?
                .ok_or_else(|| unauthorized("Invite code is invalid"))?;
            if invite.consumed_at.is_some() {
                return Err(conflict("Invite code has already been used"));
            }
            if is_expired(invite.expires_at.as_deref()) {
                return Err(conflict("Invite code has expired"));
            }
            Some(invite)
        }
    };

    let password_hash =
        auth::hash_password(&body.password).map_err(|err| internal(&err.to_string()))?;
    let user = state
        .db
        .create_user(&NewUser {
            username: body.username.trim().to_string(),
            password_hash,
            is_admin: false,
        })
        .await
        .map_err(|err| conflict(&err.to_string()))?;

    if let Some(invite) = invite {
        state
            .db
            .consume_invite(&invite.code, &user.id)
            .await
            .map_err(|err| internal(&err.to_string()))?;
    }

    issue_session(&state, user).await
}

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> SessionResult<SessionTokenResponse> {
    require_embedded(&state)?;
    validate_credentials(&body.username, &body.password)?;

    let user = state
        .db
        .get_user_by_username(body.username.trim())
        .await
        .map_err(|err| internal(&err.to_string()))?
        .ok_or_else(|| unauthorized("Invalid username or password"))?;

    if !user.is_enabled {
        return Err(unauthorized("This account has been disabled"));
    }

    let is_valid = auth::verify_password(&body.password, &user.password_hash)
        .map_err(|err| internal(&err.to_string()))?;
    if !is_valid {
        return Err(unauthorized("Invalid username or password"));
    }

    issue_session(&state, user).await
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> SessionResult<serde_json::Value> {
    if state.config.auth_provider == AuthProvider::Embedded {
        let token = extract_bearer_token(&headers)?;
        state
            .db
            .delete_session(&token)
            .await
            .map_err(|err| internal(&err.to_string()))?;
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn me(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> SessionResult<SessionUserResponse> {
    let user = state
        .db
        .get_user_by_id(&user_id)
        .await
        .map_err(|err| internal(&err.to_string()))?
        .ok_or_else(|| unauthorized("User not found"))?;

    if !user.is_enabled {
        return Err(unauthorized("This account has been disabled"));
    }

    Ok(Json(to_session_user(user)))
}

pub fn default_invite_expiry() -> String {
    invite_expires_at(7)
}
