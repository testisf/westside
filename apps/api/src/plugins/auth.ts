/**
 * Westside — auth plugin.
 *
 *   - Loads an access token from `Authorization: Bearer <jwt>` OR from the
 *     `ws_token` cookie (used by WS connections and web refresh flow).
 *   - Verifies signature + expiry.
 *   - Loads the user + active session + permissions from Postgres.
 *   - Injects `req.auth = { user, sessionId, permissions, roles }`.
 *
 * If no token is present, `req.auth` is null. Routes that require auth use
 * the `requireAuth` decorator; routes requiring a permission use
 * `requirePermission(perm)`.
 *
 * IMPORTANT: The `perms` claim in the JWT is for client UX only. The
 * permissions used for authorization are loaded fresh from the database
 * on every request. If the user's roles are revoked, the very next request
 * sees the change.
 */

import fp from "fastify-plugin";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config/index.ts";
import { db } from "@westside/database/client";
import {
  permissions,
  rolePermissions,
  roles,
  sessions,
  users,
  userRoles,
} from "@westside/database";
import type { AuthContext, AuthUser, Permission } from "@westside/shared";
import { verifyAccessToken } from "../lib/token.ts";
import { ApiError } from "../lib/error.ts";

declare module "fastify" {
  interface FastifyInstance {
    requireAuth(): (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission(...perms: Permission[]): (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

async function loadAuthContext(cfg: AppConfig, token: string): Promise<AuthContext | null> {
  let claims;
  try {
    claims = await verifyAccessToken(cfg, token);
  } catch {
    return null;
  }

  // Verify session is still active.
  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.sessionId, claims.sid),
        isNull(sessions.revokedAt),
      ),
    )
    .limit(1);
  if (!session) return null;
  if (session.expiresAt < new Date()) return null;

  // Verify user is still valid.
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.userId, claims.sub))
    .limit(1);
  if (!user) return null;
  if (user.status !== "active") return null;
  if (user.deletedAt) return null;

  // Load fresh permission set from DB.
  const perms = await loadUserPermissions(user.userId);

  const authUser: AuthUser = {
    id: user.userId,
    email: user.email,
    username: user.username,
    emailVerified: !!user.emailVerifiedAt,
    status: user.status,
    mfaEnabled: !!user.mfaSecretEncrypted,
    robloxUsername: user.robloxUsername,
  };

  // Load role names for client UX (informational only).
  const roleRows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.roleId))
    .where(
      and(
        eq(userRoles.userId, user.userId),
        isNull(userRoles.revokedAt),
      ),
    );
  const roleNames = roleRows.map((r) => r.name as AuthContext["roles"][number]);

  return {
    user: authUser,
    sessionId: session.sessionId,
    permissions: new Set(perms),
    roles: roleNames,
  };
}

export async function loadUserPermissions(userId: string): Promise<Permission[]> {
  const rows = await db
    .select({ name: permissions.name })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.permissionId))
    .where(
      and(
        eq(userRoles.userId, userId),
        isNull(userRoles.revokedAt),
      ),
    );
  const set = new Set<Permission>();
  for (const r of rows) {
    set.add(r.name as Permission);
  }
  return [...set];
}

export default fp(
  async function authPlugin(app, opts: { config: AppConfig }) {
    const cfg = opts.config;

    app.addHook("onRequest", async (req) => {
      // Don't authenticate health endpoints.
      if (req.url.startsWith("/health") || req.url.startsWith("/ready")) {
        req.auth = null;
        return;
      }

      const authHeader = req.headers.authorization;
      let token: string | null = null;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        token = authHeader.slice(7).trim();
      }
      if (!token) {
        req.auth = null;
        return;
      }

      req.auth = await loadAuthContext(cfg, token);
    });

    app.decorate("requireAuth", function () {
      return async (req: FastifyRequest, _reply: FastifyReply) => {
        if (!req.auth) {
          throw new ApiError("AUTH_TOKEN_INVALID", {
            internalMessage: "No authenticated context on protected route.",
          });
        }
        if (!req.auth.user.emailVerified) {
          throw new ApiError("AUTH_UNVERIFIED_EMAIL");
        }
      };
    });

    app.decorate(
      "requirePermission",
      function (...requiredPerms: Permission[]) {
        return async (req: FastifyRequest, _reply: FastifyReply) => {
          if (!req.auth) {
            throw new ApiError("AUTH_TOKEN_INVALID");
          }
          if (!req.auth.user.emailVerified) {
            throw new ApiError("AUTH_UNVERIFIED_EMAIL");
          }
          for (const p of requiredPerms) {
            if (!req.auth.permissions.has(p)) {
              throw new ApiError("RBAC_FORBIDDEN", {
                details: { required: requiredPerms },
                internalMessage: `Missing permission: ${p}`,
              });
            }
          }
        };
      },
    );
  },
  { name: "auth" },
);

// Make type-only export work.
export type { FastifyInstance };
