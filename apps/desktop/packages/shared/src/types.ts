/**
 * Westside — shared types.
 * These types are intentionally wire-protocol types, not DB-row types.
 * DB-row types live alongside the Drizzle schema.
 */

import type { Permission } from "./permissions.js";
import type { RoleName } from "./roles.js";

/* ---------- API envelope ---------- */

export interface ApiOk<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiOk<T> | ApiError;

/* ---------- Auth ---------- */

export interface AuthUser {
  id: string;
  // Null for Roblox-only accounts, which have no email on file.
  email: string | null;
  username: string;
  emailVerified: boolean;
  status: UserStatus;
  mfaEnabled: boolean;
  // Present once a Roblox account is linked; null for password-only accounts.
  robloxUsername: string | null;
}

export type UserStatus = "active" | "disabled" | "locked" | "pending";

export interface AuthSession {
  id: string;
  ip: string | null;
  userAgent: string | null;
  issuedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  device: {
    id: string;
    name: string | null;
    platform: string | null;
  } | null;
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
  permissions: ReadonlySet<Permission>;
  roles: RoleName[];
}

/* ---------- JWT claims ---------- */

export interface AccessTokenClaims {
  sub: string;        // user id
  sid: string;        // session id
  jti: string;        // unique token id
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  /**
   * Permissions snapshot. The server RE-VALIDATES this against the database
   * on every request — this claim exists for client-side UX only, never
   * for server-side authorization.
   */
  perms: Permission[];
}
