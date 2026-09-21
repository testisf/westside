/**
 * Westside — auth routes.
 *
 *   POST /api/v1/auth/register
 *   POST /api/v1/auth/login
 *   POST /api/v1/auth/refresh
 *   POST /api/v1/auth/logout
 *   POST /api/v1/auth/logout-all
 *   POST /api/v1/auth/verify-email
 *   POST /api/v1/auth/resend-verification
 *   POST /api/v1/auth/forgot-password
 *   POST /api/v1/auth/reset-password
 *   GET  /api/v1/auth/sessions
 *   DELETE /api/v1/auth/sessions/:id
 *   GET  /api/v1/auth/me
 *
 * Cookie policy: refresh tokens are returned in a HttpOnly+Secure+SameSite=Strict
 * cookie scoped to /api/v1/auth when the request came from a same-origin
 * browser. Desktop clients get the refresh token in the JSON body and store
 * it in OS keychain.
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../../config/index.ts";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../../schemas/index.ts";
import { checkRateLimit } from "../../plugins/security.ts";
import { ApiError } from "../../lib/error.ts";
import { clientMeta } from "../../plugins/audit.ts";
import {
  changePassword,
  listSessions,
  login,
  loginWithMfa,
  logout,
  logoutAll,
  refresh,
  register,
  requestPasswordReset,
  resetPassword,
  revokeSession,
  verifyEmail,
} from "./service.ts";

const REFRESH_COOKIE = "ws_refresh";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

function shouldUseCookie(req: FastifyRequest): boolean {
  // The web app sends X-Requested-With: XMLHttpRequest. We only set the cookie
  // for browser-like clients (because cookies don't help desktop clients).
  return req.headers["x-requested-with"] === "XMLHttpRequest";
}

function setRefreshCookie(reply: any, cfg: AppConfig, rawToken: string) {
  reply.setCookie(REFRESH_COOKIE, rawToken, {
    httpOnly: true,
    secure: cfg.nodeEnv === "production",
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: cfg.jwt.refreshTokenTtlSeconds,
  });
}

function clearRefreshCookie(reply: any) {
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

export default async function authRoutes(app: FastifyInstance, opts: { config: AppConfig }) {
  const cfg = opts.config;

  /* ---------- Register ---------- */
  app.post("/api/v1/auth/register", async (req, reply) => {
    const body = registerSchema.parse(req.body);

    // Per-IP rate limit (10 / hour).
    const rl = await checkRateLimit(cfg, `register:${req.ip}`, 10, 3600);
    if (rl.limited) {
      throw new ApiError("RATE_LIMITED", { details: { retryAfter: rl.retryAfter } });
    }

    const { userId, verificationToken } = await register(cfg, body);
    await app.audit({
      action: "USER_CREATED",
      targetType: "user",
      targetId: userId,
      metadata: { email: body.email, username: body.username },
      ...clientMeta(req),
    });

    // Phase 2 will wire SMTP. For now we return the verification token in dev.
    const verificationUrl =
      cfg.nodeEnv === "production"
        ? null
        : `${cfg.web.baseUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;

    return reply.code(201).send({
      data: {
        userId,
        email: body.email,
        username: body.username,
        // Expose verification URL in dev only — Phase 2 sends via email.
        verificationUrl,
      },
    });
  });

  /* ---------- Login ---------- */
  app.post("/api/v1/auth/login", async (req, reply) => {
    const body = loginSchema.parse(req.body);

    // Per-IP + per-identifier rate limit.
    const rlIp = await checkRateLimit(cfg, `login:ip:${req.ip}`, cfg.rateLimit.loginPer15Min, 900);
    if (rlIp.limited) throw new ApiError("RATE_LIMITED", { details: { retryAfter: rlIp.retryAfter } });

    const rlIdent = await checkRateLimit(
      cfg,
      `login:ident:${body.identifier.toLowerCase()}`,
      cfg.rateLimit.loginPer15Min,
      900,
    );
    if (rlIdent.limited) throw new ApiError("RATE_LIMITED", { details: { retryAfter: rlIdent.retryAfter } });

    try {
      const result = await login(cfg, body, clientMeta(req));
      if (shouldUseCookie(req)) {
        setRefreshCookie(reply, cfg, result.refreshToken);
      }
      await app.audit({
        action: "USER_UPDATED", // login event — reused for audit brevity
        targetType: "user",
        targetId: result.user.id,
        metadata: { event: "login" },
        ...clientMeta(req),
        actorUserId: result.user.id,
      });
      return reply.code(200).send({
        data: {
          user: result.user,
          accessToken: result.accessToken,
          accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
          // Refresh token is in the cookie for browsers; in the body for desktop.
          refreshToken: shouldUseCookie(req) ? undefined : result.refreshToken,
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "AUTH_INVALID_CREDENTIALS") {
        await app.securityEvent({
          type: "FAILED_LOGIN",
          severity: "warn",
          metadata: { identifier: body.identifier },
          ...clientMeta(req),
        });
      } else if (err instanceof ApiError && err.code === "AUTH_ACCOUNT_LOCKED") {
        await app.securityEvent({
          type: "ACCOUNT_LOCKED",
          severity: "warn",
          metadata: { identifier: body.identifier },
          ...clientMeta(req),
        });
      }
      throw err;
    }
  });

  /* ---------- Login MFA completion ---------- */
  app.post("/api/v1/auth/login/mfa", async (req, reply) => {
    const body = z.object({ ticket: z.string().min(1).max(256), code: z.string().regex(/^\d{6}$/) }).strict().parse(req.body);
    const rl = await checkRateLimit(cfg, `mfa:${req.ip}`, 10, 600);
    if (rl.limited) throw new ApiError("RATE_LIMITED", { details: { retryAfter: rl.retryAfter } });

    try {
      const result = await loginWithMfa(cfg, body.ticket, body.code, clientMeta(req));
      if (shouldUseCookie(req)) {
        setRefreshCookie(reply, cfg, result.refreshToken);
      }
      return reply.code(200).send({
        data: {
          user: result.user,
          accessToken: result.accessToken,
          accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
          refreshToken: shouldUseCookie(req) ? undefined : result.refreshToken,
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "AUTH_MFA_INVALID") {
        await app.securityEvent({
          type: "FAILED_LOGIN",
          severity: "warn",
          metadata: { reason: "mfa_invalid" },
          ...clientMeta(req),
        });
      }
      throw err;
    }
  });

  /* ---------- Refresh ---------- */
  app.post("/api/v1/auth/refresh", async (req, reply) => {
    // Refresh token can come from cookie (browser) or body (desktop).
    const cookieToken = req.cookies?.[REFRESH_COOKIE];
    const body = (() => {
      try {
        return refreshSchema.parse(req.body ?? {});
      } catch {
        return { refreshToken: "" };
      }
    })();
    const rawToken = cookieToken ?? body.refreshToken;
    if (!rawToken) throw new ApiError("AUTH_TOKEN_INVALID");

    try {
      const result = await refresh(cfg, rawToken, clientMeta(req));
      if (shouldUseCookie(req)) {
        setRefreshCookie(reply, cfg, result.refreshToken);
      }
      return reply.code(200).send({
        data: {
          user: result.user,
          accessToken: result.accessToken,
          accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
          refreshToken: shouldUseCookie(req) ? undefined : result.refreshToken,
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "AUTH_REFRESH_REUSE") {
        clearRefreshCookie(reply);
        await app.securityEvent({
          type: "REFRESH_REUSE",
          severity: "critical",
          ...clientMeta(req),
        });
      }
      throw err;
    }
  });

  /* ---------- Logout ---------- */
  app.post("/api/v1/auth/logout", async (req, reply) => {
    await app.requireAuth()(req, reply);
    const cookieToken = req.cookies?.[REFRESH_COOKIE];
    const body = (() => {
      try {
        return refreshSchema.parse(req.body ?? {});
      } catch {
        return { refreshToken: "" };
      }
    })();
    const rawToken = cookieToken ?? body.refreshToken;
    if (rawToken) await logout(cfg, rawToken);
    clearRefreshCookie(reply);
    await app.audit({
      action: "SESSION_REVOKED",
      targetType: "session",
      ...clientMeta(req),
    });
    return reply.code(204).send();
  });

  /* ---------- Logout all ---------- */
  app.post("/api/v1/auth/logout-all", async (req, reply) => {
    await app.requireAuth()(req, reply);
    const userId = req.auth!.user.id;
    await logoutAll(userId);
    clearRefreshCookie(reply);
    await app.audit({
      action: "SESSION_REVOKED_ALL",
      targetType: "user",
      targetId: userId,
      ...clientMeta(req),
      actorUserId: userId,
    });
    return reply.code(204).send();
  });

  /* ---------- Verify email ---------- */
  app.post("/api/v1/auth/verify-email", async (req, reply) => {
    const body = verifyEmailSchema.parse(req.body);
    await verifyEmail(cfg, body.token);
    return reply.code(200).send({ data: { verified: true } });
  });

  /* ---------- Resend verification ---------- */
  app.post("/api/v1/auth/resend-verification", async (req, reply) => {
    const body = resendVerificationSchema.parse(req.body);
    // Phase 2 will look up user + send email. For now, return generic message.
    return reply.code(202).send({ data: { message: "If the email exists, a verification link has been sent." } });
  });

  /* ---------- Forgot password ---------- */
  app.post("/api/v1/auth/forgot-password", async (req, reply) => {
    const body = forgotPasswordSchema.parse(req.body);
    const rl = await checkRateLimit(cfg, `forgotpw:${req.ip}`, 5, 900);
    if (rl.limited) throw new ApiError("RATE_LIMITED", { details: { retryAfter: rl.retryAfter } });

    const result = await requestPasswordReset(cfg, body.email);
    await app.audit({
      action: "PASSWORD_RESET_REQUESTED",
      targetType: "user",
      targetId: result.userId ?? undefined,
      metadata: { email: body.email },
      ...clientMeta(req),
    });

    // Never reveal whether the email exists.
    return reply.code(202).send({
      data: {
        message: "If the email exists, a reset link has been sent.",
        // Expose reset URL in dev only — Phase 2 sends via email.
        resetUrl:
          cfg.nodeEnv === "production" || !result.token
            ? null
            : `${cfg.web.baseUrl}/reset-password?token=${encodeURIComponent(result.token)}`,
      },
    });
  });

  /* ---------- Reset password ---------- */
  app.post("/api/v1/auth/reset-password", async (req, reply) => {
    const body = resetPasswordSchema.parse(req.body);
    await resetPassword(cfg, body.token, body.password);
    await app.audit({
      action: "PASSWORD_RESET_COMPLETED",
      targetType: "user",
      ...clientMeta(req),
    });
    return reply.code(200).send({ data: { reset: true } });
  });

  /* ---------- List sessions ---------- */
  app.get("/api/v1/auth/sessions", async (req, reply) => {
    await app.requireAuth()(req, reply);
    const sessions = await listSessions(req.auth!.user.id);
    return reply.code(200).send({ data: sessions });
  });

  /* ---------- Revoke a single session ---------- */
  app.delete("/api/v1/auth/sessions/:id", async (req, reply) => {
    await app.requireAuth()(req, reply);
    const { id } = req.params as { id: string };
    await revokeSession(req.auth!.user.id, id);
    await app.audit({
      action: "SESSION_REVOKED",
      targetType: "session",
      targetId: id,
      ...clientMeta(req),
      actorUserId: req.auth!.user.id,
    });
    return reply.code(204).send();
  });

  /* ---------- Change password ---------- */
  app.post("/api/v1/auth/change-password", async (req, reply) => {
    await app.requireAuth()(req, reply);
    const body = changePasswordSchema.parse(req.body);
    await changePassword(cfg, req.auth!.user.id, body.currentPassword, body.newPassword);
    await app.audit({
      action: "PASSWORD_CHANGED",
      targetType: "user",
      targetId: req.auth!.user.id,
      ...clientMeta(req),
      actorUserId: req.auth!.user.id,
    });
    return reply.code(200).send({ data: { changed: true } });
  });

  /* ---------- Current user ---------- */
  app.get("/api/v1/auth/me", async (req, reply) => {
    await app.requireAuth()(req, reply);
    const auth = req.auth!;
    return reply.code(200).send({
      data: {
        user: auth.user,
        sessionId: auth.sessionId,
        permissions: [...auth.permissions],
        roles: auth.roles,
      },
    });
  });
}
