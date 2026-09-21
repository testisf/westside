/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly TAURI_DEV_HOST?: string;
  readonly TAURI_ENV_PLATFORM?: string;
  readonly TAURI_ENV_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Augment window for Tauri internal API presence check.
interface Window {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: unknown;
}
