mod desktop_shell;
mod native_http;

#[cfg(windows)]
mod foreground_win;
#[cfg(not(windows))]
mod foreground_stub;

#[cfg(windows)]
use foreground_win as foreground;
#[cfg(not(windows))]
use foreground_stub as foreground;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            foreground::get_foreground_window_info,
            foreground::foreground_listen_start,
            foreground::foreground_listen_stop,
            desktop_shell::show_annotator_window,
            native_http::native_http_request,
        ])
        .setup(|app| {
            foreground::init_foreground_listener(app.handle())?;
            desktop_shell::register_annotator_shortcut(app.handle())?;
            let _ = desktop_shell::setup_tray(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
