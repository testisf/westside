//! Westside — global PTT (push-to-talk) hotkey.
//!
//! Registers a system-wide global hotkey so the user can transmit even when
//! Westside is minimized or out of focus.
//!
//!   - Windows: RegisterHotKey via Win32 API
//!   - macOS: CGEventTap (requires Accessibility permission)
//!   - Linux: X11 grab
//!
//! When the hotkey fires, this module emits a Tauri event the frontend can
//! listen for: `ptt-pressed` and `ptt-released`.
//!
//! NOTE: Phase 4 only wires the hotkey infrastructure. The actual radio
//! transmission logic arrives in Phase 3 (which we'll implement after the
//! desktop client).

use parking_lot::Mutex;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

static APP_HANDLE: OnceLock<Mutex<Option<AppHandle>>> = OnceLock::new();

pub fn init(app: AppHandle) {
    let _ = APP_HANDLE.set(Mutex::new(Some(app)));
}

/// Default PTT hotkey: Ctrl+Shift+Space. The user can remap this in Settings.
pub const DEFAULT_PTT_SHORTCUT_STR: &str = "Control+Shift+Space";

pub fn register_default_ptt(app: &AppHandle) -> Result<(), String> {
    register_ptt(app, DEFAULT_PTT_SHORTCUT_STR)
}

pub fn register_ptt(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|e: tauri_plugin_global_shortcut::Error| format!("invalid shortcut: {e}"))?;

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
        .map_err(|e: tauri_plugin_global_shortcut::Error| format!("invalid shortcut: {e}"))?;
    app.global_shortcut()
        .unregister(shortcut)
        .map_err(|e| format!("failed to unregister shortcut: {e}"))?;
    Ok(())
}
