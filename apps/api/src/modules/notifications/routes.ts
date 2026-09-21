/**
 * Westside — Notifications API module.
 *
 *   GET    /api/v1/notifications
 *   POST   /api/v1/notifications/:id/read
 *   POST   /api/v1/notifications/:id/dismiss
 *   POST   /api/v1/notifications/read-all
 *   POST   /api/v1/notifications/dismiss-all
 */

import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@westside/database/client";
import { notifications } from "@westside/database";
import type { AppConfig } from "../../config/index.ts";

export default async function notificationRoutes(app: FastifyInstance, _opts: { config: AppConfig }) {
  /* ---------- List (only non-dismissed) ---------- */
  app.get(
    "/api/v1/notifications",
    { preHandler: [app.requireAuth(), app.requirePermission("notification.view")] },
    async (req, reply) => {
      const q = (req.query ?? {}) as { limit?: string; includeRead?: string };
      const limit = Math.min(100, Math.max(1, Number(q.limit ?? 50)));
      const includeRead = q.includeRead === "1" || q.includeRead === "true";
      const rows = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, req.auth!.user.id),
            isNull(notifications.dismissedAt),
            includeRead ? undefined : isNull(notifications.readAt),
          ),
        )
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
      return reply.code(200).send({
        data: rows.map((r) => ({
          id: r.notificationId,
          category: r.category,
          title: r.title,
          body: r.body,
          link: r.link,
          read: !!r.readAt,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    },
  );

  /* ---------- Mark one read ---------- */
  app.post(
    "/api/v1/notifications/:id/read",
    { preHandler: [app.requireAuth(), app.requirePermission("notification.view")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.notificationId, id), eq(notifications.userId, req.auth!.user.id)));
      return reply.code(204).send();
    },
  );

  /* ---------- Dismiss one ---------- */
  app.post(
    "/api/v1/notifications/:id/dismiss",
    { preHandler: [app.requireAuth(), app.requirePermission("notification.dismiss")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await db
        .update(notifications)
        .set({ dismissedAt: new Date(), readAt: new Date() })
        .where(and(eq(notifications.notificationId, id), eq(notifications.userId, req.auth!.user.id)));
      return reply.code(204).send();
    },
  );

  /* ---------- Mark all read ---------- */
  app.post(
    "/api/v1/notifications/read-all",
    { preHandler: [app.requireAuth(), app.requirePermission("notification.view")] },
    async (req, reply) => {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.userId, req.auth!.user.id), isNull(notifications.readAt)));
      return reply.code(204).send();
    },
  );

  /* ---------- Dismiss all ---------- */
  app.post(
    "/api/v1/notifications/dismiss-all",
    { preHandler: [app.requireAuth(), app.requirePermission("notification.dismiss")] },
    async (req, reply) => {
      await db
        .update(notifications)
        .set({ dismissedAt: new Date(), readAt: new Date() })
        .where(and(eq(notifications.userId, req.auth!.user.id), isNull(notifications.dismissedAt)));
      return reply.code(204).send();
    },
  );
}
