/**
 * Westside — Personnel API module (server-scoped).
 *
 *   GET    /api/v1/servers/:serverId/personnel
 *   POST   /api/v1/servers/:serverId/personnel
 *   GET    /api/v1/servers/:serverId/personnel/:id
 *   PATCH  /api/v1/servers/:serverId/personnel/:id
 *   DELETE /api/v1/servers/:serverId/personnel/:id
 */

import type { FastifyInstance } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@westside/database/client";
import { personnel, users } from "@westside/database";
import type { AppConfig } from "../../config/index.ts";
import { createPersonnelSchema, updatePersonnelSchema } from "../../schemas/index.ts";
import { ApiError } from "../../lib/error.ts";
import { clientMeta } from "../../plugins/audit.ts";
import { loadServerContext } from "../../lib/server-context.ts";

export default async function personnelRoutes(app: FastifyInstance, _opts: { config: AppConfig }) {
  /* ---------- List ---------- */
  app.get(
    "/api/v1/servers/:serverId/personnel",
    { preHandler: [app.requireAuth(), app.requirePermission("personnel.view")] },
    async (req, reply) => {
      const { serverId } = req.params as { serverId: string };
      await loadServerContext(serverId, req.auth!.user.id);
      const rows = await db
        .select({
          id: personnel.personnelId,
          userId: personnel.userId,
          callsign: personnel.callsign,
          badgeNumber: personnel.badgeNumber,
          rank: personnel.rank,
          title: personnel.title,
          status: personnel.status,
          notes: personnel.notes,
          createdAt: personnel.createdAt,
          updatedAt: personnel.updatedAt,
          username: users.username,
          email: users.email,
        })
        .from(personnel)
        .innerJoin(users, eq(personnel.userId, users.userId))
        .where(and(eq(personnel.serverId, serverId), isNull(personnel.deletedAt)));
      return reply.code(200).send({
        data: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      });
    },
  );

  /* ---------- Create ---------- */
  app.post(
    "/api/v1/servers/:serverId/personnel",
    { preHandler: [app.requireAuth(), app.requirePermission("personnel.create")] },
    async (req, reply) => {
      const { serverId } = req.params as { serverId: string };
      const ctx = await loadServerContext(serverId, req.auth!.user.id);
      if (!ctx.isOwner && !req.auth!.permissions.has("server.manage")) {
        throw new ApiError("RBAC_FORBIDDEN");
      }
      const body = createPersonnelSchema.parse(req.body);

      // User must exist.
      const [user] = await db.select().from(users).where(eq(users.userId, body.userId)).limit(1);
      if (!user) throw new ApiError("NOT_FOUND", { internalMessage: "user not found" });

      // User must be a member of the server.
      const ctx2 = await loadServerContext(serverId, body.userId);
      void ctx2;

      try {
        const [row] = await db
          .insert(personnel)
          .values({
            serverId,
            userId: body.userId,
            callsign: body.callsign ?? null,
            badgeNumber: body.badgeNumber ?? null,
            rank: body.rank ?? null,
            title: body.title ?? null,
            notes: body.notes ?? null,
            status: "off_duty",
          })
          .returning();
        await app.audit({
          action: "USER_UPDATED",
          targetType: "personnel",
          targetId: row.personnelId,
          metadata: { serverId, userId: body.userId, callsign: body.callsign },
          ...clientMeta(req),
          actorUserId: req.auth!.user.id,
        });
        return reply.code(201).send({ data: { id: row.personnelId } });
      } catch (err: any) {
        if (err?.code === "23505") {
          throw new ApiError("CONFLICT", { internalMessage: "personnel already exists for this user/server" });
        }
        throw err;
      }
    },
  );

  /* ---------- Get one ---------- */
  app.get(
    "/api/v1/servers/:serverId/personnel/:id",
    { preHandler: [app.requireAuth(), app.requirePermission("personnel.view")] },
    async (req, reply) => {
      const { serverId, id } = req.params as { serverId: string; id: string };
      await loadServerContext(serverId, req.auth!.user.id);
      const [row] = await db
        .select()
        .from(personnel)
        .where(and(eq(personnel.personnelId, id), eq(personnel.serverId, serverId), isNull(personnel.deletedAt)))
        .limit(1);
      if (!row) throw new ApiError("NOT_FOUND");
      return reply.code(200).send({
        data: {
          id: row.personnelId,
          userId: row.userId,
          callsign: row.callsign,
          badgeNumber: row.badgeNumber,
          rank: row.rank,
          title: row.title,
          status: row.status,
          notes: row.notes,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
      });
    },
  );

  /* ---------- Update ---------- */
  app.patch(
    "/api/v1/servers/:serverId/personnel/:id",
    { preHandler: [app.requireAuth(), app.requirePermission("personnel.update")] },
    async (req, reply) => {
      const { serverId, id } = req.params as { serverId: string; id: string };
      const body = updatePersonnelSchema.parse(req.body);
      const [updated] = await db
        .update(personnel)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(personnel.personnelId, id), eq(personnel.serverId, serverId), isNull(personnel.deletedAt)))
        .returning();
      if (!updated) throw new ApiError("NOT_FOUND");
      await app.audit({
        action: "USER_UPDATED",
        targetType: "personnel",
        targetId: id,
        metadata: body,
        ...clientMeta(req),
        actorUserId: req.auth!.user.id,
      });
      return reply.code(200).send({ data: { id } });
    },
  );

  /* ---------- Delete (soft) ---------- */
  app.delete(
    "/api/v1/servers/:serverId/personnel/:id",
    { preHandler: [app.requireAuth(), app.requirePermission("personnel.delete")] },
    async (req, reply) => {
      const { serverId, id } = req.params as { serverId: string; id: string };
      await db
        .update(personnel)
        .set({ deletedAt: new Date(), status: "off_duty", updatedAt: new Date() })
        .where(and(eq(personnel.personnelId, id), eq(personnel.serverId, serverId)));
      await app.audit({
        action: "USER_UPDATED",
        targetType: "personnel",
        targetId: id,
        metadata: { event: "deleted" },
        ...clientMeta(req),
        actorUserId: req.auth!.user.id,
      });
      return reply.code(204).send();
    },
  );
}
