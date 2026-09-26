/**
 * Westside — stable error codes.
 *
 * The API never returns stack traces or DB error messages to the client.
 * Every error maps to one of these codes so clients can branch on them
 * deterministically.
 *
 * Format: <DOMAIN>_<REASON> in UPPER_SNAKE_CASE.
 */

export const ErrorCode = {
  // Generic
  INTERNAL_ERROR: "INTERNAL_ERROR",
  NOT_FOUND: "NOT_FOUND",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
  BAD_REQUEST: "BAD_REQUEST",
  CONFLICT: "CONFLICT",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",

  // Auth
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_UNVERIFIED_EMAIL: "AUTH_UNVERIFIED_EMAIL",
  AUTH_ACCOUNT_LOCKED: "AUTH_ACCOUNT_LOCKED",
  AUTH_ACCOUNT_DISABLED: "AUTH_ACCOUNT_DISABLED",
  AUTH_TOKEN_INVALID: "AUTH_TOKEN_INVALID",
  AUTH_TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED",
  AUTH_TOKEN_REVOKED: "AUTH_TOKEN_REVOKED",
  AUTH_REFRESH_REUSE: "AUTH_REFRESH_REUSE",
  AUTH_MFA_REQUIRED: "AUTH_MFA_REQUIRED",
  AUTH_MFA_INVALID: "AUTH_MFA_INVALID",
  AUTH_EMAIL_TAKEN: "AUTH_EMAIL_TAKEN",
  AUTH_USERNAME_TAKEN: "AUTH_USERNAME_TAKEN",
  AUTH_PASSWORD_TOO_WEAK: "AUTH_PASSWORD_TOO_WEAK",
  AUTH_PASSWORD_LOGIN_DISABLED: "AUTH_PASSWORD_LOGIN_DISABLED",
  AUTH_ROBLOX_OAUTH_FAILED: "AUTH_ROBLOX_OAUTH_FAILED",
  AUTH_ROBLOX_STATE_INVALID: "AUTH_ROBLOX_STATE_INVALID",

  // RBAC
  RBAC_FORBIDDEN: "RBAC_FORBIDDEN",
  RBAC_PERMISSION_REQUIRED: "RBAC_PERMISSION_REQUIRED",

  // API keys
  APIKEY_INVALID: "APIKEY_INVALID",
  APIKEY_EXPIRED: "APIKEY_EXPIRED",
  APIKEY_REVOKED: "APIKEY_REVOKED",
  APIKEY_SCOPE_INSUFFICIENT: "APIKEY_SCOPE_INSUFFICIENT",

  // Integrations
  ERLC_NOT_SUPPORTED: "ERLC_NOT_SUPPORTED",
  ERLC_ADAPTER_ERROR: "ERLC_ADAPTER_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** HTTP status that pairs with each error code. */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  INTERNAL_ERROR: 500,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  SERVICE_UNAVAILABLE: 503,

  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_UNVERIFIED_EMAIL: 403,
  AUTH_ACCOUNT_LOCKED: 423,
  AUTH_ACCOUNT_DISABLED: 403,
  AUTH_TOKEN_INVALID: 401,
  AUTH_TOKEN_EXPIRED: 401,
  AUTH_TOKEN_REVOKED: 401,
  AUTH_REFRESH_REUSE: 401,
  AUTH_MFA_REQUIRED: 401,
  AUTH_MFA_INVALID: 401,
  AUTH_EMAIL_TAKEN: 409,
  AUTH_USERNAME_TAKEN: 409,
  AUTH_PASSWORD_TOO_WEAK: 422,
  AUTH_PASSWORD_LOGIN_DISABLED: 403,
  AUTH_ROBLOX_OAUTH_FAILED: 401,
  AUTH_ROBLOX_STATE_INVALID: 400,

  RBAC_FORBIDDEN: 403,
  RBAC_PERMISSION_REQUIRED: 403,

  APIKEY_INVALID: 401,
  APIKEY_EXPIRED: 401,
  APIKEY_REVOKED: 401,
  APIKEY_SCOPE_INSUFFICIENT: 403,

  ERLC_NOT_SUPPORTED: 501,
  ERLC_ADAPTER_ERROR: 502,
};

/** User-facing messages. Always generic — never leak implementation detail. */
export const ERROR_PUBLIC_MESSAGE: Record<ErrorCode, string> = {
  INTERNAL_ERROR: "An internal error occurred. Please try again.",
  NOT_FOUND: "The requested resource was not found.",
  METHOD_NOT_ALLOWED: "HTTP method not allowed for this endpoint.",
  VALIDATION_FAILED: "The request body or parameters failed validation.",
  RATE_LIMITED: "Too many requests. Please slow down.",
  BAD_REQUEST: "The request was malformed.",
  CONFLICT: "The request conflicts with the current state of the resource.",
  SERVICE_UNAVAILABLE: "The service is temporarily unavailable.",

  AUTH_INVALID_CREDENTIALS: "Invalid email, username, or password.",
  AUTH_UNVERIFIED_EMAIL: "Please verify your email before continuing.",
  AUTH_ACCOUNT_LOCKED: "Account temporarily locked. Try again later.",
  AUTH_ACCOUNT_DISABLED: "Account disabled. Contact your administrator.",
  AUTH_TOKEN_INVALID: "Authentication token is invalid.",
  AUTH_TOKEN_EXPIRED: "Authentication token has expired.",
  AUTH_TOKEN_REVOKED: "Authentication token has been revoked.",
  AUTH_REFRESH_REUSE: "Refresh token reuse detected. All sessions revoked.",
  AUTH_MFA_REQUIRED: "Multi-factor authentication is required.",
  AUTH_MFA_INVALID: "Invalid multi-factor code.",
  AUTH_EMAIL_TAKEN: "An account with this email already exists.",
  AUTH_USERNAME_TAKEN: "An account with this username already exists.",
  AUTH_PASSWORD_TOO_WEAK: "Password does not meet complexity requirements.",
  AUTH_PASSWORD_LOGIN_DISABLED: "Sign in with Roblox instead — password sign-in is turned off.",
  AUTH_ROBLOX_OAUTH_FAILED: "Roblox sign-in failed. Please try again.",
  AUTH_ROBLOX_STATE_INVALID: "This sign-in link expired or was already used. Please try again.",

  RBAC_FORBIDDEN: "You do not have permission to perform this action.",
  RBAC_PERMISSION_REQUIRED: "A specific permission is required for this action.",

  APIKEY_INVALID: "API key is invalid.",
  APIKEY_EXPIRED: "API key has expired.",
  APIKEY_REVOKED: "API key has been revoked.",
  APIKEY_SCOPE_INSUFFICIENT: "API key does not have sufficient scope.",

  ERLC_NOT_SUPPORTED: "This ERLC capability is not supported by the configured adapter.",
  ERLC_ADAPTER_ERROR: "The ERLC adapter returned an error.",
};
