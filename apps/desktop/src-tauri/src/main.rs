//! Westside desktop client — Tauri main entrypoint.

#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

mod api;
mod hotkey;
mod storage;
mod updater;

use api::{extract_mfa_ticket, ApiError, ApiErrorBody, FrontendUser};
use storage::{clear_credentials, load_credentials, save_credentials, StoredCredentials};
use tauri::{AppHandle, Emitter, State};
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
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .expect("failed to build reqwest client");
        Self {
            api_client: client,
            ptt_accelerator: parking_lot::Mutex::new(hotkey::DEFAULT_PTT_SHORTCUT_STR.to_string()),
        }
    }
}

/// The result returned to the frontend via Tauri IPC.
/// Uses `FrontendUser` (snake_case) to match the TypeScript interface in tauri.ts.
#[derive(serde::Serialize)]
pub struct LoginResult {
    pub user: FrontendUser,
    pub access_token: String,
    /// Whether MFA is required (true means the client must call login_mfa).
    pub mfa_required: bool,
    /// Only present if mfa_required is true.
    pub mfa_ticket: Option<String>,
}

/// Simple ping command for testing the IPC bridge.
/// Run in devtools console: await window.__TAURI__.core.invoke("ping")
/// Should return "pong".
#[tauri::command]
fn ping() -> String {
    log::info!("ping command invoked");
    "pong".to_string()
}

#[derive(serde::Serialize)]
pub struct RegisterResult {
    pub user_id: String,
    pub verification_url: Option<String>,
}

#[tauri::command]
async fn register(
    state: State<'_, AppState>,
    email: String,
    username: String,
    password: String,
) -> Result<RegisterResult, String> {
    log::info!("register command invoked: email={}", email);
    let client = state.api_client.clone();
    match api::register(&client, &email, &username, &password).await {
        Ok(data) => Ok(RegisterResult {
            user_id: data.user_id,
            verification_url: data.verification_url,
        }),
        Err(ApiError::Server { status, body }) => {
            log::error!("register server error {status}: {body}");
            let code = serde_json::from_str::<ApiErrorBody>(&body)
                .map(|b| b.error.code)
                .unwrap_or_else(|_| format!("SERVER_ERROR_{}", status));
            Err(code)
        }
        Err(e) => {
            log::error!("register network error: {e}");
            Err("NETWORK_ERROR".to_string())
        }
    }
}

#[tauri::command]
async fn verify_email(
    state: State<'_, AppState>,
    token: String,
) -> Result<(), String> {
    log::info!("verify_email command invoked");
    let client = state.api_client.clone();
    match api::verify_email(&client, &token).await {
        Ok(()) => Ok(()),
        Err(ApiError::Server { status, body }) => {
            log::error!("verify-email server error {status}: {body}");
            let code = serde_json::from_str::<ApiErrorBody>(&body)
                .map(|b| b.error.code)
                .unwrap_or_else(|_| format!("SERVER_ERROR_{}", status));
            Err(code)
        }
        Err(e) => {
            log::error!("verify-email network error: {e}");
            Err("NETWORK_ERROR".to_string())
        }
    }
}
#[tauri::command]
async fn login(
    state: State<'_, AppState>,
    identifier: String,
    password: String,
) -> Result<LoginResult, String> {
    log::info!("login command invoked: identifier={}", identifier);
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
                user: data.user.into(),
                access_token: data.access_token,
                mfa_required: false,
                mfa_ticket: None,
            })
        }
        Err(ApiError::Server { status: 401, body }) => {
            // Could be invalid credentials OR MFA required.
            if let Some(ticket) = extract_mfa_ticket(&body) {
                return Ok(LoginResult {
                    user: FrontendUser {
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
            // Surface the actual API error code instead of generic INTERNAL_ERROR
            let code = serde_json::from_str::<ApiErrorBody>(&body)
                .map(|b| b.error.code)
                .unwrap_or_else(|_| format!("SERVER_ERROR_{}", status));
            Err(code)
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
    log::info!("login_mfa command invoked");
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
                user: data.user.into(),
                access_token: data.access_token,
                mfa_required: false,
                mfa_ticket: None,
            })
        }
        Err(ApiError::Server { status: 401, .. }) => Err("AUTH_MFA_INVALID".to_string()),
        Err(ApiError::Server { status, body }) => {
            log::error!("mfa login server error {status}: {body}");
            let code = serde_json::from_str::<ApiErrorBody>(&body)
                .map(|b| b.error.code)
                .unwrap_or_else(|_| format!("SERVER_ERROR_{}", status));
            Err(code)
        }
        Err(e) => {
            log::error!("mfa login network error: {e}");
            Err("NETWORK_ERROR".to_string())
        }
    }
}

#[tauri::command]
async fn refresh_token(state: State<'_, AppState>) -> Result<String, String> {
    log::info!("refresh_token command invoked");
    let creds = load_credentials().map_err(|_| "NO_CREDENTIALS".to_string())?;
    let refresh = match creds.refresh_token {
        Some(r) => { log::info!("found refresh token in keychain"); r }
        None => { log::warn!("no refresh token in stored credentials"); return Err("NO_REFRESH_TOKEN".to_string()); }
    };
    let client = state.api_client.clone();
    match api::refresh(&client, &refresh).await {
        Ok(data) => {
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
    log::info!("logout command invoked");
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
            let total_str = total
                .map(|t| t.to_string())
                .unwrap_or_else(|| "?".to_string());
            log::info!("downloading update: {} / {}", progress, total_str);
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState::new())
        .setup(|app| {
            hotkey::init(app.handle().clone());
            if let Err(e) = hotkey::register_default_ptt(app.handle()) {
                log::warn!("failed to register default PTT shortcut: {e}");
            }
            log::info!("Westside desktop v{} started", env!("CARGO_PKG_VERSION"));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            register,
            verify_email,
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
