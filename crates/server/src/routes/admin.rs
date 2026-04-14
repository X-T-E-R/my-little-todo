use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use crate::{
    auth,
    config::AuthProvider,
    providers::{InviteRecord, NewUser, User},
    AppState,
};

#[derive(Serialize)]
pub struct ErrorBody {
    pub error: String,
}

type AdminResult<T> = Result<Json<T>, (axum::http::StatusCode, Json<ErrorBody>)>;

fn forbidden(msg: &str) -> (axum::http::StatusCode, Json<ErrorBody>) {
    (
        axum::http::StatusCode::FORBIDDEN,
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

fn not_found(msg: &str) -> (axum::http::StatusCode, Json<ErrorBody>) {
    (
        axum::http::StatusCode::NOT_FOUND,
        Json(ErrorBody {
            error: msg.to_string(),
        }),
    )
}

pub(crate) async fn require_admin(
    state: &AppState,
    user_id: &str,
) -> Result<(), (axum::http::StatusCode, Json<ErrorBody>)> {
    if state.config.auth_provider == AuthProvider::None {
        let _ = user_id;
        return Ok(());
    }

    let user = state
        .db
        .get_user_by_id(user_id)
        .await
        .map_err(|e| internal(&e.to_string()))?
        .ok_or_else(|| forbidden("User not found"))?;

    if !user.is_admin {
        return Err(forbidden("Admin access required"));
    }
    Ok(())
}

pub(crate) fn log_admin_action(user_id: &str, action: &str, detail: &str) {
    println!(
        "[AdminAudit] user_id={} action={} detail={}",
        user_id, action, detail
    );
}

#[derive(Serialize)]
pub struct UserListItem {
    pub id: String,
    pub username: String,
    pub is_admin: bool,
    pub is_enabled: bool,
    pub created_at: String,
}

impl From<User> for UserListItem {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            username: u.username,
            is_admin: u.is_admin,
            is_enabled: u.is_enabled,
            created_at: u.created_at,
        }
    }
}

#[derive(Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub is_admin: bool,
}

#[derive(Deserialize)]
pub struct ResetPasswordRequest {
    pub new_password: String,
}

#[derive(Deserialize)]
pub struct UserStatusRequest {
    pub enabled: bool,
}

#[derive(Serialize)]
pub struct InviteListItem {
    pub code: String,
    pub created_by: String,
    pub created_at: String,
    pub expires_at: Option<String>,
    pub consumed_at: Option<String>,
    pub consumed_by: Option<String>,
}

impl From<InviteRecord> for InviteListItem {
    fn from(invite: InviteRecord) -> Self {
        Self {
            code: invite.code,
            created_by: invite.created_by,
            created_at: invite.created_at,
            expires_at: invite.expires_at,
            consumed_at: invite.consumed_at,
            consumed_by: invite.consumed_by,
        }
    }
}

#[derive(Deserialize)]
pub struct CreateInviteRequest {
    pub expires_in_days: Option<i64>,
}

fn validate_credentials(
    username: &str,
    password: &str,
) -> Result<(), (axum::http::StatusCode, Json<ErrorBody>)> {
    if username.trim().is_empty() || password.is_empty() {
        return Err(bad_request("Username and password are required"));
    }
    if username.len() > 64 || password.len() > 256 {
        return Err(bad_request("Username or password too long"));
    }
    Ok(())
}

fn auth_provider_name(provider: &AuthProvider) -> &'static str {
    match provider {
        AuthProvider::None => "none",
        AuthProvider::Embedded => "embedded",
        AuthProvider::Zitadel => "zitadel",
    }
}

fn generate_invite_code() -> String {
    format!("INV-{}", uuid::Uuid::new_v4().simple())
}

async fn ensure_last_admin_guard(
    state: &AppState,
    target_id: &str,
) -> Result<(), (axum::http::StatusCode, Json<ErrorBody>)> {
    let users = state
        .db
        .list_users()
        .await
        .map_err(|e| internal(&e.to_string()))?;
    let target = users
        .iter()
        .find(|user| user.id == target_id)
        .ok_or_else(|| not_found("User not found"))?;
    if !target.is_admin {
        return Ok(());
    }
    let enabled_admins = users
        .iter()
        .filter(|user| user.is_admin && user.is_enabled)
        .count();
    if enabled_admins <= 1 {
        return Err(conflict("At least one enabled admin must remain"));
    }
    Ok(())
}

pub async fn list_users(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> AdminResult<Vec<UserListItem>> {
    require_admin(&state, &user_id).await?;

    if state.config.auth_provider == AuthProvider::None {
        return Ok(Json(Vec::new()));
    }

    let users = state
        .db
        .list_users()
        .await
        .map_err(|e| internal(&e.to_string()))?;

    Ok(Json(users.into_iter().map(UserListItem::from).collect()))
}

pub async fn create_user(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(body): Json<CreateUserRequest>,
) -> AdminResult<UserListItem> {
    require_admin(&state, &user_id).await?;

    if state.config.auth_provider != AuthProvider::Embedded {
        return Err(bad_request(
            "Local user management is only available when auth_provider=embedded",
        ));
    }

    validate_credentials(&body.username, &body.password)?;
    if state
        .db
        .get_user_by_username(body.username.trim())
        .await
        .map_err(|e| internal(&e.to_string()))?
        .is_some()
    {
        return Err(conflict("Username already taken"));
    }

    let password_hash =
        auth::hash_password(&body.password).map_err(|e| internal(&e.to_string()))?;
    let user = state
        .db
        .create_user(&NewUser {
            username: body.username.trim().to_string(),
            password_hash,
            is_admin: body.is_admin,
        })
        .await
        .map_err(|e| conflict(&e.to_string()))?;

    log_admin_action(&user_id, "create_user", &user.username);
    Ok(Json(UserListItem::from(user)))
}

pub async fn delete_user(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    axum::extract::Path(target_id): axum::extract::Path<String>,
) -> AdminResult<serde_json::Value> {
    require_admin(&state, &user_id).await?;
    log_admin_action(&user_id, "delete_user", &target_id);

    if target_id == user_id {
        return Err(forbidden("Cannot delete yourself"));
    }

    ensure_last_admin_guard(&state, &target_id).await?;

    state
        .db
        .get_user_by_id(&target_id)
        .await
        .map_err(|e| internal(&e.to_string()))?
        .ok_or_else(|| not_found("User not found"))?;

    state
        .db
        .delete_user(&target_id)
        .await
        .map_err(|e| internal(&e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn reset_user_password(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    axum::extract::Path(target_id): axum::extract::Path<String>,
    Json(body): Json<ResetPasswordRequest>,
) -> AdminResult<serde_json::Value> {
    require_admin(&state, &user_id).await?;

    if state.config.auth_provider != AuthProvider::Embedded {
        return Err(bad_request(
            "Password reset is only available when auth_provider=embedded",
        ));
    }
    if body.new_password.is_empty() || body.new_password.len() > 256 {
        return Err(bad_request("Password is required"));
    }

    state
        .db
        .get_user_by_id(&target_id)
        .await
        .map_err(|e| internal(&e.to_string()))?
        .ok_or_else(|| not_found("User not found"))?;

    let password_hash =
        auth::hash_password(&body.new_password).map_err(|e| internal(&e.to_string()))?;
    state
        .db
        .update_user_password(&target_id, &password_hash)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    state
        .db
        .delete_sessions_for_user(&target_id)
        .await
        .map_err(|e| internal(&e.to_string()))?;

    log_admin_action(&user_id, "reset_user_password", &target_id);
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn set_user_status(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    axum::extract::Path(target_id): axum::extract::Path<String>,
    Json(body): Json<UserStatusRequest>,
) -> AdminResult<serde_json::Value> {
    require_admin(&state, &user_id).await?;

    if target_id == user_id && !body.enabled {
        return Err(forbidden("Cannot disable yourself"));
    }
    if !body.enabled {
        ensure_last_admin_guard(&state, &target_id).await?;
    }

    state
        .db
        .get_user_by_id(&target_id)
        .await
        .map_err(|e| internal(&e.to_string()))?
        .ok_or_else(|| not_found("User not found"))?;
    state
        .db
        .set_user_enabled(&target_id, body.enabled)
        .await
        .map_err(|e| internal(&e.to_string()))?;

    if !body.enabled {
        state
            .db
            .delete_sessions_for_user(&target_id)
            .await
            .map_err(|e| internal(&e.to_string()))?;
    }

    log_admin_action(
        &user_id,
        "set_user_status",
        &format!("{} -> {}", target_id, body.enabled),
    );
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn list_invites(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> AdminResult<Vec<InviteListItem>> {
    require_admin(&state, &user_id).await?;

    if state.config.auth_provider == AuthProvider::None {
        return Ok(Json(Vec::new()));
    }

    let invites = state
        .db
        .list_invites()
        .await
        .map_err(|e| internal(&e.to_string()))?;
    Ok(Json(
        invites.into_iter().map(InviteListItem::from).collect(),
    ))
}

pub async fn create_invite(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Json(body): Json<CreateInviteRequest>,
) -> AdminResult<InviteListItem> {
    require_admin(&state, &user_id).await?;

    if state.config.auth_provider != AuthProvider::Embedded {
        return Err(bad_request(
            "Invites are only available when auth_provider=embedded",
        ));
    }

    let expires_in_days = body.expires_in_days.unwrap_or(7).clamp(1, 30);
    let expires_at = (chrono::Utc::now() + chrono::Duration::days(expires_in_days)).to_rfc3339();
    let invite = state
        .db
        .create_invite(&generate_invite_code(), &user_id, Some(&expires_at))
        .await
        .map_err(|e| internal(&e.to_string()))?;

    log_admin_action(&user_id, "create_invite", &invite.code);
    Ok(Json(InviteListItem::from(invite)))
}

#[derive(Serialize)]
pub struct StatsResponse {
    pub total_users: i64,
    pub db_type: String,
    pub auth_provider: String,
}

pub async fn get_stats(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> AdminResult<StatsResponse> {
    require_admin(&state, &user_id).await?;

    let total_users = state
        .db
        .count_users()
        .await
        .map_err(|e| internal(&e.to_string()))?;

    Ok(Json(StatsResponse {
        total_users,
        db_type: format!("{:?}", state.config.db_type),
        auth_provider: auth_provider_name(&state.config.auth_provider).to_string(),
    }))
}

pub async fn get_shared_ai_config(
    State(state): State<AppState>,
    axum::Extension(_user_id): axum::Extension<String>,
) -> AdminResult<serde_json::Value> {
    let users = state
        .db
        .list_users()
        .await
        .map_err(|e| internal(&e.to_string()))?;

    let admin = users.into_iter().find(|u| u.is_admin);
    let admin_id = match admin {
        Some(u) => u.id,
        None => {
            return Ok(Json(serde_json::json!({ "available": false })));
        }
    };

    let enabled = state
        .db
        .get_setting(&admin_id, "admin:ai-shared-enabled")
        .await
        .map_err(|e| internal(&e.to_string()))?;

    if enabled.as_deref() != Some("true") {
        return Ok(Json(serde_json::json!({ "available": false })));
    }

    let endpoint = state
        .db
        .get_setting(&admin_id, "admin:ai-shared-endpoint")
        .await
        .map_err(|e| internal(&e.to_string()))?
        .unwrap_or_default();

    let model = state
        .db
        .get_setting(&admin_id, "admin:ai-shared-model")
        .await
        .map_err(|e| internal(&e.to_string()))?
        .unwrap_or_default();

    let allow_user_key = state
        .db
        .get_setting(&admin_id, "admin:ai-allow-user-key")
        .await
        .map_err(|e| internal(&e.to_string()))?
        .unwrap_or_else(|| "true".to_string());

    Ok(Json(serde_json::json!({
        "available": true,
        "endpoint": endpoint,
        "model": model,
        "allow_user_key": allow_user_key == "true",
    })))
}
