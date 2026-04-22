use std::{ffi::OsString, path::PathBuf};
use tauri::Manager;

mod desktop_shell;
mod embedded_host;
mod native_http;
mod plugin_runner;

#[cfg(not(windows))]
mod foreground_stub;
#[cfg(windows)]
mod foreground_win;

#[cfg(not(windows))]
use foreground_stub as foreground;
#[cfg(windows)]
use foreground_win as foreground;

const APP_DATA_DIR_FLAG: &str = "--mlt-app-data-dir";
const E2E_SKIP_ONBOARDING_FLAG: &str = "--mlt-e2e-skip-onboarding";

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeRuntimeFlags {
    skip_onboarding: bool,
}

#[derive(Debug, Clone, Default)]
struct NativeBootstrapOptions {
    app_data_dir: Option<PathBuf>,
    runtime_flags: NativeRuntimeFlags,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bootstrap_options = parse_native_bootstrap_options(std::env::args_os());
    configure_process_environment(&bootstrap_options)
        .expect("failed to configure native process environment");
    let runtime_flags = bootstrap_options.runtime_flags.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            foreground::get_foreground_window_info,
            foreground::foreground_listen_start,
            foreground::foreground_listen_stop,
            desktop_shell::show_annotator_window,
            native_diagnostic_log,
            native_runtime_flags,
            embedded_host::embedded_host_get_runtime_state,
            embedded_host::embedded_host_start,
            embedded_host::embedded_host_stop,
            embedded_host::embedded_host_restart,
            plugin_runner::plugin_runner_get_runtime_state,
            plugin_runner::plugin_runner_start,
            plugin_runner::plugin_runner_stop,
            native_http::native_http_request,
        ])
        .setup(move |app| {
            foreground::init_foreground_listener(app.handle())?;
            desktop_shell::register_annotator_shortcut(app.handle())?;
            let _ = desktop_shell::setup_tray(app.handle());
            app.manage(runtime_flags.clone());
            app.manage(std::sync::Mutex::new(
                embedded_host::EmbeddedHostManager::default(),
            ));
            app.manage(std::sync::Mutex::new(
                plugin_runner::PluginRunnerManager::default(),
            ));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn native_diagnostic_log(level: String, message: String) {
    match level.as_str() {
        "error" => eprintln!("[frontend:error] {message}"),
        "warn" => eprintln!("[frontend:warn] {message}"),
        _ => println!("[frontend:info] {message}"),
    }
}

#[tauri::command]
fn native_runtime_flags(flags: tauri::State<'_, NativeRuntimeFlags>) -> NativeRuntimeFlags {
    flags.inner().clone()
}

fn parse_native_bootstrap_options(
    args: impl IntoIterator<Item = OsString>,
) -> NativeBootstrapOptions {
    let args = args.into_iter().collect::<Vec<_>>();
    NativeBootstrapOptions {
        app_data_dir: parse_path_flag(&args, APP_DATA_DIR_FLAG),
        runtime_flags: NativeRuntimeFlags {
            skip_onboarding: has_flag(&args, E2E_SKIP_ONBOARDING_FLAG),
        },
    }
}

fn has_flag(args: &[OsString], flag: &str) -> bool {
    args.iter().any(|arg| arg == flag)
}

fn parse_path_flag(args: &[OsString], flag: &str) -> Option<PathBuf> {
    let prefix = format!("{flag}=");
    for (index, arg) in args.iter().enumerate() {
        if let Some(value) = arg.to_str().and_then(|text| text.strip_prefix(&prefix)) {
            if !value.is_empty() {
                return Some(PathBuf::from(value));
            }
        }
        if arg == flag {
            let value = args.get(index + 1)?;
            if !value.is_empty() {
                return Some(PathBuf::from(value));
            }
        }
    }
    None
}

fn configure_process_environment(options: &NativeBootstrapOptions) -> Result<(), String> {
    let Some(app_data_dir) = options.app_data_dir.as_deref() else {
        return Ok(());
    };

    std::fs::create_dir_all(app_data_dir).map_err(|error| {
        format!(
            "failed to create overridden app data dir '{}': {}",
            app_data_dir.display(),
            error
        )
    })?;

    #[cfg(windows)]
    {
        std::env::set_var("APPDATA", app_data_dir);
        std::env::set_var("LOCALAPPDATA", app_data_dir);
    }

    #[cfg(target_os = "linux")]
    {
        std::env::set_var("XDG_DATA_HOME", app_data_dir);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{parse_native_bootstrap_options, APP_DATA_DIR_FLAG, E2E_SKIP_ONBOARDING_FLAG};
    use std::{ffi::OsString, path::PathBuf};

    #[test]
    fn parses_native_bootstrap_flags() {
        let options = parse_native_bootstrap_options([
            OsString::from("my-little-todo"),
            OsString::from(E2E_SKIP_ONBOARDING_FLAG),
            OsString::from(format!("{APP_DATA_DIR_FLAG}=C:/tmp/mlt-e2e")),
        ]);

        assert!(options.runtime_flags.skip_onboarding);
        assert_eq!(options.app_data_dir, Some(PathBuf::from("C:/tmp/mlt-e2e")));
    }

    #[test]
    fn parses_separate_app_data_dir_argument() {
        let options = parse_native_bootstrap_options([
            OsString::from("my-little-todo"),
            OsString::from(APP_DATA_DIR_FLAG),
            OsString::from("./tmp/e2e-data"),
        ]);

        assert_eq!(options.app_data_dir, Some(PathBuf::from("./tmp/e2e-data")));
        assert!(!options.runtime_flags.skip_onboarding);
    }
}
