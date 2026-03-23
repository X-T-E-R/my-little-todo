use axum::{
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
    Json,
};
use serde::Serialize;

use super::jwt;
use crate::config::AuthMode;
use crate::AppState;

const DEFAULT_USER_ID: &str = "default-local-user";

#[derive(Serialize)]
pub struct ErrorBody {
    error: String,
}

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, (StatusCode, Json<ErrorBody>)> {
    match state.config.auth_mode {
        AuthMode::None => {
            req.extensions_mut().insert(DEFAULT_USER_ID.to_string());
            Ok(next.run(req).await)
        }
        AuthMode::Single => {
            let auth_header = req
                .headers()
                .get("authorization")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());

            if let Some(header) = auth_header {
                if let Some(token) = header.strip_prefix("Bearer ") {
                    match jwt::verify_token(token, &state.config.jwt_secret) {
                        Ok(claims) => {
                            req.extensions_mut().insert(claims.sub);
                            return Ok(next.run(req).await);
                        }
                        Err(_) => {
                            return Err((
                                StatusCode::UNAUTHORIZED,
                                Json(ErrorBody {
                                    error: "Invalid token".into(),
                                }),
                            ));
                        }
                    }
                }
            }

            // Single mode: if no users exist yet, allow without auth
            let count = state.db.count_users().await.unwrap_or(0);
            if count == 0 {
                req.extensions_mut().insert(DEFAULT_USER_ID.to_string());
                return Ok(next.run(req).await);
            }

            // Single mode with password set: check if password is configured
            if state.config.default_admin_password.is_none() {
                req.extensions_mut().insert(DEFAULT_USER_ID.to_string());
                return Ok(next.run(req).await);
            }

            Err((
                StatusCode::UNAUTHORIZED,
                Json(ErrorBody {
                    error: "Authentication required".into(),
                }),
            ))
        }
        AuthMode::Multi => {
            let auth_header = req
                .headers()
                .get("authorization")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());

            let token = auth_header
                .as_deref()
                .and_then(|h| h.strip_prefix("Bearer "))
                .ok_or_else(|| {
                    (
                        StatusCode::UNAUTHORIZED,
                        Json(ErrorBody {
                            error: "Authentication required".into(),
                        }),
                    )
                })?;

            let claims = jwt::verify_token(token, &state.config.jwt_secret).map_err(|_| {
                (
                    StatusCode::UNAUTHORIZED,
                    Json(ErrorBody {
                        error: "Invalid or expired token".into(),
                    }),
                )
            })?;

            req.extensions_mut().insert(claims.sub);
            Ok(next.run(req).await)
        }
    }
}
