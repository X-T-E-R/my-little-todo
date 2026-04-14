use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

use mlt_server::config::ServerConfig;
use mlt_server::providers;

async fn setup_app() -> axum::Router {
    let config = ServerConfig {
        database_url: Some("sqlite::memory:".into()),
        data_dir: temp_data_dir(),
        ..Default::default()
    };
    let db = providers::create_provider(&config).await.unwrap();
    mlt_server::create_app(db, config, "0.0.0-test", "test-hash")
}

fn temp_data_dir() -> String {
    let dir = std::env::temp_dir().join(format!("mlt-server-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir.to_string_lossy().to_string()
}

async fn body_json(body: Body) -> Value {
    let bytes = body.collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

async fn setup_admin(app: &axum::Router) -> String {
    let response = app
        .clone()
        .oneshot(
            Request::post("/api/session/setup")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "username": "owner", "password": "owner-password" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response.into_body()).await;
    json["token"].as_str().unwrap().to_string()
}

fn auth_header(token: &str) -> String {
    format!("Bearer {}", token)
}

#[tokio::test]
async fn health_check() {
    let app = setup_app().await;
    let response = app
        .oneshot(Request::get("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response.into_body()).await;
    assert_eq!(json["status"], "ok");
    assert_eq!(json["auth"], "embedded");
    assert_eq!(json["sync_mode"], "hosted");
}

#[tokio::test]
async fn session_bootstrap_exposes_embedded_hosted_contract() {
    let app = setup_app().await;
    let response = app
        .oneshot(
            Request::get("/api/session/bootstrap")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response.into_body()).await;
    assert_eq!(json["auth_provider"], "embedded");
    assert_eq!(json["needs_setup"], true);
    assert_eq!(json["signup_policy"], "invite_only");
    assert_eq!(json["sync_mode"], "hosted");
}

#[tokio::test]
async fn initial_setup_creates_owner_session() {
    let app = setup_app().await;
    let token = setup_admin(&app).await;

    let me = app
        .oneshot(
            Request::get("/api/session/me")
                .header("authorization", auth_header(&token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(me.status(), StatusCode::OK);
    let json = body_json(me.into_body()).await;
    assert_eq!(json["username"], "owner");
    assert_eq!(json["is_admin"], true);
    assert_eq!(json["is_enabled"], true);
}

#[tokio::test]
async fn protected_route_requires_bearer_token() {
    let app = setup_app().await;
    let response = app
        .oneshot(Request::get("/api/tasks").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn task_crud_works_with_embedded_session() {
    let app = setup_app().await;
    let token = setup_admin(&app).await;

    let put_response = app
        .clone()
        .oneshot(
            Request::put("/api/tasks/task-1")
                .header("authorization", auth_header(&token))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "title": "Ship embedded auth",
                        "body": "Replace legacy auth and sync entry points",
                        "created_at": 1710000000000_i64,
                        "updated_at": 1710000000000_i64,
                        "status": "inbox",
                        "primary_role": "builder",
                        "role_ids": ["builder"],
                        "tags": ["auth"],
                        "subtask_ids": []
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(put_response.status(), StatusCode::OK);

    let list_response = app
        .clone()
        .oneshot(
            Request::get("/api/tasks")
                .header("authorization", auth_header(&token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(list_response.status(), StatusCode::OK);
    let json = body_json(list_response.into_body()).await;
    let tasks = json.as_array().unwrap();
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0]["id"], "task-1");
    assert_eq!(tasks[0]["title"], "Ship embedded auth");
}

#[tokio::test]
async fn logout_revokes_embedded_session() {
    let app = setup_app().await;
    let token = setup_admin(&app).await;

    let logout = app
        .clone()
        .oneshot(
            Request::post("/api/session/logout")
                .header("authorization", auth_header(&token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(logout.status(), StatusCode::OK);

    let me = app
        .oneshot(
            Request::get("/api/session/me")
                .header("authorization", auth_header(&token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(me.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn invite_only_signup_requires_valid_invite() {
    let app = setup_app().await;
    let token = setup_admin(&app).await;

    let register_without_invite = app
        .clone()
        .oneshot(
            Request::post("/api/session/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "username": "bob",
                        "password": "bob-password"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(register_without_invite.status(), StatusCode::BAD_REQUEST);

    let create_invite = app
        .clone()
        .oneshot(
            Request::post("/api/admin/invites")
                .header("authorization", auth_header(&token))
                .header("content-type", "application/json")
                .body(Body::from(json!({}).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create_invite.status(), StatusCode::OK);
    let invite = body_json(create_invite.into_body()).await;
    let invite_code = invite["code"].as_str().unwrap().to_string();

    let register = app
        .clone()
        .oneshot(
            Request::post("/api/session/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "username": "bob",
                        "password": "bob-password",
                        "invite_code": invite_code
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(register.status(), StatusCode::OK);
    let json = body_json(register.into_body()).await;
    assert_eq!(json["user"]["username"], "bob");
    assert_eq!(json["user"]["is_admin"], false);
}

#[tokio::test]
async fn admin_stats_returns_auth_provider_only() {
    let app = setup_app().await;
    let token = setup_admin(&app).await;
    let response = app
        .oneshot(
            Request::get("/api/admin/stats")
                .header("authorization", auth_header(&token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response.into_body()).await;
    assert_eq!(json["auth_provider"], "embedded");
}

#[tokio::test]
async fn admin_storage_returns_auth_provider_only() {
    let app = setup_app().await;
    let token = setup_admin(&app).await;
    let response = app
        .oneshot(
            Request::get("/api/admin/storage")
                .header("authorization", auth_header(&token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let json = body_json(response.into_body()).await;
    assert_eq!(json["auth_provider"], "embedded");
}
