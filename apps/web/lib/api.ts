/**
 * Westside web — API client helpers.
 *
 * Server-side (RSC / route handlers) talks to the API via the internal URL.
 * Client-side components talk to the same API via /api/* (proxied by Next.js).
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse<T>> {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  // X-Requested-With tells the API this is a browser-like client, so the
  // refresh token is delivered via HttpOnly cookie rather than JSON body.
  headers.set("X-Requested-With", "XMLHttpRequest");

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { error: { code: "PARSE_ERROR", message: text } }; }
  }

  if (!res.ok) {
    return { error: (body as ApiError | null)?.error ?? { code: "HTTP_ERROR", message: `HTTP ${res.status}` } };
  }
  return { data: body as T };
}
