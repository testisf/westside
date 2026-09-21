//! Westside — Rust-side API client.
//!
//! The frontend (webview) handles most HTTP via `fetch`, but a few flows
//! belong in Rust:
//!   - Initial login → we need to put the refresh token in the OS keychain
//!     BEFORE the frontend renders, so the frontend can read it via Tauri
//!     command on app start.
//!   - Auto-update checks.
//!   - Crash reporting (Phase 7).
//!
//! All requests use rustls (no OpenSSL dependency). The API base URL is
//! configured via the `WESTSIDE_API_URL` env var at build time, defaulting
//! to the dev URL.

use serde::{Deserialize, Serialize};
use thiserror::Error;

const DEFAULT_API_URL: &str = "http://localhost:4000";

pub fn api_base_url() -> String {
    option_env!("WESTSIDE_API_URL")
        .unwrap_or(DEFAULT_API_URL)
        .to_string()
}

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("server returned {status}: {body}")]
    Server { status: u16, body: String },
    #[error("invalid response: {0}")]
    InvalidResponse(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginRequest {
    pub identifier: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResponse {
    pub data: LoginData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginData {
    pub user: UserData,
    pub access_token: String,
    pub access_token_expires_at: String,
    pub refresh_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserData {
    pub id: String,
    pub email: String,
    pub username: String,
    pub email_verified: bool,
    pub status: String,
    pub mfa_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiErrorBody {
    pub error: ApiErrorDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiErrorDetails {
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub details: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MfaRequiredResponse {
    pub error: ApiErrorDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MfaLoginRequest {
    pub ticket: String,
    pub code: String,
}

/// Attempt login. On success returns the access + refresh tokens (desktop
/// path: refresh token is in the JSON body).
///
/// On MFA-required, returns `ApiError::Server` with status 401 and
/// `error.code = AUTH_MFA_REQUIRED` plus `error.details.ticket`.
pub async fn login(
    client: &reqwest::Client,
    identifier: &str,
    password: &str,
) -> Result<LoginData, ApiError> {
    let url = format!("{}/api/v1/auth/login", api_base_url());
    let body = LoginRequest {
        identifier: identifier.to_string(),
        password: password.to_string(),
    };
    let res = client.post(&url).json(&body).send().await?;
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        return Err(ApiError::Server { status: status.as_u16(), body: text });
    }
    let parsed: LoginResponse = serde_json::from_str(&text)
        .map_err(|e| ApiError::InvalidResponse(e.to_string()))?;
    Ok(parsed.data)
}

pub async fn login_mfa(
    client: &reqwest::Client,
    ticket: &str,
    code: &str,
) -> Result<LoginData, ApiError> {
    let url = format!("{}/api/v1/auth/login/mfa", api_base_url());
    let body = MfaLoginRequest {
        ticket: ticket.to_string(),
        code: code.to_string(),
    };
    let res = client.post(&url).json(&body).send().await?;
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        return Err(ApiError::Server { status: status.as_u16(), body: text });
    }
    let parsed: LoginResponse = serde_json::from_str(&text)
        .map_err(|e| ApiError::InvalidResponse(e.to_string()))?;
    Ok(parsed.data)
}

/// Refresh the access token using the stored refresh token.
pub async fn refresh(
    client: &reqwest::Client,
    refresh_token: &str,
) -> Result<LoginData, ApiError> {
    let url = format!("{}/api/v1/auth/refresh", api_base_url());
    let body = serde_json::json!({ "refreshToken": refresh_token });
    let res = client.post(&url).json(&body).send().await?;
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        return Err(ApiError::Server { status: status.as_u16(), body: text });
    }
    let parsed: LoginResponse = serde_json::from_str(&text)
        .map_err(|e| ApiError::InvalidResponse(e.to_string()))?;
    Ok(parsed.data)
}

/// Logout — revoke the current refresh token server-side.
pub async fn logout(
    client: &reqwest::Client,
    access_token: &str,
    refresh_token: &str,
) -> Result<(), ApiError> {
    let url = format!("{}/api/v1/auth/logout", api_base_url());
    let body = serde_json::json!({ "refreshToken": refresh_token });
    let _ = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&body)
        .send()
        .await?;
    Ok(())
}

/// Extract the MFA ticket from a `AUTH_MFA_REQUIRED` error response, if any.
pub fn extract_mfa_ticket(server_body: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(server_body).ok()?;
    let code = parsed.get("error")?.get("code")?.as_str()?;
    if code != "AUTH_MFA_REQUIRED" {
        return None;
    }
    let ticket = parsed
        .get("error")?
        .get("details")?
        .get("ticket")?
        .as_str()?;
    Some(ticket.to_string())
}
