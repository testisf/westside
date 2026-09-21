/**
 * Westside API — server entrypoint.
 *
 * Boots Fastify with all plugins + routes, wires graceful shutdown.
 */

import Fastify, { type FastifyInstance } from "fastify";
import closeWithGrace from "close-with-grace";
import cookie from "@fastify/cookie";

import { loadConfig } from "./config/index.ts";
import { closeDb } from "@westside/database/client";
import { closeRedis } from "./lib/redis.ts";

import requestIdPlugin from "./plugins/request-id.ts";
import securityPlugin from "./plugins/security.ts";
import authPlugin from "./plugins/auth.ts";
import auditPlugin from "./plugins/audit.ts";
import errorHandlerPlugin from "./plugins/error-handler.ts";

import healthRoutes from "./modules/health/routes.ts";
import authRoutes from "./modules/auth/routes.ts";
import userRoutes from "./modules/users/routes.ts";
import rbacRoutes from "./modules/rbac/routes.ts";
import auditRoutes from "./modules/audit/routes.ts";
// Phase 2
import serverRoutes from "./modules/servers/routes.ts";
import personnelRoutes from "./modules/personnel/routes.ts";
import vehicleRoutes from "./modules/vehicles/routes.ts";
import notificationRoutes from "./modules/notifications/routes.ts";
import apiKeyRoutes from "./modules/apikeys/routes.ts";
import { registerMfaRoutes } from "./modules/mfa/index.ts";

async function buildServer(): Promise<FastifyInstance> {
  const cfg = loadConfig();

  const loggerConfig: Record<string, unknown> = {
    level: cfg.logLevel,
    base: { service: "westside-api" },
    redact: {
      paths: [
        "password",
        "newPassword",
        "currentPassword",
        "refreshToken",
        "accessToken",
        "authorization",
        "cookie",
        "headers.authorization",
        "headers.cookie",
        "*.password",
        "*.refreshToken",
        "*.accessToken",
      ],
      censor: "[redacted]",
    },
  };
  if (cfg.nodeEnv !== "production") {
    loggerConfig.transport = { target: "pino-pretty", options: { colorize: true } };
  }

  const app = Fastify({
    logger: loggerConfig as any,
    trustProxy: cfg.nodeEnv === "production", // honor X-Forwarded-For in prod behind ALB
    bodyLimit: 256 * 1024,
    disableRequestLogging: cfg.nodeEnv === "production",
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
  });

  // Order matters.
  await app.register(cookie, { secret: process.env.COOKIE_SECRET ?? "westside-dev-cookie-secret-change-me" });
  await app.register(requestIdPlugin);
  await app.register(securityPlugin, { config: cfg });
  await app.register(auditPlugin);
  await app.register(authPlugin, { config: cfg });
  await app.register(errorHandlerPlugin);

  // Routes
  await app.register(healthRoutes, { config: cfg });
  await app.register(authRoutes, { config: cfg });
  await app.register(userRoutes, { config: cfg });
  await app.register(rbacRoutes, { config: cfg });
  await app.register(auditRoutes, { config: cfg });
  // Phase 2
  await app.register(serverRoutes, { config: cfg });
  await app.register(personnelRoutes, { config: cfg });
  await app.register(vehicleRoutes, { config: cfg });
  await app.register(notificationRoutes, { config: cfg });
  await app.register(apiKeyRoutes, { config: cfg });
  await registerMfaRoutes(app, cfg);

  // Version banner
  app.log.info(
    { port: cfg.api.port, env: cfg.nodeEnv, origins: cfg.api.corsOrigins },
    "Westside API booting",
  );

  return app;
}

async function main() {
  const app = await buildServer();

  const cfg = loadConfig();

  try {
    await app.listen({ port: cfg.api.port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error({ err }, "Failed to start API");
    process.exit(1);
  }

  closeWithGrace({ delay: 500 }, async ({ signal, err, manual }) => {
    if (err) app.log.error({ err }, "shutting down due to error");
    app.log.info({ signal, manual }, "closing server…");
    await app.close();
    try { await closeRedis(); } catch { /* ignore */ }
    try { await closeDb(); } catch { /* ignore */ }
  });
}

// Only run main when executed directly, not when imported by tests.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("fatal:", err);
    process.exit(1);
  });
}

export { buildServer };
