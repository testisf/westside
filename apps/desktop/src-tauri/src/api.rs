//! Westside — Rust-side API client.

use serde::{Deserialize, Serialize};
use thiserror::Error;

const DEFAULT_API_URL: &str = "http://localhost:4000";

pub fn api_base_url() -> String {
    if let Ok(url) = std::env::var("WESTSIDE_API_URL") {
        if !url.is_empty() {
            return url;
        }
    }
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
#[serde(rename_all = "camelCase")]
pub struct LoginData {
    pub user: UserData,
    pub access_token: String,
    pub access_token_expires_at: String,
    pub refresh_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserData {
    pub id: String,
    /// Null for Roblox-only accounts, which have no email on file.
    pub email: Option<String>,
    pub username: String,
    pub email_verified: bool,
    pub status: String,
    pub mfa_enabled: bool,
    #[serde(default)]
    pub roblox_username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrontendUser {
    pub id: String,
    pub email: Option<String>,
    pub username: String,
    pub email_verified: bool,
    pub status: String,
    pub mfa_enabled: bool,
    pub roblox_username: Option<String>,
}

impl From<UserData> for FrontendUser {
    fn from(u: UserData) -> Self {
        FrontendUser {
            id: u.id,
            email: u.email,
            username: u.username,
            email_verified: u.email_verified,
            status: u.status,
            mfa_enabled: u.mfa_enabled,
            roblox_username: u.roblox_username,
        }
    }
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
pub struct RegisterRequest {
    pub email: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterResponse {
    pub data: RegisterData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterData {
    pub user_id: String,
    pub verification_url: Option<String>,
}

pub async fn register(
    client: &reqwest::Client,
    email: &str,
    username: &str,
    password: &str,
) -> Result<RegisterData, ApiError> {
    let url = format!("{}/api/v1/auth/register", api_base_url());
    let body = RegisterRequest {
        email: email.to_string(),
        username: username.to_string(),
        password: password.to_string(),
    };
    let res = client.post(&url).json(&body).send().await?;
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        return Err(ApiError::Server { status: status.as_u16(), body: text });
    }
    let parsed: RegisterResponse = serde_json::from_str(&text)
        .map_err(|e| ApiError::InvalidResponse(e.to_string()))?;
    Ok(parsed.data)
}

pub async fn verify_email(
    client: &reqwest::Client,
    token: &str,
) -> Result<(), ApiError> {
    let url = format!("{}/api/v1/auth/verify-email", api_base_url());
    let body = serde_json::json!({ "token": token });
    let res = client.post(&url).json(&body).send().await?;
    let status = res.status();
    let text = res.text().await?;
    if !status.is_success() {
        return Err(ApiError::Server { status: status.as_u16(), body: text });
    }
    Ok(())
}
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
    let body = serde_json::json!({ "ticket": ticket, "code": code });
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
