//! System tray, global shortcut, and annotator webview window (desktop shell).

use tauri::WebviewWindowBuilder;
use tauri::{
    menu::{Menu, MenuEvent, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Runtime, WebviewUrl,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::foreground;

const ANNOTATOR_LABEL: &str = "mlt-annotator";

/// Opens or focuses the annotator panel and emits the current foreground window payload.
pub fn open_annotator_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let payload = foreground::capture_foreground()
        .unwrap_or(None)
        .unwrap_or_else(|| foreground::ForegroundWindowPayload {
            title: String::new(),
            process_name: None,
            process_id: 0,
        });

    if let Some(w) = app.get_webview_window(ANNOTATOR_LABEL) {
        let visible = w.is_visible().unwrap_or(false);
        if visible {
            let _ = w.hide();
            return Ok(());
        }
        let _ = w.emit("annotator-target", &payload);
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }

    let url = WebviewUrl::App("index.html?mlt=annotator".into());
    let builder = WebviewWindowBuilder::new(app, ANNOTATOR_LABEL, url)
        .title("Annotate window")
        .inner_size(400.0, 560.0)
        .min_inner_size(280.0, 36.0)
        .decorations(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .resizable(true)
        .visible(true);
    #[cfg(not(target_os = "macos"))]
    let builder = builder.transparent(true);
    let w = builder
        .build()
        .map_err(|e| e.to_string())?;

    let _ = w.emit("annotator-target", &payload);
    let _ = w.set_focus();
    Ok(())
}

fn tray_open_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn tray_emit_widget<R: Runtime>(app: &AppHandle<R>) {
    let _ = app.emit("tray-open-widget", ());
}

#[tauri::command]
pub fn show_annotator_window(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = open_annotator_window(&handle);
    })
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let icon = app
        .default_window_icon()
        .ok_or("missing default window icon")?
        .clone();

    let annotate = MenuItem::with_id(app, "tray-annotate", "Annotate window", true, None::<&str>)?;
    let widget = MenuItem::with_id(
        app,
        "tray-widget",
        "Open desktop widget",
        true,
        None::<&str>,
    )?;
    let main = MenuItem::with_id(app, "tray-main", "Open main window", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray-quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&annotate, &widget, &main, &quit])?;

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("My Little Todo")
        .menu(&menu)
        .on_menu_event(|app, event: MenuEvent| match event.id.as_ref() {
            "tray-annotate" => {
                let h = app.clone();
                let _ = app.run_on_main_thread(move || {
                    let _ = open_annotator_window(&h);
                });
            }
            "tray-widget" => tray_emit_widget(app),
            "tray-main" => tray_open_main(app),
            "tray-quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

pub fn register_annotator_shortcut<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.on_shortcut("ctrl+shift+space", |app, _shortcut, event| {
        if event.state != ShortcutState::Pressed {
            return;
        }
        let h = app.clone();
        let _ = app.run_on_main_thread(move || {
            let _ = open_annotator_window(&h);
        });
    })
    .map_err(|e| e.to_string())?;
    Ok(())
}
