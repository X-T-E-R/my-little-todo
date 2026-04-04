pub mod auth;
pub mod backup;
pub mod config;
pub mod export;
pub mod providers;
pub mod routes;
pub mod utils;

use std::sync::Arc;

use axum::{
    middleware as axum_mw,
    routing::{delete, get, post, put},
    Json, Router,
};
use config::ServerConfig;
use providers::DatabaseProvider;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<dyn DatabaseProvider>,
    pub config: Arc<ServerConfig>,
    pub version: &'static str,
    pub git_hash: &'static str,
}

pub fn create_app(
    db: Arc<dyn DatabaseProvider>,
    config: ServerConfig,
    version: &'static str,
    git_hash: &'static str,
) -> Router {
    let config = Arc::new(config);
    let state = AppState {
        db,
        config: config.clone(),
        version,
        git_hash,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Auth routes (no auth middleware)
    let auth_routes = Router::new()
        .route("/auth/mode", get(routes::auth::get_mode))
        .route("/auth/register", post(routes::auth::register))
        .route("/auth/login", post(routes::auth::login))
        .with_state(state.clone());

    // Protected auth routes
    let auth_protected = Router::new()
        .route("/auth/me", get(routes::auth::me))
        .route("/auth/change-password", post(routes::auth::change_password))
        .route("/auth/api-token", post(routes::auth::generate_api_token))
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            auth::middleware::auth_middleware,
        ))
        .with_state(state.clone());

    // Tasks + stream (protected)
    let task_routes = Router::new()
        .route("/tasks", get(routes::tasks::list_tasks))
        .route(
            "/tasks/{id}",
            get(routes::tasks::get_task)
                .put(routes::tasks::put_task)
                .delete(routes::tasks::delete_task),
        )
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            auth::middleware::auth_middleware,
        ))
        .with_state(state.clone());

    let stream_routes = Router::new()
        .route("/stream", get(routes::stream::list_stream_day))
        .route("/stream/recent", get(routes::stream::list_stream_recent))
        .route("/stream/dates", get(routes::stream::list_stream_dates))
        .route(
            "/stream/{id}",
            put(routes::stream::put_stream_entry).delete(routes::stream::delete_stream_entry),
        )
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            auth::middleware::auth_middleware,
        ))
        .with_state(state.clone());

    // Settings routes (protected, per-user)
    let settings_routes = Router::new()
        .route(
            "/settings",
            get(routes::data::get_settings)
                .put(routes::data::put_setting)
                .delete(routes::data::delete_setting),
        )
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            auth::middleware::auth_middleware,
        ))
        .with_state(state.clone());

    // Export/import routes (protected)
    let export_routes = Router::new()
        .route("/export/json", get(routes::data::export_json))
        .route("/export/markdown", get(routes::data::export_markdown))
        .route("/export/disk", post(routes::data::export_to_disk))
        .route("/import/json", post(routes::data::import_json))
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            auth::middleware::auth_middleware,
        ))
        .with_state(state.clone());

    // Admin routes (protected, requires admin role)
    let admin_routes = Router::new()
        .route("/admin/users", get(routes::admin::list_users))
        .route("/admin/users/{id}", delete(routes::admin::delete_user))
        .route(
            "/admin/users/{id}/password",
            post(routes::admin::reset_user_password),
        )
        .route("/admin/stats", get(routes::admin::get_stats))
        .route("/admin/storage", get(routes::data::storage_info))
        .route("/admin/migrate", post(routes::data::migrate_data))
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            auth::middleware::auth_middleware,
        ))
        .with_state(state.clone());

    // AI config routes (protected, any user)
    let ai_routes = Router::new()
        .route(
            "/ai/shared-config",
            get(routes::admin::get_shared_ai_config),
        )
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            auth::middleware::auth_middleware,
        ))
        .with_state(state.clone());

    // MCP routes (protected)
    let mcp_routes = Router::new()
        .route("/mcp", post(routes::mcp::handle_mcp))
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            auth::middleware::auth_middleware,
        ))
        .with_state(state.clone());

    // Blob routes (protected)
    let blob_routes = Router::new()
        .route("/blobs/upload", post(routes::blobs::upload_blob))
        .route("/blobs/list", get(routes::blobs::list_blobs))
        .route(
            "/blobs/{id}",
            get(routes::blobs::get_blob).delete(routes::blobs::delete_blob),
        )
        .route(
            "/blobs/config",
            get(routes::blobs::get_attachment_config),
        )
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            auth::middleware::auth_middleware,
        ))
        .with_state(state.clone());

    // Backup routes (protected, requires admin role)
    let backup_routes = Router::new()
        .route(
            "/backup/config",
            get(routes::backup::get_config).put(routes::backup::update_config),
        )
        .route("/backup/run", post(routes::backup::run_backup))
        .route("/backup/list", get(routes::backup::list_backups))
        .route("/backup/restore", post(routes::backup::restore_backup))
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            auth::middleware::auth_middleware,
        ))
        .with_state(state.clone());

    // Sync routes (protected)
    let sync_routes = Router::new()
        .route("/sync/changes", get(routes::sync::get_changes))
        .route("/sync/status", get(routes::sync::get_status))
        .route("/sync/push", post(routes::sync::push_changes))
        .layer(axum_mw::from_fn_with_state(
            state.clone(),
            auth::middleware::auth_middleware,
        ))
        .with_state(state.clone());

    let health_state = state.clone();
    let static_dir = config.static_dir.clone();

    let router = Router::new()
        .nest("/api", auth_routes)
        .nest("/api", auth_protected)
        .nest("/api", task_routes)
        .nest("/api", stream_routes)
        .nest("/api", settings_routes)
        .nest("/api", export_routes)
        .nest("/api", admin_routes)
        .nest("/api", backup_routes)
        .nest("/api", ai_routes)
        .nest("/api", mcp_routes)
        .nest("/api", blob_routes)
        .nest("/api", sync_routes)
        .route(
            "/health",
            get(move || async move {
                Json(serde_json::json!({
                    "status": "ok",
                    "version": health_state.version,
                    "git_hash": health_state.git_hash,
                    "db": format!("{:?}", health_state.config.db_type),
                    "auth": format!("{:?}", health_state.config.auth_mode),
                    "timestamp": timestamp_now(),
                }))
            }),
        )
        .layer(cors);

    if let Some(ref dir) = static_dir {
        let index = format!("{}/index.html", dir);
        let serve = ServeDir::new(dir).not_found_service(ServeFile::new(index));
        router.fallback_service(serve)
    } else {
        router
    }
}

pub async fn start(
    config: ServerConfig,
    version: &'static str,
    git_hash: &'static str,
) -> anyhow::Result<()> {
    let db = providers::create_provider(&config).await?;

    // Auto-create default admin for single-user mode
    if config.auth_mode == config::AuthMode::Single {
        let count = db.count_users().await?;
        if count == 0 {
            if let Some(ref password) = config.default_admin_password {
                let hash = auth::hash_password(password)?;
                db.create_user(&providers::NewUser {
                    username: "admin".into(),
                    password_hash: hash,
                    is_admin: true,
                })
                .await?;
                println!("[Auth] Created default admin user");
            }
        }
    }

    // L0 config backup: store a copy of the active config in the DB
    let toml_backup = config.to_toml_string();
    let _ = db
        .put_setting("_system", "_l0_config_backup", &toml_backup)
        .await;

    let app = create_app(db, config.clone(), version, git_hash);
    let bind_addr = format!("{}:{}", config.host, config.port);

    println!(
        "[Server] Starting on http://{} (db={:?}, auth={:?})",
        bind_addr, config.db_type, config.auth_mode
    );

    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

fn timestamp_now() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{}", secs)
}
