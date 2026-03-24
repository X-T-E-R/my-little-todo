use tauri::Manager;
use tokio::sync::Mutex;

use mlt_server::config::{AuthMode, DbType, ServerConfig};

struct ServerState {
    handle: Option<tokio::task::JoinHandle<()>>,
    config: Option<ServerConfig>,
}

static SERVER_STATE: std::sync::OnceLock<Mutex<ServerState>> = std::sync::OnceLock::new();

fn server_state() -> &'static Mutex<ServerState> {
    SERVER_STATE.get_or_init(|| {
        Mutex::new(ServerState {
            handle: None,
            config: None,
        })
    })
}

#[tauri::command]
async fn start_embedded_server(
    app: tauri::AppHandle,
    port: Option<u16>,
    host: Option<String>,
    token: Option<String>,
    auth_mode: Option<String>,
) -> Result<String, String> {
    let mut state = server_state().lock().await;
    if state.handle.is_some() {
        let p = state.config.as_ref().map(|c| c.port).unwrap_or(3001);
        return Ok(format!("http://127.0.0.1:{}", p));
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?
        .join("data");

    std::fs::create_dir_all(&data_dir).ok();

    let port = port.unwrap_or(3001);
    let host = host.unwrap_or_else(|| "127.0.0.1".into());

    let am = match auth_mode.as_deref() {
        Some("multi") => AuthMode::Multi,
        Some("single") => AuthMode::Single,
        _ => AuthMode::None,
    };

    let config = ServerConfig {
        port,
        host: host.clone(),
        auth_mode: am,
        db_type: DbType::Sqlite,
        data_dir: data_dir.to_string_lossy().to_string(),
        database_url: None,
        jwt_secret: token.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        default_admin_password: None,
        static_dir: None,
    };

    state.config = Some(config.clone());

    let join = tokio::spawn(async move {
        if let Err(e) = mlt_server::start(config, env!("CARGO_PKG_VERSION"), "dev").await {
            eprintln!("[Embedded Server] Error: {}", e);
        }
    });

    state.handle = Some(join);
    drop(state);

    let url = format!("http://127.0.0.1:{}", port);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .unwrap_or_default();
    for _ in 0..50 {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        if let Ok(resp) = client.get(format!("{}/health", &url)).send().await {
            if resp.status().is_success() {
                return Ok(url);
            }
        }
    }
    Ok(url)
}

#[tauri::command]
async fn stop_embedded_server() -> Result<(), String> {
    let mut state = server_state().lock().await;
    if let Some(h) = state.handle.take() {
        h.abort();
        state.config = None;
        Ok(())
    } else {
        Err("Server is not running".into())
    }
}

#[tauri::command]
async fn is_server_running() -> bool {
    let state = server_state().lock().await;
    state.handle.is_some()
}

#[tauri::command]
async fn get_server_config() -> Result<serde_json::Value, String> {
    let state = server_state().lock().await;
    match &state.config {
        Some(c) => Ok(serde_json::json!({
            "port": c.port,
            "host": c.host,
            "auth_mode": format!("{:?}", c.auth_mode).to_lowercase(),
            "running": state.handle.is_some(),
        })),
        None => Ok(serde_json::json!({
            "port": 3001,
            "host": "127.0.0.1",
            "auth_mode": "none",
            "running": false,
        })),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            start_embedded_server,
            stop_embedded_server,
            is_server_running,
            get_server_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
