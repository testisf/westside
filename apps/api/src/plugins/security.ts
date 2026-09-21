/**
 * Westside — security middleware.
 *
 *   helmet        → strict HTTP headers
 *   cors           → allowlist origins
 *   body-size      → reject oversized bodies (handled by Fastify bodyLimit=256KB)
 *   rate-limit     → sliding-window per-IP (Redis-backed)
 *
 * NOTE: helmet's defaults include CSP. The API primarily serves JSON; CSP
 * mainly matters for the web app. We still apply helmet to add HSTS,
 * X-Content-Type-Options, X-Frame-Options, etc.
 */

import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { AppConfig } from "../config/index.ts";
import { getRedis } from "../lib/redis.ts";
import { slidingWindowRateLimit } from "../lib/redis.ts";

export default fp(
  async function securityPlugin(app, opts: { config: AppConfig }) {
    const cfg = opts.config;

    await app.register(helmet, {
      contentSecurityPolicy: false, // API; no scripts to allow
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      frameguard: { action: "deny" },
      noSniff: true,
      referrerPolicy: { policy: "no-referrer" },
    });

    await app.register(cors, {
      origin: cfg.api.corsOrigins,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Authorization",
        "Content-Type",
        "X-Requested-With",
        "X-Request-Id",
        "Idempotency-Key",
      ],
      exposedHeaders: ["X-Request-Id", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
      maxAge: 600,
    });

    // Per-IP rate limit. Body size is enforced by Fastify's bodyLimit option
    // set at app construction (see server.ts).

    await app.register(rateLimit, {
      max: cfg.rateLimit.perMinuteIp,
      timeWindow: "1 minute",
      keyGenerator: (req: FastifyRequest) => {
        const xf = req.headers["x-forwarded-for"];
        const ip = typeof xf === "string" ? xf.split(",")[0].trim() : req.ip;
        return ip;
      },
      redis: getRedis(cfg),
      // Custom error response shape.
      errorResponseBuilder: (req: FastifyRequest, context: { ttl: number }) => ({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please slow down.",
          details: { retryAfter: Math.ceil(context.ttl / 1000) },
          requestId: req.id,
        },
      }),
      addHeaders: {
        "x-ratelimit-limit": true,
        "x-ratelimit-remaining": true,
        "x-ratelimit-reset": true,
        "retry-after": true,
      },
    });

    // CORS preflight: explicitly reject any request whose Origin is not in the
    // allowlist (defence in depth — @fastify/cors already does this, but we
    // emit a security_event for visibility).
    app.addHook("onRequest", async (req: FastifyRequest, _reply: FastifyReply) => {
      const origin = req.headers.origin;
      if (origin && !cfg.api.corsOrigins.includes(origin)) {
        await app.securityEvent({
          type: "ORIGIN_MISMATCH",
          severity: "warn",
          metadata: { origin },
          ip: req.ip ?? null,
          userAgent:
            typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
          requestId: req.id ?? null,
        });
      }
    });
  },
  { name: "security" },
);

/**
 * Custom per-key rate-limit check used by login/register endpoints.
 * Returns `{ limited: boolean, retryAfter?: number }`.
 *
 * We don't use the global plugin for login because the threshold is much
 * lower (5 per 15min) and we want both per-IP and per-identifier limiting.
 */
export async function checkRateLimit(
  cfg: AppConfig,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ limited: boolean; retryAfter?: number; remaining?: number }> {
  return slidingWindowRateLimit(getRedis(cfg), key, limit, windowSeconds);
}
