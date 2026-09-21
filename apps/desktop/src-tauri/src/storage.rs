//! Westside — secure storage via OS keychain.
//!
//! Tokens are stored in the OS-native credential store:
//!   - Windows: Credential Manager
//!   - macOS: Keychain
//!   - Linux: libsecret / gnome-keyring (falls back to KWallet)
//!
//! The desktop binary NEVER contains DB credentials, master API keys, or
//! admin secrets. Only per-user refresh tokens are stored, and only in the
//! keychain — never in a flat file, never in the binary, never in localStorage.

use keyring::Entry;
use serde::{Deserialize, Serialize};
use thiserror::Error;

const SERVICE_NAME: &str = "com.westside.desktop";
const REFRESH_TOKEN_KEY: &str = "refresh_token";
const ACCESS_TOKEN_KEY: &str = "access_token";
const USER_ID_KEY: &str = "user_id";

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

/// Save the refresh token (and current access token) to the OS keychain.
pub fn save_credentials(creds: &StoredCredentials) -> Result<(), StorageError> {
    if let Some(refresh) = &creds.refresh_token {
        Entry::new(SERVICE_NAME, REFRESH_TOKEN_KEY)?.set_password(refresh)?;
    }
    if let Some(access) = &creds.access_token {
        Entry::new(SERVICE_NAME, ACCESS_TOKEN_KEY)?.set_password(access)?;
    }
    if let Some(user_id) = &creds.user_id {
        Entry::new(SERVICE_NAME, USER_ID_KEY)?.set_password(user_id)?;
    }
    Ok(())
}

/// Load whatever credentials are present in the keychain.
pub fn load_credentials() -> Result<StoredCredentials, StorageError> {
    let refresh_token = Entry::new(SERVICE_NAME, REFRESH_TOKEN_KEY)
        .and_then(|e| e.get_password())
        .ok();

    let access_token = Entry::new(SERVICE_NAME, ACCESS_TOKEN_KEY)
        .and_then(|e| e.get_password())
        .ok();

    let user_id = Entry::new(SERVICE_NAME, USER_ID_KEY)
        .and_then(|e| e.get_password())
        .ok();

    if refresh_token.is_none() && access_token.is_none() && user_id.is_none() {
        return Err(StorageError::NotPresent);
    }

    Ok(StoredCredentials {
        access_token,
        refresh_token,
        user_id,
    })
}

/// Wipe all stored credentials. Used on logout and on auth failures.
pub fn clear_credentials() -> Result<(), StorageError> {
    for key in [REFRESH_TOKEN_KEY, ACCESS_TOKEN_KEY, USER_ID_KEY] {
        if let Ok(entry) = Entry::new(SERVICE_NAME, key) {
            let _ = entry.delete_credential();
        }
    }
    Ok(())
}
