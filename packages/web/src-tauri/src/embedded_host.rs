use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Manager, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const HOST_STATUS_INACTIVE: &str = "inactive";
const HOST_STATUS_STARTING: &str = "starting";
const HOST_STATUS_RUNNING: &str = "running";
const HOST_STATUS_STOPPING: &str = "stopping";
const HOST_STATUS_FAILED: &str = "failed";
const LOCAL_SQLITE_FILE: &str = "data.db";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedHostConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub auth_provider: String,
    pub signup_policy: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedHostRuntimeState {
    pub status: String,
    pub base_url: Option<String>,
    pub last_error: Option<String>,
}

impl Default for EmbeddedHostRuntimeState {
    fn default() -> Self {
        Self {
            status: HOST_STATUS_INACTIVE.to_string(),
            base_url: None,
            last_error: None,
        }
    }
}

struct EmbeddedHostProcess {
    child: Child,
}

#[derive(Default)]
pub struct EmbeddedHostManager {
    process: Option<EmbeddedHostProcess>,
    state: EmbeddedHostRuntimeState,
}

impl EmbeddedHostManager {
    fn refresh(&mut self) {
        let mut exit_message = None;
        if let Some(process) = self.process.as_mut() {
            match process.child.try_wait() {
                Ok(Some(status)) => {
                    exit_message = Some(match status.code() {
                        Some(code) => format!("Embedded host exited with code {}.", code),
                        None => "Embedded host exited unexpectedly.".to_string(),
                    });
                }
                Ok(None) => {}
                Err(error) => {
                    exit_message = Some(format!("Failed to poll embedded host: {}", error));
                }
            }
        }

        if let Some(message) = exit_message {
            self.process = None;
            self.state.status = HOST_STATUS_FAILED.to_string();
            self.state.base_url = None;
            self.state.last_error = Some(message);
        }
    }

    fn snapshot(&mut self) -> EmbeddedHostRuntimeState {
        self.refresh();
        self.state.clone()
    }

    fn set_state(
        &mut self,
        status: &str,
        base_url: Option<String>,
        last_error: Option<String>,
    ) -> EmbeddedHostRuntimeState {
        self.state = EmbeddedHostRuntimeState {
            status: status.to_string(),
            base_url,
            last_error,
        };
        self.state.clone()
    }

    fn stop_process(&mut self) -> Result<(), String> {
        if let Some(mut process) = self.process.take() {
            process
                .child
                .kill()
                .map_err(|error| format!("Failed to stop embedded host: {}", error))?;
            let _ = process.child.wait();
        }
        Ok(())
    }
}

fn is_loopback_host(host: &str) -> bool {
    matches!(host, "127.0.0.1" | "localhost")
}

fn base_url(config: &EmbeddedHostConfig) -> String {
    format!("http://{}:{}", config.host, config.port)
}

fn validate_config(config: &EmbeddedHostConfig) -> Result<(), String> {
    if !config.enabled {
        return Err("Embedded host module is disabled.".to_string());
    }
    if config.auth_provider != "none" {
        return Err(
            "Desktop embedded host currently only supports auth_provider=none.".to_string(),
        );
    }
    if !is_loopback_host(config.host.as_str()) && config.auth_provider == "none" {
        return Err("LAN mode requires embedded auth.".to_string());
    }
    Ok(())
}

fn resolve_packaged_sidecar_path() -> Option<PathBuf> {
    let current = std::env::current_exe().ok()?;
    let dir = current.parent()?;
    let filename = if cfg!(windows) {
        "mlt-server.exe"
    } else {
        "mlt-server"
    };
    let direct = dir.join(filename);
    if direct.exists() {
        return Some(direct);
    }
    None
}

fn resolve_dev_sidecar_path() -> Option<PathBuf> {
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..");
    let filename = if cfg!(windows) {
        "mlt-server.exe"
    } else {
        "mlt-server"
    };
    let candidates = [
        repo_root.join("target").join("debug").join(filename),
        repo_root.join("target").join("release").join(filename),
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("debug")
            .join(filename),
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("release")
            .join(filename),
    ];
    candidates.into_iter().find(|candidate| candidate.exists())
}

fn resolve_sidecar_path() -> Result<PathBuf, String> {
    resolve_packaged_sidecar_path()
        .or_else(resolve_dev_sidecar_path)
        .ok_or_else(|| {
            "Embedded host binary not found. Build mlt-server-bin before starting the desktop host."
                .to_string()
        })
}

fn resolve_database_url(app: &AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data dir: {}", error))?;
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Failed to create app data dir: {}", error))?;
    let db_path = app_data_dir.join(LOCAL_SQLITE_FILE);
    Ok(format!("sqlite:{}?mode=rwc", db_path.to_string_lossy()))
}

async fn wait_for_health(base_url: &str, child: &mut Child) -> Result<(), String> {
    let client = reqwest::Client::new();
    let health_url = format!("{}/health", base_url);
    for _ in 0..20 {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(match status.code() {
                    Some(code) => format!("Embedded host exited before health check with code {}.", code),
                    None => "Embedded host exited before health check.".to_string(),
                });
            }
            Ok(None) => {}
            Err(error) => return Err(format!("Failed to poll embedded host: {}", error)),
        }

        match client.get(&health_url).send().await {
            Ok(response) if response.status().is_success() => return Ok(()),
            Ok(_) | Err(_) => std::thread::sleep(Duration::from_millis(250)),
        }
    }
    Err("Embedded host health check timed out.".to_string())
}

async fn spawn_embedded_host(
    app: &AppHandle,
    config: &EmbeddedHostConfig,
) -> Result<EmbeddedHostProcess, String> {
    let binary_path = resolve_sidecar_path()?;
    let database_url = resolve_database_url(app)?;
    let mut command = Command::new(&binary_path);
    command
        .env("HOST", config.host.as_str())
        .env("PORT", config.port.to_string())
        .env("AUTH_PROVIDER", config.auth_provider.as_str())
        .env("EMBEDDED_SIGNUP_POLICY", config.signup_policy.as_str())
        .env("SYNC_MODE", "hosted")
        .env("DB_TYPE", "sqlite")
        .env("DATABASE_URL", database_url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start embedded host: {}", error))?;
    let health_result = wait_for_health(base_url(config).as_str(), &mut child).await;
    if let Err(error) = health_result {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    Ok(EmbeddedHostProcess { child })
}

#[tauri::command]
pub fn embedded_host_get_runtime_state(
    manager: State<'_, Mutex<EmbeddedHostManager>>,
) -> Result<EmbeddedHostRuntimeState, String> {
    let mut manager = manager
        .lock()
        .map_err(|_| "Failed to lock embedded host manager.".to_string())?;
    Ok(manager.snapshot())
}

#[tauri::command]
pub async fn embedded_host_start(
    app: AppHandle,
    manager: State<'_, Mutex<EmbeddedHostManager>>,
    config: EmbeddedHostConfig,
) -> Result<EmbeddedHostRuntimeState, String> {
    validate_config(&config)?;
    {
        let mut manager = manager
            .lock()
            .map_err(|_| "Failed to lock embedded host manager.".to_string())?;
        manager.refresh();
        if manager.process.is_some() {
            return Ok(manager.state.clone());
        }
        manager.set_state(HOST_STATUS_STARTING, None, None);
    }

    match spawn_embedded_host(&app, &config).await {
        Ok(process) => {
            let mut manager = manager
                .lock()
                .map_err(|_| "Failed to lock embedded host manager.".to_string())?;
            manager.process = Some(process);
            Ok(manager.set_state(HOST_STATUS_RUNNING, Some(base_url(&config)), None))
        }
        Err(error) => {
            let mut manager = manager
                .lock()
                .map_err(|_| "Failed to lock embedded host manager.".to_string())?;
            manager.process = None;
            manager.set_state(HOST_STATUS_FAILED, None, Some(error.clone()));
            Err(error)
        }
    }
}

#[tauri::command]
pub fn embedded_host_stop(
    manager: State<'_, Mutex<EmbeddedHostManager>>,
) -> Result<EmbeddedHostRuntimeState, String> {
    let mut manager = manager
        .lock()
        .map_err(|_| "Failed to lock embedded host manager.".to_string())?;
    manager.refresh();
    manager.set_state(HOST_STATUS_STOPPING, None, None);
    manager.stop_process()?;
    Ok(manager.set_state(HOST_STATUS_INACTIVE, None, None))
}

#[tauri::command]
pub async fn embedded_host_restart(
    app: AppHandle,
    manager: State<'_, Mutex<EmbeddedHostManager>>,
    config: EmbeddedHostConfig,
) -> Result<EmbeddedHostRuntimeState, String> {
    validate_config(&config)?;
    {
        let mut manager = manager
            .lock()
            .map_err(|_| "Failed to lock embedded host manager.".to_string())?;
        manager.refresh();
        manager.set_state(HOST_STATUS_STOPPING, None, None);
        manager.stop_process()?;
        manager.set_state(HOST_STATUS_STARTING, None, None);
    }

    match spawn_embedded_host(&app, &config).await {
        Ok(process) => {
            let mut manager = manager
                .lock()
                .map_err(|_| "Failed to lock embedded host manager.".to_string())?;
            manager.process = Some(process);
            Ok(manager.set_state(HOST_STATUS_RUNNING, Some(base_url(&config)), None))
        }
        Err(error) => {
            let mut manager = manager
                .lock()
                .map_err(|_| "Failed to lock embedded host manager.".to_string())?;
            manager.process = None;
            manager.set_state(HOST_STATUS_FAILED, None, Some(error.clone()));
            Err(error)
        }
    }
}
