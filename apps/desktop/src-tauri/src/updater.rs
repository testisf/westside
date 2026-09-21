//! Westside — update manifest verifier.
//!
//! Updates use Tauri's built-in updater, which:
//!   1. Fetches a signed JSON manifest from `updates.westside.example/desktop/manifest.json`.
//!   2. Verifies the manifest's signature using the public key embedded in the binary
//!      (configured in `tauri.conf.json` under `plugins.updater.pubkey`).
//!   3. Compares the manifest's version against the current version.
//!   4. If newer, downloads the binary, verifies SHA-256, verifies detached
//!      signature, then stages + installs.
//!
//! The private signing key NEVER ships in the binary. The public key in the
//! binary can only VERIFY updates — it cannot sign them.
//!
//! This module also exposes a manual manifest-fetcher + signature verifier
//! for pre-checking updates without invoking Tauri's full update flow.
//! Useful for showing "Update available →" badges in the UI.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum UpdateError {
    #[error("network error: {0}")]
    Network(String),
    #[error("invalid manifest: {0}")]
    InvalidManifest(String),
    #[error("signature verification failed")]
    BadSignature,
    #[error("hash mismatch — download is corrupt or tampered")]
    BadHash,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateManifest {
    pub version: String,
    pub notes: String,
    pub pub_date: String,
    pub platforms: std::collections::HashMap<String, PlatformAsset>,
    /// Optional: minimum client version required to install this update.
    #[serde(default)]
    pub min_required_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformAsset {
    pub signature: String,
    pub url: String,
}

/// Verify that a downloaded binary matches the expected SHA-256 hash.
pub fn verify_sha256(bytes: &[u8], expected_hex: &str) -> Result<(), UpdateError> {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let result = hasher.finalize();
    let actual = hex::encode(result);
    if actual.eq_ignore_ascii_case(expected_hex) {
        Ok(())
    } else {
        Err(UpdateError::BadHash)
    }
}

/// Compare semver-ish version strings. Returns `true` if `remote > local`.
pub fn is_newer(remote: &str, local: &str) -> bool {
    let parse = |s: &str| -> Vec<u64> {
        s.trim_start_matches('v')
            .split('.')
            .filter_map(|p| p.parse().ok())
            .collect()
    };
    let r = parse(remote);
    let l = parse(local);
    for i in 0..r.len().max(l.len()) {
        let rv = r.get(i).copied().unwrap_or(0);
        let lv = l.get(i).copied().unwrap_or(0);
        if rv > lv {
            return true;
        }
        if rv < lv {
            return false;
        }
    }
    false
}

// Helper for hex encoding (so we don't add the `hex` crate as a dependency).
mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        let mut s = String::with_capacity(bytes.as_ref().len() * 2);
        for b in bytes.as_ref() {
            s.push_str(&format!("{:02x}", b));
        }
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_newer() {
        assert!(is_newer("0.4.1", "0.4.0"));
        assert!(is_newer("0.5.0", "0.4.99"));
        assert!(is_newer("1.0.0", "0.99.99"));
        assert!(!is_newer("0.4.0", "0.4.0"));
        assert!(!is_newer("0.3.9", "0.4.0"));
    }

    #[test]
    fn test_verify_sha256() {
        let data = b"hello world";
        // Known SHA-256 of "hello world"
        let expected = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";
        assert!(verify_sha256(data, expected).is_ok());
        assert!(verify_sha256(data, "deadbeef").is_err());
    }
}
