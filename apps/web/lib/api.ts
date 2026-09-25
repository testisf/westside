/**
 * Westside web — API client.
 *
 * How auth works in the browser:
 *   - Login and refresh return a short-lived access token in the JSON body.
 *     It is kept in memory only (never localStorage) and sent as a Bearer header.
 *   - The long-lived refresh token is an HttpOnly cookie the page cannot read.
 *   - When the access token is missing, close to expiry, or rejected, we call
 *     /auth/refresh once and retry. Refresh tokens rotate, so two refreshes must
 *     never run at the same time or the API treats it as token reuse and revokes
 *     the session. Refreshes are therefore single-flight (and, where the browser
 *     supports Web Locks, serialised across tabs too).
 *
 * The API wraps every success in `{ data }`. `apiFetch` unwraps it, so callers
 * get `res.data` as the payload itself.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: {
    issues?: { path: (string | number)[]; message: string }[];
    ticket?: string;
    retryAfter?: number;
    [key: string]: unknown;
  };
  requestId?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiErrorBody;
}

/* ---------- access token (memory only) ---------- */

let accessToken: string | null = null;
let accessTokenExpiresAt = 0; // epoch ms

/** Refresh a little early so requests don't race the 60s token expiry. */
const EXPIRY_SKEW_MS = 5_000;

export function setAccessToken(token: string | null, expiresAt?: string | null) {
  accessToken = token;
  accessTokenExpiresAt = token && expiresAt ? Date.parse(expiresAt) : 0;
}

function tokenIsFresh(): boolean {
  return !!accessToken && Date.now() < accessTokenExpiresAt - EXPIRY_SKEW_MS;
}

/* ---------- unauthorized notifications ---------- */

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

/** Called when the session can no longer be recovered (refresh was rejected). */
export function onUnauthorized(cb: Listener): () => void {
  unauthorizedListeners.add(cb);
  return () => {
    unauthorizedListeners.delete(cb);
  };
}

function notifyUnauthorized() {
  unauthorizedListeners.forEach((cb) => cb());
}

/* ---------- low-level request ---------- */

interface RawResponse<T> extends ApiResponse<T> {
  status: number;
}

const NETWORK_ERROR: ApiErrorBody = {
  code: "NETWORK_ERROR",
  message: "Can't reach the Westside API. Check your connection and try again.",
};

async function request<T>(
  path: string,
  init: RequestInit,
  token: string | null,
): Promise<RawResponse<T>> {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  // Tells the API this is a browser client, so the refresh token is delivered
  // as an HttpOnly cookie instead of in the response body.
  headers.set("X-Requested-With", "XMLHttpRequest");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, credentials: "include", cache: "no-store" });
  } catch {
    return { status: 0, error: NETWORK_ERROR };
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const err = (body as { error?: ApiErrorBody } | null)?.error;
    return {
      status: res.status,
      error: err ?? { code: "HTTP_ERROR", message: `Request failed (${res.status}).` },
    };
  }
  return { status: res.status, data: (body as { data?: T } | null)?.data };
}

function strip<T>({ status: _status, ...rest }: RawResponse<T>): ApiResponse<T> {
  return rest;
}

/* ---------- refresh (single-flight) ---------- */

export type RefreshResult = "ok" | "denied" | "unreachable";

interface AuthPayload {
  accessToken: string;
  accessTokenExpiresAt: string;
}

let refreshInFlight: Promise<RefreshResult> | null = null;

async function doRefresh(): Promise<RefreshResult> {
  const res = await request<AuthPayload>("/api/v1/auth/refresh", { method: "POST" }, null);
  if (res.data?.accessToken) {
    setAccessToken(res.data.accessToken, res.data.accessTokenExpiresAt);
    return "ok";
  }
  if (res.error?.code === "NETWORK_ERROR" || res.status >= 500) return "unreachable";
  setAccessToken(null);
  return "denied";
}

export function refreshSession(): Promise<RefreshResult> {
  if (!refreshInFlight) {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    const run = locks ? locks.request("westside-refresh", doRefresh) : doRefresh();
    refreshInFlight = Promise.resolve(run).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/* ---------- public fetch ---------- */

/**
 * Call the API. Pass `{ auth: false }` for endpoints that don't need a session
 * (login, register).
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: boolean } = {},
): Promise<ApiResponse<T>> {
  const auth = opts.auth ?? true;

  if (!auth) return strip(await request<T>(path, init, null));

  if (!tokenIsFresh()) {
    const r = await refreshSession();
    if (r === "unreachable") return { error: NETWORK_ERROR };
    if (r === "denied") {
      notifyUnauthorized();
      return {
        error: { code: "AUTH_TOKEN_INVALID", message: "Your session has ended. Sign in again." },
      };
    }
  }

  let res = await request<T>(path, init, accessToken);

  // The server can still reject a token we thought was fresh (revoked session,
  // clock drift). Try one refresh, then give up.
  if (res.status === 401 && res.error?.code.startsWith("AUTH_TOKEN")) {
    const r = await refreshSession();
    if (r === "ok") res = await request<T>(path, init, accessToken);
    else if (r === "denied") notifyUnauthorized();
  }

  return strip(res);
}

/* ---------- error helpers ---------- */

/** Maps validation issues to `{ fieldName: message }` (first message per field wins). */
export function fieldErrors(error?: ApiErrorBody): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error?.details?.issues ?? []) {
    const key = String(issue.path[0] ?? "");
    if (key && !(key in out)) out[key] = issue.message;
  }
  return out;
}

/** A message safe to show in a banner; includes validation details when the API sent them. */
export function errorMessage(error?: ApiErrorBody): string {
  if (!error) return "Something went wrong. Try again.";
  if (error.code === "RATE_LIMITED" && error.details?.retryAfter) {
    const s = Number(error.details.retryAfter);
    return `Too many attempts. Try again in ${s >= 90 ? `${Math.ceil(s / 60)} minutes` : `${s} seconds`}.`;
  }
  const issues = error.details?.issues;
  if (error.code === "VALIDATION_FAILED" && issues?.length) {
    return issues.map((i) => i.message).join(" ");
  }
  return error.message;
}
