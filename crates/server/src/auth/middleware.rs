use axum::{
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
    Json,
};
use chrono::Utc;
use serde::Serialize;

use super::external;
use crate::{config::AuthProvider, AppState};

#[derive(Serialize)]
pub struct ErrorBody {
    error: String,
}

fn unauthorized(message: &str) -> (StatusCode, Json<ErrorBody>) {
    (
        StatusCode::UNAUTHORIZED,
        Json(ErrorBody {
            error: message.to_string(),
        }),
    )
}

fn is_expired(expires_at: Option<&str>) -> bool {
    expires_at
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value < Utc::now())
        .unwrap_or(false)
}

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, (StatusCode, Json<ErrorBody>)> {
    let auth_header = req
        .headers()
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);

    let token = auth_header
        .as_deref()
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or_else(|| unauthorized("Authentication required"))?;

    let user_id = match state.config.auth_provider {
        AuthProvider::Zitadel => {
            let identity = external::verify_access_token(token, state.config.as_ref())
                .await
                .map_err(|err| unauthorized(&format!("Invalid OIDC token: {}", err)))?;
            let user = state
                .db
                .ensure_external_user(&identity.subject, &identity.username, identity.is_admin)
                .await
                .map_err(|err| unauthorized(&format!("Failed to provision external user: {}", err)))?;
            if !user.is_enabled {
                return Err(unauthorized("This account has been disabled"));
            }
            user.id
        }
        AuthProvider::Embedded => {
            let session = state
                .db
                .get_session(token)
                .await
                .map_err(|err| unauthorized(&format!("Failed to load session: {}", err)))?
                .ok_or_else(|| unauthorized("Invalid or expired session"))?;
            if is_expired(session.expires_at.as_deref()) {
                let _ = state.db.delete_session(token).await;
                return Err(unauthorized("Session expired"));
            }
            let user = state
                .db
                .get_user_by_id(&session.user_id)
                .await
                .map_err(|err| unauthorized(&format!("Failed to load session user: {}", err)))?
                .ok_or_else(|| unauthorized("User not found"))?;
            if !user.is_enabled {
                return Err(unauthorized("This account has been disabled"));
            }
            user.id
        }
    };

    req.extensions_mut().insert(user_id);
    Ok(next.run(req).await)
}
