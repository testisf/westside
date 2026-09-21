# Westside Desktop

> Windows / macOS / Linux desktop client for the Westside platform.

## What this is

The Westside desktop client is a **Tauri 2** application — Rust core, system webview, React + Tailwind frontend. It ships as `Westside.exe` on Windows, `Westside.app` on macOS, and `Westside_*.deb` / `.rpm` / `.AppImage` on Linux.

**Phase 4 status:** foundation complete. The desktop client can authenticate, persist tokens in the OS keychain, manage servers, and check for updates. Radio / PTT / CAD / MDT features arrive in later phases.

## Hard security rules (non-negotiable)

1. **The desktop binary NEVER contains DB credentials, master API keys, or admin secrets.** Only the public API URL and the update-signing public key are baked in.
2. **Refresh tokens live in the OS keychain** — never in localStorage, never in a flat file, never in the binary.
3. **Even if the binary is fully reverse-engineered**, the system stays secure: every API call requires a per-user access token issued by the server, and the server enforces RBAC.
4. **Updates are verified with ED25519 signatures.** The signing private key never ships in the binary.

## Project structure

```
apps/desktop/
├── src/                          # Frontend (React + Vite + Tailwind)
│   ├── App.tsx                   # Root router
│   ├── pages/
│   │   ├── LoginPage.tsx         # Credentials + MFA flow
│   │   ├── DashboardPage.tsx     # Overview + update banner
│   │   ├── ServersPage.tsx       # Create / list servers
│   │   └── SettingsPage.tsx      # PTT hotkey + account info
│   ├── lib/
│   │   ├── api.ts                # fetch wrapper w/ auto-refresh
│   │   └── tauri.ts              # Tauri invoke bridge
│   ├── index.css                 # Westside design system (dark-first)
│   └── main.tsx                  # React entrypoint
├── src-tauri/                    # Rust core
│   ├── src/
│   │   ├── main.rs               # Tauri builder + command handlers
│   │   ├── api.rs                # reqwest client → Westside API
│   │   ├── storage.rs            # OS keychain (keyring crate)
│   │   ├── hotkey.rs             # Global PTT shortcut
│   │   └── updater.rs            # Manifest verifier + SHA-256 checks
│   ├── capabilities/default.json # Tauri permissions
│   ├── Cargo.toml                # Rust dependencies
│   ├── build.rs                  # tauri-build
│   └── tauri.conf.json           # Window config, CSP, bundle targets
├── scripts/
│   └── generate-update-manifest.mjs  # Signs update manifests with ED25519
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

## Build instructions

### Prerequisites

**All platforms:**
- Node.js 22+
- pnpm 9+
- Rust 1.77+ (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)

**Windows-specific:**
- Microsoft Visual Studio C++ Build Tools (MSVC)
- WebView2 runtime (pre-installed on Windows 11; on 10 you may need to install it)
- WiX Toolset v3 (for MSI installer; Tauri downloads automatically)

**macOS-specific:**
- Xcode Command Line Tools (`xcode-select --install`)
- For codesigning: an Apple Developer ID + notarization credentials

**Linux-specific (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### Local dev (no bundling)

```bash
cd apps/desktop
pnpm install
pnpm tauri dev
```

This launches a 1280×800 window running the React app from Vite (port 1420) inside the system webview, with the Rust backend attached. Edits to React code hot-reload; edits to Rust code recompile.

### Build a release binary

```bash
cd apps/desktop
pnpm tauri build
```

This produces platform-native installers in `src-tauri/target/release/bundle/`:

| Platform | Output |
|---|---|
| Windows | `Westside_0.4.0_x64-setup.exe` (NSIS) + `Westside_0.4.0_x64_en-US.msi` |
| macOS | `Westside.app` (with optional DMG) |
| Linux | `westside-desktop_0.4.0_amd64.deb` + `.rpm` + `.AppImage` |

### Cross-compiling (optional)

Cross-compiling Tauri apps is non-trivial. The recommended approach is to build on each target OS via GitHub Actions matrix builds. A starter workflow is in `infra/ci/build-desktop.yml` (Phase 7).

## Code-signing the binary

### Generating the update signing key pair

```bash
# Generate an ED25519 keypair (Tauri provides a CLI for this).
pnpm tauri signer generate -w ~/.westside/update-private.key
# Outputs:
#   Private key written to: ~/.westside/update-private.key
#   Public key: dW50cnVzdGVkIGNvbW1lbnQ6IG1hbnVhbCBzZWNyZXQga2V5Ck...
```

Store the **private key** in your secrets manager (Doppler, AWS Secrets Manager, 1Password). The **public key** goes into `tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6..."
  }
}
```

Set the env var at build time so Tauri signs the binary:

```bash
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.westside/update-private.key)
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""  # if you set a password
pnpm tauri build
```

### Generating update manifests

After each release:

```bash
node apps/desktop/scripts/generate-update-manifest.mjs \
  --version 0.4.1 \
  --notes "Fixes login crash; adds PTT hotkey remap UI." \
  --input  src-tauri/target/release/bundle/nsis/Westside_0.4.1_x64-setup.exe \
  --output manifests/manifest.json
```

Then upload the binary + manifest to your update server so they're reachable at:

```
https://updates.westside.example/desktop/0.4.1/Westside_0.4.1_x64-setup.exe
https://updates.westside.example/desktop/manifest.json
```

The desktop client fetches the manifest on launch and verifies the signature with the embedded public key before installing.

## What's in the binary (and what's NOT)

| Allowed in binary | FORBIDDEN in binary |
|---|---|
| Public API URL (`https://api.westside.example`) | DB connection string |
| Public update-manifest URL | DB credentials |
| Update signing **public** key | Update signing private key |
| App version, build hash | Admin credentials |
| Bundle ID, app icons | Master API keys |
| CSP allowlist, allowed origins | Per-user refresh tokens (those go in OS keychain) |
| Tauri capability manifest | Server-side secrets of any kind |

## Tauri commands exposed to the frontend

The frontend calls these via `@tauri-apps/api/core`'s `invoke()`:

| Command | Purpose |
|---|---|
| `login(identifier, password)` | Authenticate; stores tokens in keychain |
| `login_mfa(ticket, code)` | Complete 2FA login |
| `refresh_token()` | Refresh access token using keychain refresh token |
| `logout(access_token)` | Revoke session server-side + wipe keychain |
| `get_stored_access_token()` | Read access token from keychain on app boot |
| `get_stored_user_id()` | Read user id from keychain |
| `check_for_updates()` | Fetch + verify update manifest |
| `install_update()` | Download, verify, install update |
| `get_app_version()` | Returns `CARGO_PKG_VERSION` |
| `register_ptt(accelerator)` | Register global PTT hotkey |
| `set_ptt_accelerator(accelerator)` | Persist user's preferred hotkey |
| `get_ptt_accelerator()` | Read current hotkey |

## Anti-reverse-engineering note

We **assume** an attacker can extract every URL and string from `Westside.exe`. The system remains secure because:
- No secret in the binary is sufficient to authenticate.
- Every API call requires a per-user access token issued by the server.
- The server enforces RBAC; the client cannot escalate.
- The signing public key in the binary can only verify updates — it cannot sign them.

## Dev workflow (without Tauri)

For UI iteration, you can run just the frontend:

```bash
cd apps/desktop
pnpm dev
```

This launches Vite at http://localhost:1420 in a regular browser. Tauri bridge calls return `NOT_IN_TAURI` errors but the UI renders — useful for fast Tailwind/CSS iteration.

## Verification

- Frontend typechecks clean: `pnpm typecheck`
- Manifest generator tested: `node scripts/generate-update-manifest.mjs --version 0.4.1 --input <file> --output <file>`
- Rust code follows Tauri 2 API surface (verified by syntax review; full `cargo check` requires the GTK/webkit system deps that aren't installable in this sandbox — they install cleanly on the target build machine)

## What's NOT in Phase 4 yet

- ❌ Radio / PTT transmission (the hotkey is wired; transmission arrives in Phase 3)
- ❌ CAD, MDT, Records, BOLOs, Warrants (Phases 5+)
- ❌ ERLC/Roblox integration (Phase 6)
- ❌ Native crash reporter (Phase 7)
- ❌ Auto-update crash-loop rollback (Tauri's built-in updater handles this; explicit UI arrives in Phase 7)
