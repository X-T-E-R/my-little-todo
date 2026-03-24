use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use tower::ServiceExt;

use mlt_server::config::{AuthMode, ServerConfig};
use mlt_server::providers;

async fn setup_app(auth_mode: AuthMode) -> axum::Router {
    let config = ServerConfig {
        auth_mode,
        database_url: Some("sqlite::memory:".into()),
        jwt_secret: "test-secret".into(),
        ..Default::default()
    };
    let db = providers::create_provider(&config).await.unwrap();
    mlt_server::create_app(db, config, "0.0.0-test", "test-hash")
}

async fn body_json(body: Body) -> serde_json::Value {
    let bytes = body.collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

// ── Health Check ─────────────────────────────────────────────────────

#[tokio::test]
async fn health_check() {
    let app = setup_app(AuthMode::None).await;

    let resp = app
        .oneshot(Request::get("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(resp.status(), StatusCode::OK);
    let json = body_json(resp.into_body()).await;
    assert_eq!(json["status"], "ok");
    assert_eq!(json["version"], "0.0.0-test");
    assert_eq!(json["git_hash"], "test-hash");
}

// ── File CRUD (AuthMode::None → paths stored without user prefix) ────

#[tokio::test]
async fn file_put_and_get() {
    let app = setup_app(AuthMode::None).await;

    let put_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/files?path=stream/2026-03-22.md")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"content":"hello world"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(put_resp.status(), StatusCode::OK);

    let get_resp = app
        .oneshot(
            Request::get("/api/files?path=stream/2026-03-22.md")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get_resp.status(), StatusCode::OK);
    let json = body_json(get_resp.into_body()).await;
    assert_eq!(json["content"], "hello world");
    assert_eq!(json["path"], "stream/2026-03-22.md");
}

#[tokio::test]
async fn file_delete() {
    let app = setup_app(AuthMode::None).await;

    app.clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/files?path=stream/delete-me.md")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"content":"temp"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    let del_resp = app
        .clone()
        .oneshot(
            Request::delete("/api/files?path=stream/delete-me.md")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(del_resp.status(), StatusCode::OK);

    let get_resp = app
        .oneshot(
            Request::get("/api/files?path=stream/delete-me.md")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get_resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn file_list_directory_filtering() {
    let app = setup_app(AuthMode::None).await;

    let paths = [
        "stream/2026-03-20.md",
        "stream/2026-03-21.md",
        "stream/sub/nested.md",
    ];
    for path in &paths {
        app.clone()
            .oneshot(
                Request::builder()
                    .method("PUT")
                    .uri(format!("/api/files?path={}", path))
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"content":"x"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
    }

    let list_resp = app
        .oneshot(
            Request::get("/api/files/list?dir=stream")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_resp.status(), StatusCode::OK);
    let json = body_json(list_resp.into_body()).await;
    let files = json["files"].as_array().unwrap();

    // Should only list direct children (2026-03-20.md, 2026-03-21.md), not nested
    assert_eq!(files.len(), 2);
    let names: Vec<&str> = files.iter().map(|f| f.as_str().unwrap()).collect();
    assert!(names.contains(&"2026-03-20.md"));
    assert!(names.contains(&"2026-03-21.md"));
    assert!(!names.iter().any(|n| n.contains("nested")));
}

#[tokio::test]
async fn file_get_missing_returns_404() {
    let app = setup_app(AuthMode::None).await;

    let resp = app
        .oneshot(
            Request::get("/api/files?path=nonexistent.md")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn file_put_rejects_path_traversal() {
    let app = setup_app(AuthMode::None).await;

    let resp = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/files?path=../etc/passwd")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"content":"evil"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

// ── Settings CRUD ────────────────────────────────────────────────────

#[tokio::test]
async fn settings_crud() {
    let app = setup_app(AuthMode::None).await;

    // PUT a setting
    let put_resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/settings")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"key":"theme","value":"dark"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(put_resp.status(), StatusCode::OK);

    // GET specific setting
    let get_resp = app
        .clone()
        .oneshot(
            Request::get("/api/settings?key=theme")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get_resp.status(), StatusCode::OK);
    let json = body_json(get_resp.into_body()).await;
    assert_eq!(json["value"], "dark");

    // GET all settings
    let list_resp = app
        .clone()
        .oneshot(
            Request::get("/api/settings").body(Body::empty()).unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_resp.status(), StatusCode::OK);
    let json = body_json(list_resp.into_body()).await;
    assert_eq!(json["theme"], "dark");

    // DELETE the setting
    let del_resp = app
        .clone()
        .oneshot(
            Request::delete("/api/settings?key=theme")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(del_resp.status(), StatusCode::OK);

    // Verify deleted
    let get_resp = app
        .oneshot(
            Request::get("/api/settings?key=theme")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let json = body_json(get_resp.into_body()).await;
    assert!(json["value"].is_null());
}

// ── Auth Flow (AuthMode::Multi) ──────────────────────────────────────

#[tokio::test]
async fn auth_mode_endpoint() {
    let app = setup_app(AuthMode::Multi).await;

    let resp = app
        .oneshot(
            Request::get("/api/auth/mode")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let json = body_json(resp.into_body()).await;
    assert_eq!(json["mode"], "multi");
    assert_eq!(json["needs_setup"], true);
}

#[tokio::test]
async fn auth_register_and_login() {
    let app = setup_app(AuthMode::Multi).await;

    // Register
    let reg_resp = app
        .clone()
        .oneshot(
            Request::post("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"username":"alice","password":"securepass123"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(reg_resp.status(), StatusCode::OK);
    let reg_json = body_json(reg_resp.into_body()).await;
    assert!(!reg_json["token"].as_str().unwrap().is_empty());
    assert_eq!(reg_json["user"]["username"], "alice");
    assert_eq!(reg_json["user"]["is_admin"], true); // first user is admin

    // Login
    let login_resp = app
        .clone()
        .oneshot(
            Request::post("/api/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"username":"alice","password":"securepass123"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(login_resp.status(), StatusCode::OK);
    let login_json = body_json(login_resp.into_body()).await;
    let token = login_json["token"].as_str().unwrap();

    // Use token to access protected endpoint
    let me_resp = app
        .oneshot(
            Request::get("/api/auth/me")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(me_resp.status(), StatusCode::OK);
    let me_json = body_json(me_resp.into_body()).await;
    assert_eq!(me_json["username"], "alice");
}

#[tokio::test]
async fn auth_login_wrong_password() {
    let app = setup_app(AuthMode::Multi).await;

    // Register first
    app.clone()
        .oneshot(
            Request::post("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"username":"bob","password":"correct-password"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    // Login with wrong password
    let resp = app
        .oneshot(
            Request::post("/api/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"username":"bob","password":"wrong-password"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn auth_protected_route_without_token() {
    let app = setup_app(AuthMode::Multi).await;

    let resp = app
        .oneshot(
            Request::get("/api/auth/me")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn auth_duplicate_username_rejected() {
    let app = setup_app(AuthMode::Multi).await;

    app.clone()
        .oneshot(
            Request::post("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"username":"dup","password":"pass1"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let resp = app
        .oneshot(
            Request::post("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"username":"dup","password":"pass2"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CONFLICT);
}
