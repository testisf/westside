/**
 * Westside — Roblox OAuth ("Sign in with Roblox").
 *
 * Standard OAuth 2.0 authorization-code flow with PKCE against Roblox's
 * OIDC provider (docs: https://create.roblox.com/docs/cloud/auth/oauth2-overview).
 * Endpoints and required env vars:
 *
 *   ROBLOX_CLIENT_ID       — from the Roblox Creator Dashboard OAuth app
 *   ROBLOX_CLIENT_SECRET   — same place; keep server-side only
 *
 * The redirect URI registered on that app MUST be exactly
 * `${API_BASE_URL}/api/v1/auth/roblox/callback` (see config.roblox.callbackPath).
 *
 * Flow:
 *   1. GET /roblox/login   — mint PKCE verifier + state, stash them in Redis
 *                            keyed by state, 302 to Roblox's authorize URL.
 *   2. User authorizes on Roblox's own site (we never see their password).
 *   3. GET /roblox/callback — Roblox redirects back with ?code&state. We
 *      look up the stashed verifier by state (one-time use), exchange the
 *      code for tokens directly with Roblox (server-to-server, uses the
 *      client secret), fetch the profile from Roblox's userinfo endpoint,
 *      and upsert a local user keyed by Roblox's `sub` (their stable user
 *      ID — usernames can change, this can't).
 *   4. We issue our OWN session (same establishSession() password login
 *      uses) and hand it back to whichever client asked:
 *        - web:     set the refresh cookie, redirect to the web app.
 *        - desktop: redirect to the loopback listener the Rust app opened,
 *                   with the tokens in the query string (127.0.0.1-only,
 *                   see apps/desktop/src-tauri/src/main.rs::login_with_roblox).
 *
 * This never asks for our own MFA — Roblox's own account security is the
 * factor being trusted here, on top of whatever Roblox itself requires.
 */

import { randomBytes, createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "@westside/database/client";
import { users } from "@westside/database";
import type { AppConfig } from "../../config/index.ts";
import { getRedis } from "../../lib/redis.ts";
import { ApiError } from "../../lib/error.ts";
import { clientMeta } from "../../plugins/audit.ts";
import { checkRateLimit } from "../../plugins/security.ts";
import { establishSession } from "./service.ts";

const ROBLOX_AUTHORIZE_URL = "https://apis.roblox.com/oauth/v1/authorize";
const ROBLOX_TOKEN_URL = "https://apis.roblox.com/oauth/v1/token";
const ROBLOX_USERINFO_URL = "https://apis.roblox.com/oauth/v1/userinfo";

const STATE_TTL_SECONDS = 600; // 10 minutes to complete the Roblox-side flow
const STATE_KEY_PREFIX = "roblox:oauth:state:";

type ClientKind = "web" | "desktop";

interface StoredState {
  codeVerifier: string;
  client: ClientKind;
  returnTo: string; // web only — path within the web app, always starts with "/"
  port: number | null; // desktop only — the loopback listener's port
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** Only allow redirecting back into our own web app, never an arbitrary URL. */
function sanitizeReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/dashboard";
  }
  return raw;
}

/** A short, human-legible username seed from whatever Roblox gives us. */
function usernameSeed(preferred: string | undefined, sub: string): string {
  const cleaned = (preferred ?? "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 24);
  return cleaned.length >= 3 ? cleaned : `player_${sub.slice(-8)}`;
}

async function uniqueUsernameFrom(seed: string): Promise<string> {
  const [existing] = await db.select({ username: users.username }).from(users).where(eq(users.username, seed)).limit(1);
  if (!existing) return seed;
  // Append a short random suffix rather than an incrementing counter, so
  // concurrent signups can't race each other onto the same name.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${seed.slice(0, 20)}_${base64url(randomBytes(3)).slice(0, 4)}`;
    const [taken] = await db.select({ username: users.username }).from(users).where(eq(users.username, candidate)).limit(1);
    if (!taken) return candidate;
  }
  // Astronomically unlikely, but fall back to something guaranteed-unique.
  return `player_${randomBytes(6).toString("hex")}`;
}

interface RobloxUserinfo {
  sub: string;
  preferred_username?: string;
  name?: string;
}

async function exchangeCodeForRobloxProfile(
  cfg: AppConfig,
  code: string,
  codeVerifier: string,
): Promise<RobloxUserinfo> {
  const tokenRes = await fetch(ROBLOX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      client_id: cfg.roblox.clientId,
      client_secret: cfg.roblox.clientSecret,
      redirect_uri: `${cfg.api.baseUrl}${cfg.roblox.callbackPath}`,
    }),
  });
  if (!tokenRes.ok) {
    throw new ApiError("AUTH_ROBLOX_OAUTH_FAILED", {
      internalMessage: `Roblox token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`,
    });
  }
  const tokenBody = (await tokenRes.json()) as { access_token?: string };
  if (!tokenBody.access_token) {
    throw new ApiError("AUTH_ROBLOX_OAUTH_FAILED", { internalMessage: "Roblox token response had no access_token" });
  }

  const userinfoRes = await fetch(ROBLOX_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  if (!userinfoRes.ok) {
    throw new ApiError("AUTH_ROBLOX_OAUTH_FAILED", {
      internalMessage: `Roblox userinfo failed: ${userinfoRes.status} ${await userinfoRes.text()}`,
    });
  }
  const profile = (await userinfoRes.json()) as RobloxUserinfo;
  if (!profile.sub) {
    throw new ApiError("AUTH_ROBLOX_OAUTH_FAILED", { internalMessage: "Roblox userinfo response had no sub" });
  }
  return profile;
}

/** Find the local account for this Roblox identity, creating one if needed. */
async function findOrCreateUserForRoblox(profile: RobloxUserinfo) {
  const [existing] = await db.select().from(users).where(eq(users.robloxId, profile.sub)).limit(1);
  if (existing) {
    // Keep the display-only username field current; doesn't affect login.
    if (profile.preferred_username && profile.preferred_username !== existing.robloxUsername) {
      await db
        .update(users)
        .set({ robloxUsername: profile.preferred_username })
        .where(eq(users.userId, existing.userId));
      return { ...existing, robloxUsername: profile.preferred_username };
    }
    return existing;
  }

  const seed = usernameSeed(profile.preferred_username, profile.sub);
  const username = await uniqueUsernameFrom(seed);

  const [created] = await db
    .insert(users)
    .values({
      username,
      email: null,
      passwordHash: null,
      argon2Params: null,
      robloxId: profile.sub,
      robloxUsername: profile.preferred_username ?? null,
      status: "active",
      // No email to verify, so there's nothing to gate on.
      emailVerifiedAt: new Date(),
    })
    .returning();
  return created;
}

export function registerRobloxAuthRoutes(app: FastifyInstance, cfg: AppConfig): void {
  if (!cfg.roblox.clientId || !cfg.roblox.clientSecret) {
    app.log.warn(
      "ROBLOX_CLIENT_ID / ROBLOX_CLIENT_SECRET are not set — /auth/roblox/* routes will return AUTH_ROBLOX_OAUTH_FAILED for every request.",
    );
  }

  app.get("/api/v1/auth/roblox/login", async (req, reply) => {
    const rl = await checkRateLimit(cfg, `roblox-login:${req.ip}`, 20, 600);
    if (rl.limited) {
      throw new ApiError("RATE_LIMITED", { details: { retryAfter: rl.retryAfter } });
    }
    if (!cfg.roblox.clientId || !cfg.roblox.clientSecret) {
      throw new ApiError("AUTH_ROBLOX_OAUTH_FAILED", { internalMessage: "Roblox OAuth is not configured" });
    }

    const query = req.query as Record<string, unknown>;
    const client: ClientKind = query.client === "desktop" ? "desktop" : "web";
    const port = client === "desktop" ? Number.parseInt(String(query.port ?? ""), 10) : null;
    if (client === "desktop" && (!port || port < 1 || port > 65535)) {
      throw new ApiError("BAD_REQUEST", { internalMessage: "Desktop Roblox login requires a valid port" });
    }

    const { verifier, challenge } = pkcePair();
    const state = base64url(randomBytes(24));
    const stored: StoredState = {
      codeVerifier: verifier,
      client,
      returnTo: sanitizeReturnTo(query.returnTo),
      port,
    };
    await getRedis(cfg).set(`${STATE_KEY_PREFIX}${state}`, JSON.stringify(stored), "EX", STATE_TTL_SECONDS);

    const authorizeUrl = new URL(ROBLOX_AUTHORIZE_URL);
    authorizeUrl.searchParams.set("client_id", cfg.roblox.clientId);
    authorizeUrl.searchParams.set("redirect_uri", `${cfg.api.baseUrl}${cfg.roblox.callbackPath}`);
    authorizeUrl.searchParams.set("scope", "openid profile");
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    return reply.redirect(authorizeUrl.toString(), 302);
  });

  app.get(cfg.roblox.callbackPath, async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    const stateKey = typeof query.state === "string" ? `${STATE_KEY_PREFIX}${query.state}` : null;

    // Consume the state up front (single-use) so a replayed callback can't
    // succeed twice, whether or not this attempt succeeds. get+del rather
    // than GETDEL for compatibility with older Redis (<6.2).
    const redis = getRedis(cfg);
    const raw = stateKey ? await redis.get(stateKey) : null;
    if (stateKey) await redis.del(stateKey);
    if (!raw) {
      throw new ApiError("AUTH_ROBLOX_STATE_INVALID");
    }
    const stored = JSON.parse(raw) as StoredState;

    function failureRedirect(reason: string): ReturnType<typeof reply.redirect> {
      if (stored.client === "desktop" && stored.port) {
        const url = new URL(`http://127.0.0.1:${stored.port}/callback`);
        url.searchParams.set("error", reason);
        return reply.redirect(url.toString(), 302);
      }
      const url = new URL(`${cfg.web.baseUrl}/login`);
      url.searchParams.set("error", reason);
      return reply.redirect(url.toString(), 302);
    }

    if (typeof query.error === "string") {
      // The user declined on Roblox's own consent screen, or Roblox itself
      // rejected the request — either way, nothing on our side went wrong.
      return failureRedirect("roblox_denied");
    }
    if (typeof query.code !== "string") {
      return failureRedirect("roblox_oauth_failed");
    }

    let session;
    try {
      const profile = await exchangeCodeForRobloxProfile(cfg, query.code, stored.codeVerifier);
      const user = await findOrCreateUserForRoblox(profile);
      if (user.status === "disabled" || user.status === "locked") {
        return failureRedirect("account_unavailable");
      }
      const isNewUser = user.createdAt.getTime() > Date.now() - 5000;
      session = await establishSession(cfg, user, clientMeta(req));
      if (isNewUser) {
        await app.audit({
          action: "USER_CREATED",
          targetType: "user",
          targetId: user.userId,
          metadata: { via: "roblox", robloxUsername: user.robloxUsername },
          ...clientMeta(req),
        });
      }
    } catch (err) {
      req.log.error({ err }, "Roblox sign-in failed");
      return failureRedirect("roblox_oauth_failed");
    }

    if (stored.client === "desktop" && stored.port) {
      const url = new URL(`http://127.0.0.1:${stored.port}/callback`);
      url.searchParams.set(
        "payload",
        JSON.stringify({
          user: session.user,
          access_token: session.accessToken,
          access_token_expires_at: session.accessTokenExpiresAt.toISOString(),
          refresh_token: session.refreshToken,
        }),
      );
      return reply.redirect(url.toString(), 302);
    }

    reply.setCookie("ws_refresh", session.refreshToken, {
      httpOnly: true,
      secure: cfg.nodeEnv === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
      maxAge: cfg.jwt.refreshTokenTtlSeconds,
    });
    return reply.redirect(`${cfg.web.baseUrl}${stored.returnTo}`, 302);
  });
}
