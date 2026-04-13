//! Foreground window tracking via `SetWinEventHook` (Windows only).

use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::core::PWSTR;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId, EVENT_SYSTEM_FOREGROUND,
    WINEVENT_OUTOFCONTEXT,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundWindowPayload {
    pub title: String,
    pub process_name: Option<String>,
    pub process_id: u32,
}

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
/// Store hook as raw bits so `Mutex` is `Sync` on stable Rust.
static HOOK_RAW: Mutex<Option<usize>> = Mutex::new(None);
/// Refcount for concurrent webviews (main + widget) subscribing to foreground events.
static LISTEN_REF: AtomicU32 = AtomicU32::new(0);

unsafe extern "system" fn winevent_callback(
    _h_win_event_hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    _id_object: i32,
    _id_child: i32,
    _id_event_thread: u32,
    _dwms_event_time: u32,
) {
    if event != EVENT_SYSTEM_FOREGROUND {
        return;
    }
    if LISTEN_REF.load(Ordering::SeqCst) == 0 {
        return;
    }
    let Some(app) = APP_HANDLE.get() else {
        return;
    };
    if let Some(inner) = capture_hwnd(hwnd) {
        let payload: ForegroundWindowPayload = inner.into();
        let _ = app.emit("foreground-changed", payload);
    }
}

fn capture_hwnd(hwnd: HWND) -> Option<ForgroundWindowPayloadInner> {
    if hwnd.is_invalid() {
        return None;
    }
    let mut title_buf = [0u16; 512];
    let len = unsafe { GetWindowTextW(hwnd, &mut title_buf) } as usize;
    let title = if len == 0 {
        String::new()
    } else {
        OsString::from_wide(&title_buf[..len])
            .to_string_lossy()
            .into_owned()
    };

    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    let process_name = process_name_for_pid(pid);

    Some(ForgroundWindowPayloadInner {
        title,
        process_name,
        process_id: pid,
    })
}

struct ForgroundWindowPayloadInner {
    title: String,
    process_name: Option<String>,
    process_id: u32,
}

impl From<ForgroundWindowPayloadInner> for ForegroundWindowPayload {
    fn from(v: ForgroundWindowPayloadInner) -> Self {
        Self {
            title: v.title,
            process_name: v.process_name,
            process_id: v.process_id,
        }
    }
}

fn process_name_for_pid(pid: u32) -> Option<String> {
    use windows::Win32::Foundation::CloseHandle;
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut size,
        )
        .is_ok();
        let _ = CloseHandle(handle);
        if !ok {
            return None;
        }
        let path = OsString::from_wide(&buf[..size as usize])
            .to_string_lossy()
            .into_owned();
        path
            .rsplit(['\\', '/'])
            .next()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
    }
}

/// Current foreground window snapshot (one-shot). Shared by commands and desktop shell.
pub fn capture_foreground() -> Result<Option<ForegroundWindowPayload>, String> {
    unsafe {
        let hwnd = GetForegroundWindow();
        Ok(capture_hwnd(hwnd).map(Into::into))
    }
}

/// Current foreground window snapshot (one-shot).
#[tauri::command]
pub fn get_foreground_window_info() -> Result<Option<ForegroundWindowPayload>, String> {
    capture_foreground()
}

pub fn init_foreground_listener(app: &AppHandle) -> Result<(), String> {
    let _ = APP_HANDLE.set(app.clone());
    Ok(())
}

/// Install global foreground hook (call once).
#[tauri::command]
pub fn foreground_listen_start(app: AppHandle) -> Result<(), String> {
    let _ = APP_HANDLE.set(app.clone());

    let prev = LISTEN_REF.fetch_add(1, Ordering::SeqCst);
    if prev > 0 {
        return Ok(());
    }

    let mut guard = HOOK_RAW.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(());
    }

    let hook = unsafe {
        SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            None,
            Some(winevent_callback),
            0,
            0,
            WINEVENT_OUTOFCONTEXT,
        )
    };
    if hook.is_invalid() {
        LISTEN_REF.fetch_sub(1, Ordering::SeqCst);
        return Err("SetWinEventHook failed".to_string());
    }
    *guard = Some(hook.0 as usize);
    Ok(())
}

#[tauri::command]
pub fn foreground_listen_stop() -> Result<(), String> {
    let prev = LISTEN_REF.fetch_sub(1, Ordering::SeqCst);
    if prev != 1 {
        return Ok(());
    }

    let mut guard = HOOK_RAW.lock().map_err(|e| e.to_string())?;
    if let Some(bits) = guard.take() {
        let h = HWINEVENTHOOK(bits as *mut _);
        unsafe {
            let _ = UnhookWinEvent(h);
        }
    }
    Ok(())
}
