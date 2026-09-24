/**
 * Westside desktop — API client.
 *
 * Unlike the web app (which uses cookies), the desktop client uses
 * `Authorization: Bearer <access>` header for every request. The refresh
 * token lives in the OS keychain, accessed via the Tauri bridge.
 */

import { tauriRefresh } from "./tauri";

export const API_BASE_URL =
  (window as any).__TAURI_INTERNALS__ !== undefined
    ? (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000")
    : "http://localhost:4000";

let inMemoryAccessToken: string | null = null;

export function setAccessToken(token: string | null) {
  inMemoryAccessToken = token;
  if (token) {
    sessionStorage.setItem("westside:access", token);
  } else {
    sessionStorage.removeItem("westside:access");
  }
}

export function getAccessToken(): string | null {
  if (inMemoryAccessToken) return inMemoryAccessToken;
  const stored = sessionStorage.getItem("westside:access");
  inMemoryAccessToken = stored;
  return stored;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError["error"];
}

/** Fetch wrapper that auto-refreshes on 401. */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res = await fetch(url, { ...init, headers, credentials: "omit" });
  if (res.status === 401) {
    // Try to refresh the access token via the Rust bridge (which reads
    // the refresh token from the OS keychain).
    try {
      const newToken = await tauriRefresh();
      setAccessToken(newToken);
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await fetch(url, { ...init, headers, credentials: "omit" });
    } catch (e) {
      // Refresh failed — caller will see the 401.
    }
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: { code: "PARSE_ERROR", message: text } };
    }
  }

  if (!res.ok) {
    return {
      error: (body as ApiError | null)?.error ?? {
        code: "HTTP_ERROR",
        message: `HTTP ${res.status}`,
      },
    };
  }
  return { data: (body as { data?: T })?.data ?? (body as T) };
}
