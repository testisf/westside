/**
 * Westside — health endpoints.
 *   GET /health  → process is alive (no DB check). Always returns 200 if the process is up.
 *   GET /ready   → checks DB + Redis. Returns 200 only when both reachable.
 */

import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "@westside/database/client";
import { getRedis } from "../../lib/redis.ts";
import type { AppConfig } from "../../config/index.ts";

export default async function healthRoutes(app: FastifyInstance, opts: { config: AppConfig }) {
  const cfg = opts.config;

  app.get("/health", { logLevel: "warn" }, async (_req, reply) => {
    return reply.code(200).send({ status: "ok", uptime: process.uptime() });
  });

  app.get("/ready", { logLevel: "warn" }, async (_req, reply) => {
    const checks: Record<string, { status: "ok" | "fail"; latencyMs?: number; error?: string }> = {};

    // DB ping
    try {
      const t0 = Date.now();
      await db.execute(sql`SELECT 1`);
      checks.database = { status: "ok", latencyMs: Date.now() - t0 };
    } catch (err) {
      checks.database = { status: "fail", error: (err as Error).message };
    }

    // Redis ping
    try {
      const t0 = Date.now();
      const pong = await getRedis(cfg).ping();
      checks.redis = { status: pong === "PONG" ? "ok" : "fail", latencyMs: Date.now() - t0 };
    } catch (err) {
      checks.redis = { status: "fail", error: (err as Error).message };
    }

    const allOk = Object.values(checks).every((c) => c.status === "ok");
    return reply.code(allOk ? 200 : 503).send({ status: allOk ? "ok" : "degraded", checks });
  });
}
