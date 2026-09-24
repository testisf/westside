//! Westside — secure storage via OS keychain.

use keyring::Entry;
use serde::{Deserialize, Serialize};
use thiserror::Error;

const SERVICE_NAME: &str = "Westside";

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("keychain error: {0}")]
    Keychain(#[from] keyring::Error),
    #[error("no credential stored")]
    NotPresent,
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredCredentials {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub user_id: Option<String>,
}

pub fn save_credentials(creds: &StoredCredentials) -> Result<(), StorageError> {
    if let Some(refresh) = &creds.refresh_token {
        match Entry::new(SERVICE_NAME, "refresh_token")?.set_password(refresh) {
            Ok(_) => log::info!("refresh_token saved to keychain"),
            Err(e) => log::error!("FAILED to save refresh_token to keychain: {e}"),
        }
    }
    if let Some(access) = &creds.access_token {
        match Entry::new(SERVICE_NAME, "access_token")?.set_password(access) {
            Ok(_) => log::info!("access_token saved to keychain"),
            Err(e) => log::error!("FAILED to save access_token to keychain: {e}"),
        }
    }
    if let Some(user_id) = &creds.user_id {
        match Entry::new(SERVICE_NAME, "user_id")?.set_password(user_id) {
            Ok(_) => log::info!("user_id saved to keychain"),
            Err(e) => log::error!("FAILED to save user_id to keychain: {e}"),
        }
    }
    Ok(())
}

pub fn load_credentials() -> Result<StoredCredentials, StorageError> {
    let refresh_token = Entry::new(SERVICE_NAME, "refresh_token")
        .and_then(|e| e.get_password())
        .ok();

    let access_token = Entry::new(SERVICE_NAME, "access_token")
        .and_then(|e| e.get_password())
        .ok();

    let user_id = Entry::new(SERVICE_NAME, "user_id")
        .and_then(|e| e.get_password())
        .ok();

    if refresh_token.is_none() && access_token.is_none() && user_id.is_none() {
        log::warn!("no credentials found in keychain");
        return Err(StorageError::NotPresent);
    }

    log::info!("credentials loaded from keychain (refresh={}, access={}, user_id={})",
        refresh_token.is_some(), access_token.is_some(), user_id.is_some());

    Ok(StoredCredentials { access_token, refresh_token, user_id })
}

pub fn clear_credentials() -> Result<(), StorageError> {
    for key in ["refresh_token", "access_token", "user_id"] {
        if let Ok(entry) = Entry::new(SERVICE_NAME, key) {
            let _ = entry.delete_credential();
        }
    }
    log::info!("credentials cleared from keychain");
    Ok(())
}
