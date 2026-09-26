/**
 * Westside — authentication service.
 *
 * Pure-ish service module: takes already-parsed inputs, performs the
 * authorization logic, writes DB rows, returns tokens. HTTP-shaped concerns
 * (cookies, headers) are handled by the route module, not here.
 */

import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "@westside/database/client";
import {
  emailVerificationTokens,
  passwordResetTokens,
  refreshTokens,
  sessions,
  users,
  devices,
} from "@westside/database";
import type { AppConfig } from "../../config/index.ts";
import {
  generateFamilyId,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "../../lib/token.ts";
import { hashPassword, hashNeedsRehash, verifyPassword } from "../../lib/argon.ts";
import { ApiError } from "../../lib/error.ts";
import { loadUserPermissions } from "../../plugins/auth.ts";
import type { AuthUser, Permission } from "@westside/shared";
import { issueMfaTicket } from "../../modules/mfa/index.ts";

export interface AuthSessionResult {
  user: AuthUser;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string; // raw; client stores, server keeps hash
  refreshTokenId: string;
  sessionId: string;
}

interface ClientMeta {
  ip?: string | null;
  userAgent?: string | null;
  deviceFingerprint?: string | null;
  deviceName?: string | null;
  devicePlatform?: string | null;
}

const IP_MAX_LEN = 45;

async function upsertDevice(userId: string, meta: ClientMeta): Promise<string | null> {
  if (!meta.deviceFingerprint) return null;
  const fp = meta.deviceFingerprint;
  const [existing] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.userId, userId), eq(devices.fingerprint, fp)))
    .limit(1);

  if (existing && !existing.revokedAt) {
    await db
      .update(devices)
      .set({ lastSeenAt: new Date(), name: meta.deviceName ?? existing.name, platform: meta.devicePlatform ?? existing.platform })
      .where(eq(devices.deviceId, existing.deviceId));
    return existing.deviceId;
  }

  const [row] = await db
    .insert(devices)
    .values({
      userId,
      fingerprint: fp,
      name: meta.deviceName ?? null,
      platform: meta.devicePlatform ?? null,
    })
    .returning({ deviceId: devices.deviceId });
  return row?.deviceId ?? null;
}

export async function register(
  cfg: AppConfig,
  args: { email: string; username: string; password: string },
): Promise<{ userId: string; verificationToken: string }> {
  // Hash password.
  const passwordHash = await hashPassword(args.password, cfg);

  // Insert user. Unique constraints on email + username handle collisions.
  let userId: string;
  try {
    const [row] = await db
      .insert(users)
      .values({
        email: args.email,
        username: args.username,
        passwordHash,
        argon2Params: JSON.stringify({ type: "argon2id", m: cfg.argon2.memoryKiB, t: cfg.argon2.timeCost, p: cfg.argon2.parallelism }),
        status: "pending",
      })
      .returning({ userId: users.userId });
    if (!row) throw new ApiError("INTERNAL_ERROR", { internalMessage: "User insert returned no row" });
    userId = row.userId;
  } catch (err: any) {
    // Detect unique-constraint violation (Postgres SQLSTATE 23505).
    if (err?.code === "23505") {
      const msg = String(err?.message ?? "");
      if (msg.includes("users_email")) throw new ApiError("AUTH_EMAIL_TAKEN");
      if (msg.includes("users_username")) throw new ApiError("AUTH_USERNAME_TAKEN");
      throw new ApiError("AUTH_EMAIL_TAKEN");
    }
    throw err;
  }

  // Issue email verification token (raw returned to caller; hash stored).
  const raw = generateRefreshToken(); // 32 random bytes, base64url
  await db.insert(emailVerificationTokens).values({
    userId,
    hash: hashRefreshToken(raw.raw),
    expiresAt: new Date(Date.now() + cfg.emailVerificationTtlHours * 60 * 60 * 1000),
  });

  return { userId, verificationToken: raw.raw };
}

export async function verifyEmail(cfg: AppConfig, rawToken: string): Promise<void> {
  const hash = hashRefreshToken(rawToken);
  const [row] = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.hash, hash))
    .limit(1);

  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new ApiError("AUTH_TOKEN_INVALID", { internalMessage: "Email verification token not found / expired" });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.tokenId, row.tokenId));
    await tx
      .update(users)
      .set({ emailVerifiedAt: new Date(), status: "active" })
      .where(eq(users.userId, row.userId));
  });
}

export async function login(
  cfg: AppConfig,
  args: { identifier: string; password: string },
  meta: ClientMeta,
): Promise<AuthSessionResult> {
  const identifier = args.identifier.trim();

  // Find user by email OR username.
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, identifier), eq(users.username, identifier)))
    .limit(1);

  // Always run a hash comparison to avoid timing-oracle on user existence.
  // If no user, compare against a dummy hash with the same Argon2id parameters.
  const dummyHash =
    "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const hashToVerify = user?.passwordHash ?? dummyHash;
  const ok = await verifyPassword(hashToVerify, args.password);

  if (!ok || !user) {
    if (user) {
      await bumpFailedLogin(cfg, user.userId);
    }
    throw new ApiError("AUTH_INVALID_CREDENTIALS", {
      internalMessage: `Failed login for: ${identifier}`,
    });
  }

  assertAccountUsable(user);

  // Successful auth: clear failed-login state.
  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null })
      .where(eq(users.userId, user.userId));
  }

  // Rehash if params are weaker than current policy.
  if (user.passwordHash && hashNeedsRehash(user.passwordHash, cfg)) {
    const newHash = await hashPassword(args.password, cfg);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.userId, user.userId));
  }

  // 2FA gate: if user has TOTP configured, require a second step.
  if (user.mfaSecretEncrypted) {
    const ticket = issueMfaTicket(user.userId);
    throw new ApiError("AUTH_MFA_REQUIRED", { details: { ticket } });
  }

  return establishSession(cfg, user, meta);
}

/** Throws if the account can't be used regardless of how it authenticated. */
function assertAccountUsable(user: { status: string; lockedUntil: Date | null }): void {
  if (user.status === "disabled") {
    throw new ApiError("AUTH_ACCOUNT_DISABLED");
  }
  if (user.status === "locked" || (user.lockedUntil && user.lockedUntil > new Date())) {
    throw new ApiError("AUTH_ACCOUNT_LOCKED", {
      details: { until: user.lockedUntil?.toISOString() },
    });
  }
}

/**
 * Shared tail end of every login path (password, Roblox): records the
 * device and session, mints a refresh token family, and signs an access
 * token. Auth-method-specific checks (password verification, MFA) happen
 * before this is called.
 */
export async function establishSession(
  cfg: AppConfig,
  user: typeof users.$inferSelect,
  meta: ClientMeta,
): Promise<AuthSessionResult> {
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), lastLoginIp: meta.ip?.slice(0, IP_MAX_LEN) ?? null })
    .where(eq(users.userId, user.userId));

  const deviceId = await upsertDevice(user.userId, meta);
  const perms = await loadUserPermissions(user.userId);

  const sessionExpiresAt = new Date(Date.now() + cfg.jwt.refreshTokenTtlSeconds * 1000);
  const [sessionRow] = await db
    .insert(sessions)
    .values({
      userId: user.userId,
      deviceId,
      ip: meta.ip?.slice(0, IP_MAX_LEN) ?? null,
      userAgent: meta.userAgent?.slice(0, 1024) ?? null,
      expiresAt: sessionExpiresAt,
    })
    .returning({ sessionId: sessions.sessionId });

  const raw = generateRefreshToken();
  const familyId = generateFamilyId();
  const [refreshRow] = await db
    .insert(refreshTokens)
    .values({
      userId: user.userId,
      hash: raw.hash,
      familyId,
      deviceId,
      expiresAt: sessionExpiresAt,
    })
    .returning({ tokenId: refreshTokens.tokenId });

  await db
    .update(sessions)
    .set({ refreshTokenId: refreshRow.tokenId })
    .where(eq(sessions.sessionId, sessionRow.sessionId));

  const access = await signAccessToken(cfg, {
    userId: user.userId,
    sessionId: sessionRow.sessionId,
    permissions: perms,
  });

  return {
    user: {
      id: user.userId,
      email: user.email,
      username: user.username,
      emailVerified: !!user.emailVerifiedAt,
      status: user.status,
      mfaEnabled: !!user.mfaSecretEncrypted,
      robloxUsername: user.robloxUsername,
    },
    accessToken: access.jwt,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: raw.raw,
    refreshTokenId: refreshRow.tokenId,
    sessionId: sessionRow.sessionId,
  };
}

export async function refresh(
  cfg: AppConfig,
  rawRefreshToken: string,
  meta: ClientMeta,
): Promise<AuthSessionResult> {
  const hash = hashRefreshToken(rawRefreshToken);
  const [tokenRow] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.hash, hash))
    .limit(1);

  if (!tokenRow) {
    throw new ApiError("AUTH_TOKEN_INVALID", { internalMessage: "Refresh token not found" });
  }

  // Reuse detection: if token is revoked AND past expiry, this is normal use.
  // If token is revoked BUT within family lifetime → reuse attack → revoke whole family.
  if (tokenRow.revokedAt) {
    // We can't easily distinguish "already used and rotated" from "stolen".
    // Conservative approach: revoke entire family on any revoked-token presentation.
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.familyId, tokenRow.familyId),
          isNull(refreshTokens.revokedAt),
        ),
      );
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(sessions.userId, tokenRow.userId),
          isNull(sessions.revokedAt),
        ),
      );
    throw new ApiError("AUTH_REFRESH_REUSE", {
      internalMessage: `Refresh reuse detected; family ${tokenRow.familyId} revoked.`,
    });
  }

  if (tokenRow.expiresAt < new Date()) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenId, tokenRow.tokenId));
    throw new ApiError("AUTH_TOKEN_EXPIRED");
  }

  // Verify user is still active.
  const [user] = await db.select().from(users).where(eq(users.userId, tokenRow.userId)).limit(1);
  if (!user || user.status !== "active" || user.deletedAt) {
    throw new ApiError("AUTH_ACCOUNT_DISABLED");
  }

  // ROTATION: revoke old, issue new within same family.
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenId, tokenRow.tokenId));

  const perms = await loadUserPermissions(user.userId);

  const sessionExpiresAt = new Date(Date.now() + cfg.jwt.refreshTokenTtlSeconds * 1000);
  const [sessionRow] = await db
    .insert(sessions)
    .values({
      userId: user.userId,
      deviceId: tokenRow.deviceId,
      ip: meta.ip?.slice(0, IP_MAX_LEN) ?? null,
      userAgent: meta.userAgent?.slice(0, 1024) ?? null,
      expiresAt: sessionExpiresAt,
    })
    .returning({ sessionId: sessions.sessionId });

  const newRaw = generateRefreshToken();
  const [newRefreshRow] = await db
    .insert(refreshTokens)
    .values({
      userId: user.userId,
      hash: newRaw.hash,
      familyId: tokenRow.familyId, // same family
      deviceId: tokenRow.deviceId,
      expiresAt: sessionExpiresAt,
    })
    .returning({ tokenId: refreshTokens.tokenId });

  await db
    .update(sessions)
    .set({ refreshTokenId: newRefreshRow.tokenId })
    .where(eq(sessions.sessionId, sessionRow.sessionId));

  const access = await signAccessToken(cfg, {
    userId: user.userId,
    sessionId: sessionRow.sessionId,
    permissions: perms,
  });

  return {
    user: {
      id: user.userId,
      email: user.email,
      username: user.username,
      emailVerified: !!user.emailVerifiedAt,
      status: user.status,
      mfaEnabled: !!user.mfaSecretEncrypted,
      robloxUsername: user.robloxUsername,
    },
    accessToken: access.jwt,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: newRaw.raw,
    refreshTokenId: newRefreshRow.tokenId,
    sessionId: sessionRow.sessionId,
  };
}

export async function logout(cfg: AppConfig, refreshToken: string): Promise<void> {
  const hash = hashRefreshToken(refreshToken);
  const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.hash, hash)).limit(1);
  if (!row) return; // idempotent logout
  await db.transaction(async (tx) => {
    await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenId, row.tokenId));
    if (row.deviceId) {
      // Don't auto-revoke device on logout (user may re-login on same device).
    }
    // Revoke the session bound to this refresh token.
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.refreshTokenId, row.tokenId), isNull(sessions.revokedAt)));
  });
}

export async function logoutAll(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  });
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.sessionId, sessionId), eq(sessions.userId, userId)))
    .limit(1);
  if (!row) return;
  await db.transaction(async (tx) => {
    await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.sessionId, sessionId));
    if (row.refreshTokenId) {
      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenId, row.refreshTokenId));
    }
  });
}

export async function listSessions(userId: string) {
  const rows = await db
    .select({
      sessionId: sessions.sessionId,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
      issuedAt: sessions.issuedAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      deviceId: sessions.deviceId,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(sessions.issuedAt);

  return rows.map((r) => ({
    id: r.sessionId,
    ip: r.ip,
    userAgent: r.userAgent,
    issuedAt: r.issuedAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    revokedAt: r.revokedAt?.toISOString() ?? null,
    deviceId: r.deviceId,
  }));
}

/* ---------- Failed-login / lockout ---------- */

async function bumpFailedLogin(cfg: AppConfig, userId: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.userId, userId)).limit(1);
  if (!user) return;
  const newCount = user.failedLoginCount + 1;
  const updates: Partial<typeof users.$inferInsert> = { failedLoginCount: newCount };
  if (newCount >= cfg.accountLockout.threshold) {
    updates.lockedUntil = new Date(Date.now() + cfg.accountLockout.durationMinutes * 60 * 1000);
  }
  await db.update(users).set(updates).where(eq(users.userId, userId));
}

/* ---------- Password reset ---------- */

export async function requestPasswordReset(
  cfg: AppConfig,
  email: string,
): Promise<{ userId: string | null; token: string | null }> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return { userId: null, token: null };

  const raw = generateRefreshToken();
  await db.insert(passwordResetTokens).values({
    userId: user.userId,
    hash: hashRefreshToken(raw.raw),
    expiresAt: new Date(Date.now() + cfg.passwordResetTtlMinutes * 60 * 1000),
  });
  return { userId: user.userId, token: raw.raw };
}

export async function resetPassword(
  cfg: AppConfig,
  rawToken: string,
  newPassword: string,
): Promise<void> {
  const hash = hashRefreshToken(rawToken);
  const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.hash, hash)).limit(1);
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new ApiError("AUTH_TOKEN_INVALID", { internalMessage: "Password reset token not found / expired" });
  }
  const newHash = await hashPassword(newPassword, cfg);
  await db.transaction(async (tx) => {
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.tokenId, row.tokenId));
    await tx.update(users).set({ passwordHash: newHash }).where(eq(users.userId, row.userId));
    // Revoke all sessions for this user.
    await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)));
    await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, row.userId), isNull(refreshTokens.revokedAt)));
  });
}

export async function changePassword(
  cfg: AppConfig,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.userId, userId)).limit(1);
  if (!user) throw new ApiError("AUTH_TOKEN_INVALID");
  if (!user.passwordHash) {
    // Roblox-only account — there's no password to change.
    throw new ApiError("AUTH_PASSWORD_LOGIN_DISABLED");
  }
  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw new ApiError("AUTH_INVALID_CREDENTIALS");
  const newHash = await hashPassword(newPassword, cfg);
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.userId, userId));
}

/* ---------- MFA login completion ---------- */
/**
 * After login() throws AUTH_MFA_REQUIRED with a ticket, the client posts
 * `ticket + code` to /api/v1/auth/login/mfa. If valid, we issue tokens here.
 */
export async function loginWithMfa(
  cfg: AppConfig,
  ticket: string,
  code: string,
  meta: ClientMeta,
): Promise<AuthSessionResult> {
  const { consumeMfaTicket, verifyTotpCode } = await import("../../modules/mfa/index.ts");
  const userId = consumeMfaTicket(ticket);
  if (!userId) throw new ApiError("AUTH_TOKEN_INVALID", { internalMessage: "MFA ticket invalid" });

  const [user] = await db.select().from(users).where(eq(users.userId, userId)).limit(1);
  if (!user || user.status !== "active" || user.deletedAt) {
    throw new ApiError("AUTH_ACCOUNT_DISABLED");
  }
  if (!user.mfaSecretEncrypted) {
    throw new ApiError("AUTH_TOKEN_INVALID", { internalMessage: "MFA not configured" });
  }
  const ok = verifyTotpCode(code, user.mfaSecretEncrypted, cfg);
  if (!ok) {
    // Rate-limit MFA attempts via login brute-force protection.
    await bumpFailedLogin(cfg, user.userId);
    throw new ApiError("AUTH_MFA_INVALID");
  }

  const deviceId = await upsertDevice(user.userId, meta);
  const perms = await loadUserPermissions(user.userId);
  const sessionExpiresAt = new Date(Date.now() + cfg.jwt.refreshTokenTtlSeconds * 1000);
  const [sessionRow] = await db
    .insert(sessions)
    .values({
      userId: user.userId,
      deviceId,
      ip: meta.ip?.slice(0, IP_MAX_LEN) ?? null,
      userAgent: meta.userAgent?.slice(0, 1024) ?? null,
      expiresAt: sessionExpiresAt,
    })
    .returning({ sessionId: sessions.sessionId });

  const raw = generateRefreshToken();
  const familyId = generateFamilyId();
  const [refreshRow] = await db
    .insert(refreshTokens)
    .values({
      userId: user.userId,
      hash: raw.hash,
      familyId,
      deviceId,
      expiresAt: sessionExpiresAt,
    })
    .returning({ tokenId: refreshTokens.tokenId });

  await db
    .update(sessions)
    .set({ refreshTokenId: refreshRow.tokenId })
    .where(eq(sessions.sessionId, sessionRow.sessionId));

  const access = await signAccessToken(cfg, {
    userId: user.userId,
    sessionId: sessionRow.sessionId,
    permissions: perms,
  });

  return {
    user: {
      id: user.userId,
      email: user.email,
      username: user.username,
      emailVerified: !!user.emailVerifiedAt,
      status: user.status,
      mfaEnabled: !!user.mfaSecretEncrypted,
      robloxUsername: user.robloxUsername,
    },
    accessToken: access.jwt,
    accessTokenExpiresAt: access.expiresAt,
    refreshToken: raw.raw,
    refreshTokenId: refreshRow.tokenId,
    sessionId: sessionRow.sessionId,
  };
}

/* ---------- Exported for tests / future routes ---------- */

export async function resolveAccessToken(
  cfg: AppConfig,
  token: string,
): Promise<{ userId: string; sessionId: string; permissions: Permission[] }> {
  const claims = await verifyAccessToken(cfg, token);
  return { userId: claims.sub, sessionId: claims.sid, permissions: claims.perms };
}
