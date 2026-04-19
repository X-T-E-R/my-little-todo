use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const RUNNER_STATUS_INACTIVE: &str = "inactive";
const RUNNER_STATUS_STARTING: &str = "starting";
const RUNNER_STATUS_RUNNING: &str = "running";
const RUNNER_STATUS_STOPPING: &str = "stopping";
const RUNNER_STATUS_FAILED: &str = "failed";
const PLUGIN_STORAGE_ROOT: &str = "my-little-todo/plugins";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRunnerStartRequest {
    pub plugin_id: String,
    pub entry_point: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRunnerRuntimeState {
    pub plugin_id: String,
    pub status: String,
    pub base_url: Option<String>,
    pub token: Option<String>,
    pub last_error: Option<String>,
}

impl PluginRunnerRuntimeState {
    fn inactive(plugin_id: &str) -> Self {
        Self {
            plugin_id: plugin_id.to_string(),
            status: RUNNER_STATUS_INACTIVE.to_string(),
            base_url: None,
            token: None,
            last_error: None,
        }
    }
}

struct PluginRunnerProcess {
    child: Child,
}

struct PluginRunnerEntry {
    process: Option<PluginRunnerProcess>,
    state: PluginRunnerRuntimeState,
}

#[derive(Default)]
pub struct PluginRunnerManager {
    runners: HashMap<String, PluginRunnerEntry>,
}

impl PluginRunnerManager {
    fn refresh_runner(&mut self, plugin_id: &str) {
        let mut exit_message = None;
        if let Some(entry) = self.runners.get_mut(plugin_id) {
            if let Some(process) = entry.process.as_mut() {
                match process.child.try_wait() {
                    Ok(Some(status)) => {
                        exit_message = Some(match status.code() {
                            Some(code) => format!("Plugin runner exited with code {}.", code),
                            None => "Plugin runner exited unexpectedly.".to_string(),
                        });
                    }
                    Ok(None) => {}
                    Err(error) => {
                        exit_message = Some(format!("Failed to poll plugin runner: {}", error));
                    }
                }
            }
        }

        if let Some(message) = exit_message {
            if let Some(entry) = self.runners.get_mut(plugin_id) {
                entry.process = None;
                entry.state.status = RUNNER_STATUS_FAILED.to_string();
                entry.state.base_url = None;
                entry.state.token = None;
                entry.state.last_error = Some(message);
            }
        }
    }

    fn snapshot(&mut self, plugin_id: &str) -> PluginRunnerRuntimeState {
        self.refresh_runner(plugin_id);
        self.runners
            .get(plugin_id)
            .map(|entry| entry.state.clone())
            .unwrap_or_else(|| PluginRunnerRuntimeState::inactive(plugin_id))
    }

    fn set_state(
        &mut self,
        plugin_id: &str,
        status: &str,
        base_url: Option<String>,
        token: Option<String>,
        last_error: Option<String>,
    ) -> PluginRunnerRuntimeState {
        let entry = self
            .runners
            .entry(plugin_id.to_string())
            .or_insert_with(|| PluginRunnerEntry {
                process: None,
                state: PluginRunnerRuntimeState::inactive(plugin_id),
            });
        entry.state = PluginRunnerRuntimeState {
            plugin_id: plugin_id.to_string(),
            status: status.to_string(),
            base_url,
            token,
            last_error,
        };
        entry.state.clone()
    }

    fn stop_runner(&mut self, plugin_id: &str) -> Result<PluginRunnerRuntimeState, String> {
        self.set_state(plugin_id, RUNNER_STATUS_STOPPING, None, None, None);
        if let Some(entry) = self.runners.get_mut(plugin_id) {
            if let Some(mut process) = entry.process.take() {
                process
                    .child
                    .kill()
                    .map_err(|error| format!("Failed to stop plugin runner: {}", error))?;
                let _ = process.child.wait();
            }
        }
        Ok(self.set_state(plugin_id, RUNNER_STATUS_INACTIVE, None, None, None))
    }
}

enum PluginRunnerExecutable {
    Binary(PathBuf),
    NodeScript { node: String, script: PathBuf },
}

fn plugin_root(app_data_dir: &Path, plugin_id: &str) -> PathBuf {
    app_data_dir.join(PLUGIN_STORAGE_ROOT).join(plugin_id)
}

fn plugin_entry_path(plugin_root: &Path, entry_point: &str) -> PathBuf {
    plugin_root.join(entry_point.replace('\\', "/"))
}

fn base_url(port: u16) -> String {
    format!("http://127.0.0.1:{}", port)
}

fn generate_runner_token(plugin_id: &str, port: u16) -> String {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("runner-{}-{}-{}", plugin_id, port, stamp)
}

fn allocate_loopback_port() -> Result<u16, String> {
    let listener =
        TcpListener::bind("127.0.0.1:0").map_err(|error| format!("Failed to bind runner port: {}", error))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Failed to read runner port: {}", error))?
        .port();
    drop(listener);
    Ok(port)
}

fn validate_request(request: &PluginRunnerStartRequest) -> Result<(), String> {
    if request.plugin_id.trim().is_empty() {
        return Err("Plugin runner requires a plugin id.".to_string());
    }
    if request.entry_point.trim().is_empty() {
        return Err("Plugin runner requires a server entry point.".to_string());
    }
    Ok(())
}

fn resolve_packaged_runner_path() -> Option<PathBuf> {
    let current = std::env::current_exe().ok()?;
    let dir = current.parent()?;
    let filename = if cfg!(windows) {
        "mlt-plugin-runner.exe"
    } else {
        "mlt-plugin-runner"
    };
    let direct = dir.join(filename);
    if direct.exists() {
        return Some(direct);
    }
    let binaries_dir = dir.join("binaries").join(filename);
    if binaries_dir.exists() {
        return Some(binaries_dir);
    }
    None
}

fn resolve_dev_runner_binary() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let filename = format!(
        "mlt-plugin-runner-{}{}",
        env!("MLT_TAURI_TARGET"),
        executable_suffix()
    );
    let candidate = manifest_dir.join("binaries").join(filename);
    candidate.exists().then_some(candidate)
}

fn resolve_dev_runner_entry() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_root = manifest_dir.join("..").join("..").join("..");
    let candidate = workspace_root
        .join("packages")
        .join("plugin-runner")
        .join("dist")
        .join("main.js");
    candidate.exists().then_some(candidate)
}

fn resolve_runner_executable() -> Result<PluginRunnerExecutable, String> {
    if let Some(binary) = resolve_packaged_runner_path().or_else(resolve_dev_runner_binary) {
        return Ok(PluginRunnerExecutable::Binary(binary));
    }
    if let Some(script) = resolve_dev_runner_entry() {
        return Ok(PluginRunnerExecutable::NodeScript {
            node: std::env::var("NODE").unwrap_or_else(|_| "node".to_string()),
            script,
        });
    }
    Err(
        "Plugin runner binary not found and packages/plugin-runner/dist/main.js is missing."
            .to_string(),
    )
}

fn executable_suffix() -> &'static str {
    if cfg!(windows) {
        ".exe"
    } else {
        ""
    }
}

async fn wait_for_runner_health(base_url: &str, token: &str, child: &mut Child) -> Result<(), String> {
    let client = reqwest::Client::new();
    let health_url = format!("{}/health", base_url);
    for _ in 0..20 {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(match status.code() {
                    Some(code) => {
                        format!("Plugin runner exited before health check with code {}.", code)
                    }
                    None => "Plugin runner exited before health check.".to_string(),
                });
            }
            Ok(None) => {}
            Err(error) => return Err(format!("Failed to poll plugin runner: {}", error)),
        }

        match client
            .get(&health_url)
            .header("x-mlt-plugin-token", token)
            .send()
            .await
        {
            Ok(response) if response.status().is_success() => return Ok(()),
            Ok(_) | Err(_) => std::thread::sleep(Duration::from_millis(250)),
        }
    }
    Err("Plugin runner health check timed out.".to_string())
}

async fn spawn_plugin_runner(
    app: &AppHandle,
    request: &PluginRunnerStartRequest,
) -> Result<(PluginRunnerProcess, PluginRunnerRuntimeState), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data dir: {}", error))?;
    let plugin_root = plugin_root(&app_data_dir, &request.plugin_id);
    if !plugin_root.exists() {
        return Err(format!(
            "Plugin directory not found for '{}': {}",
            request.plugin_id,
            plugin_root.display()
        ));
    }

    let entry_path = plugin_entry_path(&plugin_root, &request.entry_point);
    if !entry_path.exists() {
        return Err(format!(
            "Plugin server entry not found for '{}': {}",
            request.plugin_id,
            entry_path.display()
        ));
    }

    let port = allocate_loopback_port()?;
    let token = generate_runner_token(&request.plugin_id, port);
    let base_url = base_url(port);
    let executable = resolve_runner_executable()?;
    let mut command = match executable {
        PluginRunnerExecutable::Binary(binary) => Command::new(binary),
        PluginRunnerExecutable::NodeScript { node, script } => {
            let mut command = Command::new(node);
            command.arg(script);
            command
        }
    };

    command
        .env("MLT_PLUGIN_ID", request.plugin_id.as_str())
        .env("MLT_PLUGIN_ROOT", plugin_root.as_os_str())
        .env("MLT_PLUGIN_ENTRY", request.entry_point.as_str())
        .env("MLT_PLUGIN_PORT", port.to_string())
        .env("MLT_PLUGIN_TOKEN", token.as_str())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start plugin runner: {}", error))?;
    if let Err(error) = wait_for_runner_health(&base_url, &token, &mut child).await {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    Ok((
        PluginRunnerProcess { child },
        PluginRunnerRuntimeState {
            plugin_id: request.plugin_id.clone(),
            status: RUNNER_STATUS_RUNNING.to_string(),
            base_url: Some(base_url),
            token: Some(token),
            last_error: None,
        },
    ))
}

#[tauri::command]
pub fn plugin_runner_get_runtime_state(
    manager: State<'_, Mutex<PluginRunnerManager>>,
    plugin_id: String,
) -> Result<PluginRunnerRuntimeState, String> {
    let mut manager = manager
        .lock()
        .map_err(|_| "Failed to lock plugin runner manager.".to_string())?;
    Ok(manager.snapshot(&plugin_id))
}

#[tauri::command]
pub async fn plugin_runner_start(
    app: AppHandle,
    manager: State<'_, Mutex<PluginRunnerManager>>,
    request: PluginRunnerStartRequest,
) -> Result<PluginRunnerRuntimeState, String> {
    validate_request(&request)?;
    {
        let mut manager = manager
            .lock()
            .map_err(|_| "Failed to lock plugin runner manager.".to_string())?;
        let current = manager.snapshot(&request.plugin_id);
        if current.status == RUNNER_STATUS_RUNNING {
            return Ok(current);
        }
        manager.set_state(
            &request.plugin_id,
            RUNNER_STATUS_STARTING,
            None,
            None,
            None,
        );
    }

    match spawn_plugin_runner(&app, &request).await {
        Ok((process, runtime_state)) => {
            let mut manager = manager
                .lock()
                .map_err(|_| "Failed to lock plugin runner manager.".to_string())?;
            let entry = manager
                .runners
                .entry(request.plugin_id.clone())
                .or_insert_with(|| PluginRunnerEntry {
                    process: None,
                    state: PluginRunnerRuntimeState::inactive(&request.plugin_id),
                });
            entry.process = Some(process);
            entry.state = runtime_state.clone();
            Ok(runtime_state)
        }
        Err(error) => {
            let mut manager = manager
                .lock()
                .map_err(|_| "Failed to lock plugin runner manager.".to_string())?;
            manager.set_state(
                &request.plugin_id,
                RUNNER_STATUS_FAILED,
                None,
                None,
                Some(error.clone()),
            );
            Err(error)
        }
    }
}

#[tauri::command]
pub fn plugin_runner_stop(
    manager: State<'_, Mutex<PluginRunnerManager>>,
    plugin_id: String,
) -> Result<PluginRunnerRuntimeState, String> {
    let mut manager = manager
        .lock()
        .map_err(|_| "Failed to lock plugin runner manager.".to_string())?;
    manager.refresh_runner(&plugin_id);
    manager.stop_runner(&plugin_id)
}

#[cfg(test)]
mod tests {
    use super::{
        plugin_entry_path, plugin_root, validate_request, PluginRunnerRuntimeState,
        PluginRunnerStartRequest, RUNNER_STATUS_INACTIVE,
    };
    use std::path::PathBuf;

    #[test]
    fn plugin_storage_paths_match_tauri_plugin_fs_layout() {
        let app_data = PathBuf::from("/tmp/mlt-app");
        let root = plugin_root(&app_data, "demo");
        assert_eq!(root, PathBuf::from("/tmp/mlt-app/my-little-todo/plugins/demo"));
        assert_eq!(
            plugin_entry_path(&root, "server/index.js"),
            PathBuf::from("/tmp/mlt-app/my-little-todo/plugins/demo/server/index.js")
        );
    }

    #[test]
    fn start_request_requires_plugin_id_and_entry() {
        assert!(validate_request(&PluginRunnerStartRequest {
            plugin_id: "".into(),
            entry_point: "server.js".into(),
        })
        .is_err());
        assert!(validate_request(&PluginRunnerStartRequest {
            plugin_id: "demo".into(),
            entry_point: "".into(),
        })
        .is_err());
    }

    #[test]
    fn inactive_runtime_state_is_stable() {
        let state = PluginRunnerRuntimeState::inactive("demo");
        assert_eq!(state.plugin_id, "demo");
        assert_eq!(state.status, RUNNER_STATUS_INACTIVE);
        assert!(state.base_url.is_none());
        assert!(state.token.is_none());
    }
}
