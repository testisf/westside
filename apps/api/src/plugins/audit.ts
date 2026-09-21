/**
 * Westside — audit + security-event plugin.
 *
 * Provides decorators to write rows to `audit_logs` and `security_events`
 * without exposing the underlying DB layer to route handlers.
 *
 *   await app.audit({ action: "USER_CREATED", targetType: "user", targetId, ... })
 *   await app.securityEvent({ type: "FAILED_LOGIN", severity: "warn", userId, ... })
 *
 * Both are append-only at the DB level (DB role restricts UPDATE/DELETE).
 */

import fp from "fastify-plugin";
import type { FastifyRequest } from "fastify";
import { db } from "@westside/database/client";
import { auditLogs, securityEvents } from "@westside/database";
import type { auditActionEnum, securityEventTypeEnum, securityEventSeverityEnum } from "@westside/database";

type AuditAction = (typeof auditActionEnum.enumValues)[number];
type SecurityEventType = (typeof securityEventTypeEnum.enumValues)[number];
type SecurityEventSeverity = (typeof securityEventSeverityEnum.enumValues)[number];

interface AuditArgs {
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

interface SecurityEventArgs {
  type: SecurityEventType;
  severity?: SecurityEventSeverity;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

declare module "fastify" {
  interface FastifyInstance {
    audit(args: AuditArgs): Promise<void>;
    securityEvent(args: SecurityEventArgs): Promise<void>;
  }
}

export function clientMeta(req?: FastifyRequest): {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  actorUserId: string | undefined;
} {
  if (!req) return { ip: null, userAgent: null, requestId: null, actorUserId: undefined };
  return {
    ip: req.ip ?? null,
    userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
    requestId: req.id ?? null,
    actorUserId: req.auth?.user.id,
  };
}

export default fp(async function auditPlugin(app) {
  app.decorate("audit", async function (args: AuditArgs) {
    try {
      await db.insert(auditLogs).values({
        action: args.action,
        targetType: args.targetType ?? null,
        targetId: args.targetId ?? null,
        metadata: args.metadata ?? {},
        actorUserId: args.actorUserId ?? null,
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
        requestId: args.requestId ?? null,
      });
    } catch (err) {
      // Audit failures must not crash the request.
      app.log.error({ err, action: args.action }, "audit insert failed");
    }
  });

  app.decorate("securityEvent", async function (args: SecurityEventArgs) {
    try {
      await db.insert(securityEvents).values({
        eventType: args.type,
        severity: args.severity ?? "info",
        userId: args.userId ?? null,
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
        metadata: args.metadata ?? {},
        requestId: args.requestId ?? null,
      });
    } catch (err) {
      app.log.error({ err, type: args.type }, "security_event insert failed");
    }
  });
});
