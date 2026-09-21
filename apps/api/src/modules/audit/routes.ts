/**
 * Westside — audit + security-event read endpoints.
 *   GET /api/v1/admin/audit-logs
 *   GET /api/v1/admin/security-events
 *
 * Both are admin-gated, paginated, never include raw credentials.
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { desc, sql } from "drizzle-orm";
import { db } from "@westside/database/client";
import { auditLogs, securityEvents } from "@westside/database";
import type { AppConfig } from "../../config/index.ts";

function parsePagination(req: FastifyRequest) {
  const q = (req.query ?? {}) as Record<string, unknown>;
  const limit = Math.min(200, Math.max(1, Number(q.limit ?? 100)));
  const before = q.before ? BigInt(String(q.before)) : null;
  return { limit, before };
}

export default async function auditRoutes(app: FastifyInstance, _opts: { config: AppConfig }) {
  app.get(
    "/api/v1/admin/audit-logs",
    { preHandler: [app.requireAuth(), app.requirePermission("audit.view")] },
    async (req, reply) => {
      const { limit, before } = parsePagination(req);
      const rows = await db
        .select({
          logId: auditLogs.logId,
          actorUserId: auditLogs.actorUserId,
          action: auditLogs.action,
          targetType: auditLogs.targetType,
          targetId: auditLogs.targetId,
          metadata: auditLogs.metadata,
          ip: auditLogs.ip,
          userAgent: auditLogs.userAgent,
          requestId: auditLogs.requestId,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(before ? sql`${auditLogs.logId} < ${before}` : sql`TRUE`)
        .orderBy(desc(auditLogs.logId))
        .limit(limit + 1);

      let nextCursor: string | null = null;
      if (rows.length > limit) {
        const last = rows.pop()!;
        nextCursor = String(last.logId);
      }
      return reply.code(200).send({
        data: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          // Metadata is sanitized at write time; still, redact any field that
          // looks like a credential as a defence-in-depth measure.
          metadata: sanitizeMeta(r.metadata),
        })),
        meta: { nextCursor },
      });
    },
  );

  app.get(
    "/api/v1/admin/security-events",
    { preHandler: [app.requireAuth(), app.requirePermission("security.view")] },
    async (req, reply) => {
      const { limit, before } = parsePagination(req);
      const rows = await db
        .select({
          eventId: securityEvents.eventId,
          eventType: securityEvents.eventType,
          severity: securityEvents.severity,
          userId: securityEvents.userId,
          ip: securityEvents.ip,
          userAgent: securityEvents.userAgent,
          metadata: securityEvents.metadata,
          requestId: securityEvents.requestId,
          createdAt: securityEvents.createdAt,
        })
        .from(securityEvents)
        .where(before ? sql`${securityEvents.eventId} < ${before}` : sql`TRUE`)
        .orderBy(desc(securityEvents.eventId))
        .limit(limit + 1);

      let nextCursor: string | null = null;
      if (rows.length > limit) {
        const last = rows.pop()!;
        nextCursor = String(last.eventId);
      }
      return reply.code(200).send({
        data: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          metadata: sanitizeMeta(r.metadata),
        })),
        meta: { nextCursor },
      });
    },
  );
}

function sanitizeMeta(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== "object") return {};
  const m = meta as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    const lk = k.toLowerCase();
    if (
      lk.includes("password") ||
      lk.includes("token") ||
      lk.includes("secret") ||
      lk.includes("apikey") ||
      lk === "authorization" ||
      lk === "cookie"
    ) {
      out[k] = "[redacted]";
    } else {
      out[k] = v;
    }
  }
  return out;
}
