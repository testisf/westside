//! Westside desktop client — Tauri main entrypoint.
//!
//! Architecture:
//!   - Frontend (webview): React + Vite + Tailwind, in `apps/desktop/src/`.
//!   - Rust core: handles auth persistence (keychain), global PTT hotkey,
//!     update verification, and the small set of privileged commands the
//!     frontend needs.
//!
//! The frontend talks to the API directly via `fetch` (CORS allows
//! the desktop bundle's origin). The Rust core handles only the few
//! operations that need OS-level access: keychain, hotkey, updater.

#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

mod api;
mod hotkey;
mod storage;
mod updater;

use api::{extract_mfa_ticket, ApiError, ApiErrorBody, LoginData};
use storage::{clear_credentials, load_credentials, save_credentials, StoredCredentials};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::UpdaterExt;

/// Shared state accessible to all Tauri commands.
#[derive(Default)]
pub struct AppState {
    pub api_client: reqwest::Client,
    pub ptt_accelerator: parking_lot::Mutex<String>,
}

impl AppState {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent(concat!("Westside/", env!("CARGO_PKG_VERSION")))
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .expect("failed to build reqwest client");
        Self {
            api_client: client,
            ptt_accelerator: parking_lot::Mutex::new(hotkey::DEFAULT_PTT_SHORTCUT_STR.to_string()),
        }
    }
}

#[derive(serde::Serialize)]
pub struct LoginResult {
    pub user: api::UserData,
    pub access_token: String,
    /// Whether MFA is required (true means the client must call login_mfa).
    pub mfa_required: bool,
    /// Only present if mfa_required is true.
    pub mfa_ticket: Option<String>,
}

#[tauri::command]
async fn login(
    state: State<'_, AppState>,
    identifier: String,
    password: String,
) -> Result<LoginResult, String> {
    let client = state.api_client.clone();
    match api::login(&client, &identifier, &password).await {
        Ok(data) => {
            // Persist tokens in OS keychain.
            let creds = StoredCredentials {
                access_token: Some(data.access_token.clone()),
                refresh_token: data.refresh_token.clone(),
                user_id: Some(data.user.id.clone()),
            };
            if let Err(e) = save_credentials(&creds) {
                log::warn!("failed to save credentials to keychain: {e}");
            }
            Ok(LoginResult {
                user: data.user,
                access_token: data.access_token,
                mfa_required: false,
                mfa_ticket: None,
            })
        }
        Err(ApiError::Server { status: 401, body }) => {
            // Could be invalid credentials OR MFA required.
            if let Some(ticket) = extract_mfa_ticket(&body) {
                return Ok(LoginResult {
                    user: api::UserData {
                        id: String::new(),
                        email: String::new(),
                        username: String::new(),
                        email_verified: false,
                        status: "pending".to_string(),
                        mfa_enabled: true,
                    },
                    access_token: String::new(),
                    mfa_required: true,
                    mfa_ticket: Some(ticket),
                });
            }
            // Real auth error — extract the server's error code.
            let code = serde_json::from_str::<ApiErrorBody>(&body)
                .map(|b| b.error.code)
                .unwrap_or_else(|_| "AUTH_INVALID_CREDENTIALS".to_string());
            Err(code)
        }
        Err(ApiError::Server { status, body }) => {
            log::error!("login server error {status}: {body}");
            Err("INTERNAL_ERROR".to_string())
        }
        Err(e) => {
            log::error!("login network error: {e}");
            Err("NETWORK_ERROR".to_string())
        }
    }
}

#[tauri::command]
async fn login_mfa(
    state: State<'_, AppState>,
    ticket: String,
    code: String,
) -> Result<LoginResult, String> {
    let client = state.api_client.clone();
    match api::login_mfa(&client, &ticket, &code).await {
        Ok(data) => {
            let creds = StoredCredentials {
                access_token: Some(data.access_token.clone()),
                refresh_token: data.refresh_token.clone(),
                user_id: Some(data.user.id.clone()),
            };
            if let Err(e) = save_credentials(&creds) {
                log::warn!("failed to save credentials to keychain: {e}");
            }
            Ok(LoginResult {
                user: data.user,
                access_token: data.access_token,
                mfa_required: false,
                mfa_ticket: None,
            })
        }
        Err(ApiError::Server { status: 401, .. }) => Err("AUTH_MFA_INVALID".to_string()),
        Err(ApiError::Server { status, body }) => {
            log::error!("mfa login server error {status}: {body}");
            Err("INTERNAL_ERROR".to_string())
        }
        Err(e) => {
            log::error!("mfa login network error: {e}");
            Err("NETWORK_ERROR".to_string())
        }
    }
}

#[tauri::command]
async fn refresh_token(state: State<'_, AppState>) -> Result<String, String> {
    // Load refresh token from keychain.
    let creds = load_credentials().map_err(|_| "NO_CREDENTIALS".to_string())?;
    let refresh = creds.refresh_token.ok_or("NO_REFRESH_TOKEN".to_string())?;
    let client = state.api_client.clone();
    match api::refresh(&client, &refresh).await {
        Ok(data) => {
            // Persist the new tokens.
            let new_creds = StoredCredentials {
                access_token: Some(data.access_token.clone()),
                refresh_token: data.refresh_token.clone(),
                user_id: Some(data.user.id.clone()),
            };
            if let Err(e) = save_credentials(&new_creds) {
                log::warn!("failed to update keychain: {e}");
            }
            Ok(data.access_token)
        }
        Err(ApiError::Server { status: 401, .. }) => {
            // Refresh reuse or expired → clear all credentials.
            let _ = clear_credentials();
            Err("AUTH_REFRESH_FAILED".to_string())
        }
        Err(e) => {
            log::warn!("refresh network error: {e}");
            Err("NETWORK_ERROR".to_string())
        }
    }
}

#[tauri::command]
async fn logout(state: State<'_, AppState>, access_token: String) -> Result<(), String> {
    let creds = load_credentials().ok();
    if let Some(c) = creds {
        if let Some(refresh) = c.refresh_token {
            let _ = api::logout(&state.api_client, &access_token, &refresh).await;
        }
    }
    let _ = clear_credentials();
    Ok(())
}

#[tauri::command]
fn get_stored_access_token() -> Result<Option<String>, String> {
    match load_credentials() {
        Ok(c) => Ok(c.access_token),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
fn get_stored_user_id() -> Result<Option<String>, String> {
    match load_credentials() {
        Ok(c) => Ok(c.user_id),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
async fn check_for_updates(app: AppHandle) -> Result<bool, String> {
    let updater = app
        .updater()
        .map_err(|e| format!("updater not configured: {e}"))?;
    match updater.check().await {
        Ok(Some(update)) => {
            log::info!("update available: {}", update.version);
            // Notify the frontend.
            let _ = app.emit(
                "update-available",
                serde_json::json!({
                    "version": update.version,
                    "date": update.date,
                    "body": update.body,
                }),
            );
            Ok(true)
        }
        Ok(None) => Ok(false),
        Err(e) => {
            log::warn!("update check failed: {e}");
            Err(format!("UPDATE_CHECK_FAILED: {e}"))
        }
    }
}

#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app
        .updater()
        .map_err(|e| format!("updater not configured: {e}"))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("update check failed: {e}"))?
        .ok_or("NO_UPDATE_AVAILABLE".to_string())?;
    update
        .download_and_install(|progress, total| {
            log::info!("downloading update: {} / {}", progress, total);
        }, || {
            log::info!("update downloaded; installing…");
        })
        .await
        .map_err(|e| format!("install failed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn register_ptt(app: AppHandle, accelerator: String) -> Result<(), String> {
    // Unregister any previous one.
    let _ = hotkey::unregister_ptt(&app, &accelerator);
    hotkey::register_ptt(&app, &accelerator)
}

#[tauri::command]
fn set_ptt_accelerator(state: State<'_, AppState>, accelerator: String) -> Result<(), String> {
    *state.ptt_accelerator.lock() = accelerator;
    Ok(())
}

#[tauri::command]
fn get_ptt_accelerator(state: State<'_, AppState>) -> String {
    state.ptt_accelerator.lock().clone()
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_secs()
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState::new())
        .setup(|app| {
            // Init PTT hotkey module with the app handle.
            hotkey::init(app.handle().clone());

            // Register the default PTT shortcut (best effort; the user can change it).
            if let Err(e) = hotkey::register_default_ptt(app.handle()) {
                log::warn!("failed to register default PTT shortcut: {e}");
            }

            log::info!("Westside desktop v{} started", env!("CARGO_PKG_VERSION"));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            login,
            login_mfa,
            refresh_token,
            logout,
            get_stored_access_token,
            get_stored_user_id,
            check_for_updates,
            install_update,
            get_app_version,
            register_ptt,
            set_ptt_accelerator,
            get_ptt_accelerator,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Westside desktop");
}
