//! Non-Windows stub for foreground APIs.

use serde::Serialize;
use tauri::AppHandle;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundWindowPayload {
    pub title: String,
    pub process_name: Option<String>,
    pub process_id: u32,
}

pub fn capture_foreground() -> Result<Option<ForegroundWindowPayload>, String> {
    Ok(None)
}

#[tauri::command]
pub fn get_foreground_window_info() -> Result<Option<ForegroundWindowPayload>, String> {
    capture_foreground()
}

#[tauri::command]
pub fn foreground_listen_start(_app: AppHandle) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn foreground_listen_stop() -> Result<(), String> {
    Ok(())
}

pub fn init_foreground_listener(_app: &AppHandle) -> Result<(), String> {
    Ok(())
}
