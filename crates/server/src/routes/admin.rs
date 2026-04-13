use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

use crate::providers::User;
use crate::AppState;

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
    pub created_at: String,
}

impl From<User> for UserListItem {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            username: u.username,
            is_admin: u.is_admin,
            created_at: u.created_at,
        }
    }
}

pub async fn list_users(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
) -> AdminResult<Vec<UserListItem>> {
    require_admin(&state, &user_id).await?;

    let users = state
        .db
        .list_users()
        .await
        .map_err(|e| internal(&e.to_string()))?;

    Ok(Json(users.into_iter().map(UserListItem::from).collect()))
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

#[derive(Serialize)]
pub struct StatsResponse {
    pub total_users: i64,
    pub db_type: String,
    pub auth_mode: String,
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
        auth_mode: format!("{:?}", state.config.auth_mode),
    }))
}

#[derive(Deserialize)]
pub struct ResetPasswordRequest {
    pub new_password: String,
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

pub async fn reset_user_password(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    axum::extract::Path(target_id): axum::extract::Path<String>,
    Json(body): Json<ResetPasswordRequest>,
) -> AdminResult<serde_json::Value> {
    require_admin(&state, &user_id).await?;
    log_admin_action(&user_id, "reset_user_password", &target_id);

    state
        .db
        .get_user_by_id(&target_id)
        .await
        .map_err(|e| internal(&e.to_string()))?
        .ok_or_else(|| not_found("User not found"))?;

    let new_hash =
        crate::auth::hash_password(&body.new_password).map_err(|e| internal(&e.to_string()))?;

    state
        .db
        .update_user_password(&target_id, &new_hash)
        .await
        .map_err(|e| internal(&e.to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
