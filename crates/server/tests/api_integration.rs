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
        data_dir: temp_data_dir(),
        ..Default::default()
    };
    setup_app_with_config(config).await
}

async fn setup_app_with_config(config: ServerConfig) -> axum::Router {
    let db = providers::create_provider(&config).await.unwrap();
    mlt_server::create_app(db, config, "0.0.0-test", "test-hash")
}

fn temp_data_dir() -> String {
    let dir = std::env::temp_dir().join(format!("mlt-server-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    dir.to_string_lossy().to_string()
}

async fn body_json(body: Body) -> serde_json::Value {
    let bytes = body.collect().await.unwrap().to_bytes();
    serde_json::from_slice(&bytes).unwrap()
}

fn json_request(method: &str, uri: &str, token: Option<&str>, body: Option<&str>) -> Request<Body> {
    let mut b = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json");
    if let Some(t) = token {
        b = b.header("authorization", format!("Bearer {}", t));
    }
    let body = match body {
        Some(s) => Body::from(s.to_string()),
        None => Body::empty(),
    };
    b.body(body).unwrap()
}

fn multipart_upload_request(
    uri: &str,
    token: &str,
    filename: &str,
    content_type: &str,
    bytes: &[u8],
) -> Request<Body> {
    let boundary = format!("----mlt-boundary-{}", uuid::Uuid::new_v4());
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(
        format!(
            "Content-Disposition: form-data; name=\"file\"; filename=\"{}\"\r\n",
            filename
        )
        .as_bytes(),
    );
    body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", content_type).as_bytes());
    body.extend_from_slice(bytes);
    body.extend_from_slice(b"\r\n");
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

    Request::builder()
        .method("POST")
        .uri(uri)
        .header("authorization", format!("Bearer {}", token))
        .header(
            "content-type",
            format!("multipart/form-data; boundary={}", boundary),
        )
        .body(Body::from(body))
        .unwrap()
}

/// Register a new user in `AuthMode::Multi` and return JWT.
async fn register_and_get_token(app: &axum::Router, username: &str, password: &str) -> String {
    let reg_resp = app
        .clone()
        .oneshot(
            Request::post("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(format!(
                    r#"{{"username":"{}","password":"{}"}}"#,
                    username, password
                )))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(reg_resp.status(), StatusCode::OK);
    let reg_json = body_json(reg_resp.into_body()).await;
    reg_json["token"].as_str().unwrap().to_string()
}

fn minimal_task_json(id: &str, title: &str) -> String {
    format!(
        r#"{{"id":"{}","title":"{}","title_customized":0,"status":"inbox","body":"body","created_at":1700000000000,"updated_at":1700000000000,"tags":"[]","subtask_ids":"[]","resources":"[]","reminders":"[]","submissions":"[]","postponements":"[]","status_history":"[]","progress_logs":"[]"}}"#,
        id, title
    )
}

fn minimal_public_task_json(title: &str, body: &str) -> String {
    serde_json::json!({
        "title": title,
        "title_customized": 1,
        "description": null,
        "status": "inbox",
        "body": body,
        "created_at": 1700000000000i64,
        "updated_at": 1700000000000i64,
        "completed_at": null,
        "ddl": null,
        "ddl_type": null,
        "planned_at": null,
        "role_ids": ["role-a"],
        "primary_role": "role-a",
        "tags": ["mlt"],
        "parent_id": null,
        "subtask_ids": [],
        "task_type": "task",
    })
    .to_string()
}

fn public_task_json_with_roles(title: &str, body: &str, role_ids: &[&str]) -> String {
    serde_json::json!({
        "title": title,
        "title_customized": 1,
        "description": null,
        "status": "inbox",
        "body": body,
        "created_at": 1700000000000i64,
        "updated_at": 1700000000000i64,
        "completed_at": null,
        "ddl": null,
        "ddl_type": null,
        "planned_at": null,
        "role_ids": role_ids,
        "primary_role": role_ids.first().copied(),
        "tags": ["mlt"],
        "parent_id": null,
        "subtask_ids": [],
        "task_type": "task",
    })
    .to_string()
}

fn task_json_with_title_customized(id: &str, title: &str, customized: i64) -> String {
    format!(
        r#"{{"id":"{}","title":"{}","title_customized":{},"status":"inbox","body":"body","created_at":1700000000000,"updated_at":1700000000000,"tags":"[]","subtask_ids":"[]","resources":"[]","reminders":"[]","submissions":"[]","postponements":"[]","status_history":"[]","progress_logs":"[]"}}"#,
        id, title, customized
    )
}

fn minimal_stream_json(id: &str, content: &str, date_key: &str, ts_ms: i64) -> String {
    format!(
        r#"{{"id":"{}","content":"{}","entry_type":"spark","timestamp":{},"date_key":"{}","tags":"[]","attachments":"[]"}}"#,
        id, content, ts_ms, date_key
    )
}

fn minimal_public_stream_json(id: &str, content: &str, date_key: &str, ts_ms: i64) -> String {
    serde_json::json!({
        "id": id,
        "content": content,
        "entry_type": "spark",
        "timestamp": ts_ms,
        "date_key": date_key,
        "role_id": null,
        "tags": [],
        "attachments": [],
    })
    .to_string()
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
        .oneshot(Request::get("/api/settings").body(Body::empty()).unwrap())
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

// ── Tasks CRUD (AuthMode::None) ───────────────────────────────────────

#[tokio::test]
async fn task_put_get_list_delete() {
    let app = setup_app(AuthMode::None).await;
    let tid = "se-integration-1";
    let body = minimal_public_task_json("Integration task", "Canonical body");

    let put = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/tasks/{}", tid))
                .header("content-type", "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(put.status(), StatusCode::OK);

    let get = app
        .clone()
        .oneshot(
            Request::get(format!("/api/tasks/{}", tid))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get.status(), StatusCode::OK);
    let task = body_json(get.into_body()).await;
    assert_eq!(task["id"], tid);
    assert_eq!(task["title"], "Integration task");
    assert_eq!(task["body"], "Canonical body");
    assert_eq!(task["role_ids"], serde_json::json!(["role-a"]));
    assert_eq!(task["primary_role"], "role-a");
    assert!(task.get("role_id").is_none());
    assert!(task.get("source_stream_id").is_none());

    let list = app
        .clone()
        .oneshot(Request::get("/api/tasks").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(list.status(), StatusCode::OK);
    let arr = body_json(list.into_body()).await;
    let rows = arr.as_array().unwrap();
    let row = rows
        .iter()
        .find(|r| r["id"] == tid)
        .expect("task should appear in REST list");
    assert_eq!(row["body"], "Canonical body");
    assert_eq!(row["primary_role"], "role-a");
    assert!(row.get("role_id").is_none());

    let del = app
        .clone()
        .oneshot(
            Request::delete(format!("/api/tasks/{}", tid))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(del.status(), StatusCode::OK);

    let get404 = app
        .clone()
        .oneshot(
            Request::get(format!("/api/tasks/{}", tid))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get404.status(), StatusCode::NOT_FOUND);

    let stream = app
        .oneshot(Request::get("/api/stream/all").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(stream.status(), StatusCode::OK);
    let entries = body_json(stream.into_body()).await;
    let entries = entries.as_array().unwrap();
    assert!(
        !entries.iter().any(|entry| entry["id"] == tid),
        "deleting task should also remove canonical stream entry"
    );
}

#[tokio::test]
async fn task_multi_user_isolation() {
    let app = setup_app(AuthMode::Multi).await;
    let token_alice = register_and_get_token(&app, "alice_iso", "password12345").await;
    let token_bob = register_and_get_token(&app, "bob_iso", "password12345").await;

    let tid = "t-alice-only";
    let put = app
        .clone()
        .oneshot(json_request(
            "PUT",
            &format!("/api/tasks/{}", tid),
            Some(&token_alice),
            Some(&minimal_public_task_json("Alice", "Alice body")),
        ))
        .await
        .unwrap();
    assert_eq!(put.status(), StatusCode::OK);

    let bob_list = app
        .clone()
        .oneshot(
            Request::get("/api/tasks")
                .header("authorization", format!("Bearer {}", token_bob))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(bob_list.status(), StatusCode::OK);
    let arr = body_json(bob_list.into_body()).await;
    let rows = arr.as_array().unwrap();
    assert!(
        !rows.iter().any(|r| r["id"] == tid),
        "bob must not see alice's task"
    );

    let alice_list = app
        .oneshot(
            Request::get("/api/tasks")
                .header("authorization", format!("Bearer {}", token_alice))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(alice_list.status(), StatusCode::OK);
    let arr = body_json(alice_list.into_body()).await;
    let rows = arr.as_array().unwrap();
    assert!(rows.iter().any(|r| r["id"] == tid));
}

// ── Stream CRUD (AuthMode::None) ─────────────────────────────────────

#[tokio::test]
async fn stream_put_list_day_recent_dates_search_delete() {
    let app = setup_app(AuthMode::None).await;
    let date_key = "2026-04-09";
    let ts = 1_714_560_000_000i64; // ms on that calendar day (example)
    let sid = "se-integration-1";
    let body = minimal_public_stream_json(sid, "unique_search_token_xyz", date_key, ts);

    let put = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/stream/{}", sid))
                .header("content-type", "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(put.status(), StatusCode::OK);

    let day = app
        .clone()
        .oneshot(
            Request::get(format!("/api/stream?date={}", date_key))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(day.status(), StatusCode::OK);
    let arr = body_json(day.into_body()).await;
    let rows = arr.as_array().unwrap();
    assert!(rows.iter().any(|r| r["id"] == sid));

    let dates = app
        .clone()
        .oneshot(
            Request::get("/api/stream/dates")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(dates.status(), StatusCode::OK);
    let djson = body_json(dates.into_body()).await;
    let darr = djson.as_array().unwrap();
    assert!(darr.iter().any(|d| d.as_str() == Some(date_key)));

    let recent = app
        .clone()
        .oneshot(
            Request::get("/api/stream/recent?days=30")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(recent.status(), StatusCode::OK);

    let search = app
        .clone()
        .oneshot(
            Request::get("/api/stream/search?q=unique_search_token_xyz&limit=50")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(search.status(), StatusCode::OK);
    let sjson = body_json(search.into_body()).await;
    let srows = sjson.as_array().unwrap();
    assert!(srows.iter().any(|r| r["id"] == sid));

    let del = app
        .clone()
        .oneshot(
            Request::delete(format!("/api/stream/{}", sid))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(del.status(), StatusCode::OK);

    let day_after = app
        .oneshot(
            Request::get(format!("/api/stream?date={}", date_key))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let arr = body_json(day_after.into_body()).await;
    let rows = arr.as_array().unwrap();
    assert!(!rows.iter().any(|r| r["id"] == sid));
}

#[tokio::test]
async fn rest_task_rejects_legacy_fields_and_stream_hides_legacy_links() {
    let app = setup_app(AuthMode::None).await;

    let legacy_put = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/tasks/se-legacy-1")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "title": "Legacy task",
                        "body": "legacy body",
                        "role_id": "role-a",
                        "source_stream_id": "se-other",
                        "created_at": 1700000000000i64,
                        "updated_at": 1700000000000i64,
                        "tags": [],
                        "subtask_ids": [],
                        "role_ids": ["role-a"],
                        "primary_role": "role-a",
                        "task_type": "task",
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(legacy_put.status(), StatusCode::BAD_REQUEST);

    let put = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/tasks/se-rest-stream-1")
                .header("content-type", "application/json")
                .body(Body::from(public_task_json_with_roles(
                    "Task with stream",
                    "Task content",
                    &["role-a"],
                )))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(put.status(), StatusCode::OK);

    let stream_all = app
        .oneshot(Request::get("/api/stream/all").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(stream_all.status(), StatusCode::OK);
    let entries = body_json(stream_all.into_body()).await;
    let entries = entries.as_array().unwrap();
    let entry = entries
        .iter()
        .find(|entry| entry["id"] == "se-rest-stream-1")
        .expect("task stream entry should exist");
    assert_eq!(entry["task_id"], "se-rest-stream-1");
    assert!(entry.get("extracted_task_id").is_none());
}

#[tokio::test]
async fn rest_stream_role_update_projects_single_role_task_facet() {
    let app = setup_app(AuthMode::None).await;
    let task_id = "se-role-projection-1";

    let put_task = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/tasks/{}", task_id))
                .header("content-type", "application/json")
                .body(Body::from(public_task_json_with_roles(
                    "Projection task",
                    "Projection body",
                    &["role-a"],
                )))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(put_task.status(), StatusCode::OK);

    let update_stream = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/stream/{}", task_id))
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "content": "Projection body",
                        "entry_type": "task",
                        "timestamp": 1700000000000i64,
                        "date_key": "2026-04-13",
                        "role_id": "role-b",
                        "tags": ["mlt"],
                        "attachments": [],
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(update_stream.status(), StatusCode::OK);

    let get_task = app
        .oneshot(
            Request::get(format!("/api/tasks/{}", task_id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get_task.status(), StatusCode::OK);
    let task = body_json(get_task.into_body()).await;
    assert_eq!(task["primary_role"], "role-b");
    assert_eq!(task["role_ids"], serde_json::json!(["role-b"]));
}

// ── Sync ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn sync_status_and_push_then_changes() {
    let app = setup_app(AuthMode::None).await;

    let st = app
        .clone()
        .oneshot(
            Request::get("/api/sync/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(st.status(), StatusCode::OK);
    let st_json = body_json(st.into_body()).await;
    let v0 = st_json["current_version"].as_i64().unwrap();

    let task_json = minimal_task_json("t-sync-push", "sync");
    let push_body = serde_json::json!({
        "changes": [{
            "table": "tasks",
            "key": "t-sync-push",
            "data": task_json,
            "version": 1,
            "updated_at": "2026-04-09T12:00:00Z"
        }]
    })
    .to_string();

    let push = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/sync/push")
                .header("content-type", "application/json")
                .body(Body::from(push_body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(push.status(), StatusCode::OK);
    let pj = body_json(push.into_body()).await;
    assert_eq!(pj["ok"], true);
    assert!(pj["current_version"].as_i64().unwrap() > v0);

    let ch = app
        .oneshot(
            Request::get(format!("/api/sync/changes?since={}", v0))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ch.status(), StatusCode::OK);
    let cj = body_json(ch.into_body()).await;
    let changes = cj["changes"].as_array().unwrap();
    assert!(
        changes.iter().any(|c| c["key"] == "t-sync-push"),
        "changes should include pushed task"
    );
}

// ── MCP JSON-RPC ────────────────────────────────────────────────────

#[tokio::test]
async fn mcp_disabled_returns_503() {
    let app = setup_app(AuthMode::None).await;

    app.clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/settings")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"key":"module:mcp-integration:enabled","value":"false"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let resp = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mcp")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::SERVICE_UNAVAILABLE);
    let j = body_json(resp.into_body()).await;
    assert_eq!(j["error"]["message"], "MCP integration is disabled");
}

#[tokio::test]
async fn mcp_initialize_returns_capabilities() {
    let app = setup_app(AuthMode::None).await;

    let resp = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mcp")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let j = body_json(resp.into_body()).await;
    assert!(j["result"]["capabilities"]["tools"].is_object());
    assert_eq!(j["result"]["serverInfo"]["name"], "my-little-todo");
}

#[tokio::test]
async fn mcp_tools_list_respects_permission_and_disabled() {
    let app = setup_app(AuthMode::None).await;

    // Default permission = read: create_task (rank 1) must not appear
    let list_read = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mcp")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_read.status(), StatusCode::OK);
    let j = body_json(list_read.into_body()).await;
    let tools = j["result"]["tools"].as_array().unwrap();
    let names: Vec<&str> = tools.iter().filter_map(|t| t["name"].as_str()).collect();
    assert!(names.contains(&"get_overview"));
    assert!(!names.contains(&"create_task"));

    // Full permission
    app.clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/settings")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"key":"mcp-permission-level","value":"full"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let list_full = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mcp")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{}}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let j2 = body_json(list_full.into_body()).await;
    let tools2 = j2["result"]["tools"].as_array().unwrap();
    let names2: Vec<&str> = tools2.iter().filter_map(|t| t["name"].as_str()).collect();
    assert!(names2.contains(&"create_task"));

    // Disable get_overview
    app.clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/settings")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"key":"mcp-disabled-tools","value":"[\"get_overview\"]"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let list_dis = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mcp")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"jsonrpc":"2.0","id":4,"method":"tools/list","params":{}}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let j3 = body_json(list_dis.into_body()).await;
    let tools3 = j3["result"]["tools"].as_array().unwrap();
    let names3: Vec<&str> = tools3.iter().filter_map(|t| t["name"].as_str()).collect();
    assert!(!names3.contains(&"get_overview"));
}

#[tokio::test]
async fn mcp_tools_call_rejects_insufficient_permission() {
    let app = setup_app(AuthMode::None).await;
    // read level (default): update_task requires full
    let resp = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mcp")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"update_task","arguments":{"id":"x"}}}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let j = body_json(resp.into_body()).await;
    assert!(j["error"]["message"]
        .as_str()
        .unwrap()
        .contains("requires a higher permission level"));
}

#[tokio::test]
async fn mcp_task_tools_use_new_contract() {
    let app = setup_app(AuthMode::None).await;

    app.clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri("/api/settings")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"key":"mcp-permission-level","value":"full"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    let create = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mcp")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": 6,
                        "method": "tools/call",
                        "params": {
                            "name": "create_task",
                            "arguments": {
                                "title": "MCP task",
                                "body": "MCP body",
                                "role_ids": ["role-a", "role-b"],
                                "primary_role": "role-a",
                                "tags": ["mlt"]
                            }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(create.status(), StatusCode::OK);
    let create_json = body_json(create.into_body()).await;
    let text = create_json["result"]["content"][0]["text"]
        .as_str()
        .expect("mcp create should return text payload");
    let payload: serde_json::Value = serde_json::from_str(text).unwrap();
    let task_id = payload["id"].as_str().expect("create_task should return id");

    let get_task = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mcp")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": 7,
                        "method": "tools/call",
                        "params": {
                            "name": "get_task",
                            "arguments": {
                                "id": task_id
                            }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get_task.status(), StatusCode::OK);
    let get_json = body_json(get_task.into_body()).await;
    let text = get_json["result"]["content"][0]["text"]
        .as_str()
        .expect("mcp get_task should return text payload");
    let payload: serde_json::Value = serde_json::from_str(text).unwrap();
    assert_eq!(payload["id"], task_id);
    assert_eq!(payload["body"], "MCP body");
    assert_eq!(payload["role_ids"], serde_json::json!(["role-a", "role-b"]));
    assert_eq!(payload["primary_role"], "role-a");
    assert!(payload.get("role").is_none());
    assert!(payload.get("role_id").is_none());
    assert!(payload.get("source_stream_id").is_none());

    let list_stream = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/mcp")
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": 8,
                        "method": "tools/call",
                        "params": {
                            "name": "list_stream",
                            "arguments": {
                                "days": 30
                            }
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_stream.status(), StatusCode::OK);
    let list_json = body_json(list_stream.into_body()).await;
    let text = list_json["result"]["content"][0]["text"]
        .as_str()
        .expect("mcp list_stream should return text payload");
    let payload: serde_json::Value = serde_json::from_str(text).unwrap();
    let entries = payload["entries"].as_array().unwrap();
    let entry = entries
        .iter()
        .find(|entry| entry["id"] == task_id)
        .expect("task entry should appear in mcp stream list");
    assert_eq!(entry["task_id"], task_id);
    assert!(entry.get("extracted_task_id").is_none());
}

// ── Auth Flow (AuthMode::Multi) ──────────────────────────────────────

#[tokio::test]
async fn auth_mode_endpoint() {
    let app = setup_app(AuthMode::Multi).await;

    let resp = app
        .oneshot(Request::get("/api/auth/mode").body(Body::empty()).unwrap())
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
        .oneshot(Request::get("/api/auth/me").body(Body::empty()).unwrap())
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
                .body(Body::from(r#"{"username":"dup","password":"pass1"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    let resp = app
        .oneshot(
            Request::post("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"username":"dup","password":"pass2"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::CONFLICT);
}

// ── Sync: title_customized round-trip ────────────────────────────────

#[tokio::test]
async fn sync_push_preserves_title_customized() {
    let app = setup_app(AuthMode::None).await;

    let st = app
        .clone()
        .oneshot(
            Request::get("/api/sync/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let st_json = body_json(st.into_body()).await;
    let v0 = st_json["current_version"].as_i64().unwrap();

    let task_json = task_json_with_title_customized("t-tc-sync", "custom title", 1);
    let push_body = serde_json::json!({
        "changes": [{
            "table": "tasks",
            "key": "t-tc-sync",
            "data": task_json,
            "version": 1,
            "updated_at": "2026-04-09T12:00:00Z"
        }]
    })
    .to_string();

    let push = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/sync/push")
                .header("content-type", "application/json")
                .body(Body::from(push_body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(push.status(), StatusCode::OK);

    let ch = app
        .clone()
        .oneshot(
            Request::get(format!("/api/sync/changes?since={}", v0))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(ch.status(), StatusCode::OK);
    let cj = body_json(ch.into_body()).await;
    let changes = cj["changes"].as_array().unwrap();
    let task_change = changes
        .iter()
        .find(|c| c["key"] == "t-tc-sync")
        .expect("should find pushed task in changes");

    let data_str = task_change["data"].as_str().unwrap();
    let data: serde_json::Value = serde_json::from_str(data_str).unwrap();
    assert_eq!(
        data["title_customized"].as_i64().unwrap(),
        1,
        "title_customized should be preserved through sync push/pull"
    );

    let get = app
        .oneshot(
            Request::get("/api/tasks/t-tc-sync")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(get.status(), StatusCode::OK);
    let task = body_json(get.into_body()).await;
    assert_eq!(
        task["title_customized"].as_i64().unwrap(),
        1,
        "title_customized should be 1 when read via REST"
    );
}

// ── Sync: blob delete round-trip ─────────────────────────────────────

#[tokio::test]
async fn sync_push_blob_delete() {
    let app = setup_app(AuthMode::None).await;

    let st = app
        .clone()
        .oneshot(
            Request::get("/api/sync/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let st_json = body_json(st.into_body()).await;
    let v0 = st_json["current_version"].as_i64().unwrap();

    let push_body = serde_json::json!({
        "changes": [{
            "table": "blobs",
            "key": "blob-test-1",
            "version": 1,
            "updated_at": "2026-04-09T12:00:00Z",
            "deleted_at": "2026-04-09T12:01:00Z"
        }]
    })
    .to_string();

    let push = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/sync/push")
                .header("content-type", "application/json")
                .body(Body::from(push_body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(push.status(), StatusCode::OK);
    let pj = body_json(push.into_body()).await;
    assert_eq!(pj["ok"], true);
    assert!(
        pj["current_version"].as_i64().unwrap() >= v0,
        "version should not regress after blob delete push"
    );
}

#[tokio::test]
async fn blob_read_requires_owner_or_admin() {
    let app = setup_app(AuthMode::Multi).await;
    let admin_token = register_and_get_token(&app, "blob_admin", "password12345").await;
    let owner_token = register_and_get_token(&app, "blob_owner", "password12345").await;
    let other_token = register_and_get_token(&app, "blob_other", "password12345").await;

    let upload = app
        .clone()
        .oneshot(multipart_upload_request(
            "/api/blobs/upload",
            &owner_token,
            "note.txt",
            "text/plain",
            b"important blob content",
        ))
        .await
        .unwrap();
    assert_eq!(upload.status(), StatusCode::OK);
    let upload_json = body_json(upload.into_body()).await;
    let blob_id = upload_json["id"].as_str().unwrap();

    let owner_get = app
        .clone()
        .oneshot(
            Request::get(format!("/api/blobs/{}", blob_id))
                .header("authorization", format!("Bearer {}", owner_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(owner_get.status(), StatusCode::OK);

    let admin_get = app
        .clone()
        .oneshot(
            Request::get(format!("/api/blobs/{}", blob_id))
                .header("authorization", format!("Bearer {}", admin_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(admin_get.status(), StatusCode::OK);

    let other_get = app
        .oneshot(
            Request::get(format!("/api/blobs/{}", blob_id))
                .header("authorization", format!("Bearer {}", other_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(other_get.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn file_host_routes_alias_blob_storage_and_config() {
    let app = setup_app(AuthMode::Multi).await;
    let admin_token = register_and_get_token(&app, "file_host_admin", "password12345").await;
    let user_token = register_and_get_token(&app, "file_host_user", "password12345").await;

    let update = app
        .clone()
        .oneshot(json_request(
            "PUT",
            "/api/admin/file-host/config",
            Some(&admin_token),
            Some(
                &serde_json::json!({
                    "enabled": true,
                    "max_size": 2097152,
                    "default_provider": "mlt-server",
                    "public_base_url": "https://cdn.example.com/files",
                })
                .to_string(),
            ),
        ))
        .await
        .unwrap();
    assert_eq!(update.status(), StatusCode::OK);

    let upload = app
        .clone()
        .oneshot(multipart_upload_request(
            "/api/file-host/upload",
            &user_token,
            "manual.pdf",
            "application/pdf",
            b"pdf bytes",
        ))
        .await
        .unwrap();
    assert_eq!(upload.status(), StatusCode::OK);
    let upload_json = body_json(upload.into_body()).await;
    assert_eq!(upload_json["url"], "/api/file-host/".to_string() + upload_json["id"].as_str().unwrap());

    let config = app
        .clone()
        .oneshot(
            Request::get("/api/file-host/config")
                .header("authorization", format!("Bearer {}", user_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(config.status(), StatusCode::OK);
    let config_json = body_json(config.into_body()).await;
    assert_eq!(config_json["enabled"], true);
    assert_eq!(config_json["allow_attachments"], true);
    assert_eq!(config_json["default_provider"], "mlt-server");
    assert_eq!(config_json["storage"], "mlt-server");
    assert_eq!(config_json["public_base_url"], "https://cdn.example.com/files");

    let blob_id = upload_json["id"].as_str().unwrap();
    let fetch = app
        .oneshot(
            Request::get(format!("/api/file-host/{}", blob_id))
                .header("authorization", format!("Bearer {}", user_token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(fetch.status(), StatusCode::OK);
}

#[tokio::test]
async fn export_json_includes_backup_metadata_and_blobs() {
    let app = setup_app(AuthMode::Multi).await;
    let token = register_and_get_token(&app, "export_user", "password12345").await;

    let put_task = app
        .clone()
        .oneshot(json_request(
            "PUT",
            "/api/tasks/t-export-1",
            Some(&token),
            Some(&minimal_public_task_json("Export Task", "Export body")),
        ))
        .await
        .unwrap();
    assert_eq!(put_task.status(), StatusCode::OK);

    let put_setting = app
        .clone()
        .oneshot(json_request(
            "PUT",
            "/api/settings",
            Some(&token),
            Some(r#"{"key":"theme","value":"dark"}"#),
        ))
        .await
        .unwrap();
    assert_eq!(put_setting.status(), StatusCode::OK);

    let upload = app
        .clone()
        .oneshot(multipart_upload_request(
            "/api/blobs/upload",
            &token,
            "note.txt",
            "text/plain",
            b"blob backup payload",
        ))
        .await
        .unwrap();
    assert_eq!(upload.status(), StatusCode::OK);

    let export = app
        .oneshot(
            Request::get("/api/export/json")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(export.status(), StatusCode::OK);

    let json = body_json(export.into_body()).await;
    assert_eq!(json["kind"], "my-little-todo-backup");
    assert_eq!(json["schema_version"], 1);
    assert_eq!(json["export_version"], 3);
    assert_eq!(json["platform"], "server");
    assert_eq!(json["includes_blobs"], true);
    assert!(json["tasks"].as_array().unwrap().len() >= 1);
    assert!(json["settings"].as_array().unwrap().len() >= 1);
    let blobs = json["blobs"].as_array().unwrap();
    assert_eq!(blobs.len(), 1);
    assert_eq!(blobs[0]["filename"], "note.txt");
    assert!(!blobs[0]["content_base64"].as_str().unwrap().is_empty());
}

#[tokio::test]
async fn export_to_disk_is_admin_only_and_path_restricted() {
    let allowed_root = std::env::temp_dir().join(format!("mlt-export-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&allowed_root).unwrap();
    let disallowed_root =
        std::env::temp_dir().join(format!("mlt-export-outside-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&disallowed_root).unwrap();

    let app = setup_app_with_config(ServerConfig {
        auth_mode: AuthMode::Multi,
        database_url: Some("sqlite::memory:".into()),
        jwt_secret: "test-secret".into(),
        data_dir: temp_data_dir(),
        admin_export_dirs: vec![allowed_root.to_string_lossy().to_string()],
        ..Default::default()
    })
    .await;

    let admin_token = register_and_get_token(&app, "disk_admin", "password12345").await;
    let user_token = register_and_get_token(&app, "disk_user", "password12345").await;

    let user_resp = app
        .clone()
        .oneshot(json_request(
            "POST",
            "/api/export/disk",
            Some(&user_token),
            Some(
                &serde_json::json!({
                    "path": allowed_root.join("user-attempt").to_string_lossy(),
                })
                .to_string(),
            ),
        ))
        .await
        .unwrap();
    assert_eq!(user_resp.status(), StatusCode::FORBIDDEN);

    let outside_resp = app
        .clone()
        .oneshot(json_request(
            "POST",
            "/api/export/disk",
            Some(&admin_token),
            Some(
                &serde_json::json!({
                    "path": disallowed_root.join("outside").to_string_lossy(),
                })
                .to_string(),
            ),
        ))
        .await
        .unwrap();
    assert_eq!(outside_resp.status(), StatusCode::BAD_REQUEST);

    let export_target = allowed_root.join("approved");
    let admin_resp = app
        .clone()
        .oneshot(json_request(
            "POST",
            "/api/export/disk",
            Some(&admin_token),
            Some(
                &serde_json::json!({
                    "path": export_target.to_string_lossy(),
                })
                .to_string(),
            ),
        ))
        .await
        .unwrap();
    assert_eq!(admin_resp.status(), StatusCode::OK);
    assert!(export_target.join("export.json").exists());
}
