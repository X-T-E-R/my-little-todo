use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use crate::AppState;

#[derive(serde::Serialize)]
pub struct ErrorBody {
    pub error: String,
}

type ApiResult<T> = Result<Json<T>, (StatusCode, Json<ErrorBody>)>;

fn internal(msg: &str) -> (StatusCode, Json<ErrorBody>) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorBody { error: msg.into() }),
    )
}

#[derive(Deserialize)]
pub struct RevisionsQuery {
    #[serde(rename = "entityType")]
    pub entity_type: String,
    #[serde(rename = "entityId")]
    pub entity_id: String,
    #[serde(default = "default_limit")]
    pub limit: i64,
}

#[derive(Deserialize)]
pub struct EventsQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(rename = "entityType")]
    pub entity_type: Option<String>,
    #[serde(rename = "entityId")]
    pub entity_id: Option<String>,
}

fn default_limit() -> i64 {
    100
}

pub async fn list_entity_revisions(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Query(query): Query<RevisionsQuery>,
) -> ApiResult<Vec<crate::providers::traits::EntityRevisionRecord>> {
    let rows = state
        .db
        .list_entity_revisions(&user_id, &query.entity_type, &query.entity_id, query.limit)
        .await
        .map_err(|e| internal(&e.to_string()))?;
    Ok(Json(rows))
}

pub async fn list_audit_events(
    State(state): State<AppState>,
    axum::Extension(user_id): axum::Extension<String>,
    Query(query): Query<EventsQuery>,
) -> ApiResult<Vec<crate::providers::traits::AuditEventRecord>> {
    let rows = state
        .db
        .list_audit_events(
            &user_id,
            query.limit,
            query.entity_type.as_deref(),
            query.entity_id.as_deref(),
        )
        .await
        .map_err(|e| internal(&e.to_string()))?;
    Ok(Json(rows))
}
