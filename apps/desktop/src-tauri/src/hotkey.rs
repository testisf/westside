//! Westside — global PTT (push-to-talk) hotkey.

use parking_lot::Mutex;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

static APP_HANDLE: OnceLock<Mutex<Option<AppHandle>>> = OnceLock::new();

pub fn init(app: AppHandle) {
    let _ = APP_HANDLE.set(Mutex::new(Some(app)));
}

pub const DEFAULT_PTT_SHORTCUT_STR: &str = "Control+Shift+Space";

pub fn register_default_ptt(app: &AppHandle) -> Result<(), String> {
    register_ptt(app, DEFAULT_PTT_SHORTCUT_STR)
}

pub fn register_ptt(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|e| format!("invalid shortcut: {e}"))?;

    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            let target_app = APP_HANDLE.get().and_then(|m| m.lock().clone());
            let Some(target) = target_app else { return };
            let event_name = match event.state() {
                ShortcutState::Pressed => "ptt-pressed",
                ShortcutState::Released => "ptt-released",
            };
            let _ = target.emit(event_name, ());
        })
        .map_err(|e| format!("failed to register shortcut: {e}"))?;
    Ok(())
}

pub fn unregister_ptt(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|e| format!("invalid shortcut: {e}"))?;
    app.global_shortcut()
        .unregister(shortcut)
        .map_err(|e| format!("failed to unregister shortcut: {e}"))?;
    Ok(())
}
