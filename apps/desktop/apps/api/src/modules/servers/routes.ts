/**
 * Westside — Servers API module.
 *
 *   GET    /api/v1/servers
 *   POST   /api/v1/servers
 *   GET    /api/v1/servers/:serverId
 *   PATCH  /api/v1/servers/:serverId
 *   DELETE /api/v1/servers/:serverId
 *   GET    /api/v1/servers/:serverId/members
 *   POST   /api/v1/servers/:serverId/members            (join)
 *   DELETE /api/v1/servers/:serverId/members/:userId    (leave/remove)
 *   PATCH  /api/v1/servers/:serverId/members/:userId   (suspend/activate)
 */

import type { FastifyInstance } from "fastify";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@westside/database/client";
import { serverMemberships, servers, users } from "@westside/database";
import type { AppConfig } from "../../config/index.ts";
import {
  createServerSchema,
  updateServerSchema,
} from "../../schemas/index.ts";
import { ApiError } from "../../lib/error.ts";
import { clientMeta } from "../../plugins/audit.ts";
import { loadServerContext } from "../../lib/server-context.ts";

export default async function serverRoutes(app: FastifyInstance, _opts: { config: AppConfig }) {
  /* ---------- List servers the caller can see ---------- */
  app.get("/api/v1/servers", { preHandler: [app.requireAuth()] }, async (req, reply) => {
    // Memberships of this user + owned servers.
    const ownedRows = await db
      .select({ server: servers })
      .from(servers)
      .where(and(eq(servers.ownerId, req.auth!.user.id), isNull(servers.deletedAt)));

    const memberRows = await db
      .select({ server: servers, membership: serverMemberships })
      .from(serverMemberships)
      .innerJoin(servers, eq(serverMemberships.serverId, servers.serverId))
      .where(
        and(
          eq(serverMemberships.userId, req.auth!.user.id),
          eq(serverMemberships.status, "active"),
          isNull(servers.deletedAt),
        ),
      );

    const seen = new Set<string>();
    const out = [];
    for (const r of [...ownedRows, ...memberRows]) {
      if (seen.has(r.server.serverId)) continue;
      seen.add(r.server.serverId);
      out.push(serializeServer(r.server, r.server.ownerId === req.auth!.user.id));
    }
    return reply.code(200).send({ data: out });
  });

  /* ---------- Create server ---------- */
  app.post(
    "/api/v1/servers",
    { preHandler: [app.requireAuth(), app.requirePermission("server.create")] },
    async (req, reply) => {
      const body = createServerSchema.parse(req.body);

      // Slug uniqueness.
      const [existing] = await db
        .select({ serverId: servers.serverId })
        .from(servers)
        .where(eq(servers.slug, body.slug))
        .limit(1);
      if (existing) throw new ApiError("CONFLICT", { internalMessage: `slug ${body.slug} taken` });

      const [row] = await db
        .insert(servers)
        .values({
          name: body.name,
          slug: body.slug,
          description: body.description ?? null,
          robloxPlaceId: body.robloxPlaceId ?? null,
          robloxUniverseId: body.robloxUniverseId ?? null,
          ownerId: req.auth!.user.id,
        })
        .returning();

      // Auto-create owner membership.
      await db.insert(serverMemberships).values({
        serverId: row.serverId,
        userId: req.auth!.user.id,
        status: "active",
      });

      await app.audit({
        action: "DEPARTMENT_CREATED", // server creation reuses the audit enum's DEPARTMENT_CREATED slot
        targetType: "server",
        targetId: row.serverId,
        metadata: { name: body.name, slug: body.slug },
        ...clientMeta(req),
        actorUserId: req.auth!.user.id,
      });

      return reply.code(201).send({ data: serializeServer(row, true) });
    },
  );

  /* ---------- Get one server ---------- */
  app.get("/api/v1/servers/:serverId", { preHandler: [app.requireAuth()] }, async (req, reply) => {
    const { serverId } = req.params as { serverId: string };
    const ctx = await loadServerContext(serverId, req.auth!.user.id);
    return reply.code(200).send({ data: serializeServer(ctx.server, ctx.isOwner) });
  });

  /* ---------- Update server ---------- */
  app.patch(
    "/api/v1/servers/:serverId",
    { preHandler: [app.requireAuth(), app.requirePermission("server.update")] },
    async (req, reply) => {
      const { serverId } = req.params as { serverId: string };
      const ctx = await loadServerContext(serverId, req.auth!.user.id);
      if (!ctx.isOwner && !req.auth!.permissions.has("server.manage")) {
        throw new ApiError("RBAC_FORBIDDEN");
      }
      const body = updateServerSchema.parse(req.body);
      const [updated] = await db
        .update(servers)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(servers.serverId, serverId), isNull(servers.deletedAt)))
        .returning();
      if (!updated) throw new ApiError("NOT_FOUND");

      await app.audit({
        action: "DEPARTMENT_UPDATED",
        targetType: "server",
        targetId: serverId,
        metadata: body,
        ...clientMeta(req),
        actorUserId: req.auth!.user.id,
      });
      return reply.code(200).send({ data: serializeServer(updated, ctx.isOwner) });
    },
  );

  /* ---------- Soft-delete server ---------- */
  app.delete(
    "/api/v1/servers/:serverId",
    { preHandler: [app.requireAuth(), app.requirePermission("server.delete")] },
    async (req, reply) => {
      const { serverId } = req.params as { serverId: string };
      const ctx = await loadServerContext(serverId, req.auth!.user.id);
      if (!ctx.isOwner && !req.auth!.permissions.has("server.manage")) {
        throw new ApiError("RBAC_FORBIDDEN");
      }
      await db
        .update(servers)
        .set({ deletedAt: new Date(), status: "archived", updatedAt: new Date() })
        .where(eq(servers.serverId, serverId));
      await app.audit({
        action: "DEPARTMENT_DELETED",
        targetType: "server",
        targetId: serverId,
        ...clientMeta(req),
        actorUserId: req.auth!.user.id,
      });
      return reply.code(204).send();
    },
  );

  /* ---------- List members of a server ---------- */
  app.get(
    "/api/v1/servers/:serverId/members",
    { preHandler: [app.requireAuth()] },
    async (req, reply) => {
      const { serverId } = req.params as { serverId: string };
      await loadServerContext(serverId, req.auth!.user.id);
      const rows = await db
        .select({
          membershipId: serverMemberships.membershipId,
          userId: serverMemberships.userId,
          status: serverMemberships.status,
          joinedAt: serverMemberships.joinedAt,
          leftAt: serverMemberships.leftAt,
          email: users.email,
          username: users.username,
          robloxUsername: users.robloxUsername,
        })
        .from(serverMemberships)
        .innerJoin(users, eq(serverMemberships.userId, users.userId))
        .where(eq(serverMemberships.serverId, serverId));
      return reply.code(200).send({
        data: rows.map((r) => ({
          membershipId: r.membershipId,
          userId: r.userId,
          username: r.username,
          email: r.email,
          robloxUsername: r.robloxUsername,
          status: r.status,
          joinedAt: r.joinedAt.toISOString(),
          leftAt: r.leftAt?.toISOString() ?? null,
        })),
      });
    },
  );

  /* ---------- Join server (self) ---------- */
  app.post(
    "/api/v1/servers/:serverId/members",
    { preHandler: [app.requireAuth(), app.requirePermission("server.view")] },
    async (req, reply) => {
      const { serverId } = req.params as { serverId: string };
      const userId = req.auth!.user.id;

      // Server must be active and visible.
      const [server] = await db
        .select()
        .from(servers)
        .where(and(eq(servers.serverId, serverId), isNull(servers.deletedAt)))
        .limit(1);
      if (!server) throw new ApiError("NOT_FOUND");
      if (server.status !== "active") throw new ApiError("CONFLICT", { internalMessage: "server not active" });

      // Idempotent upsert.
      const [existing] = await db
        .select()
        .from(serverMemberships)
        .where(and(eq(serverMemberships.serverId, serverId), eq(serverMemberships.userId, userId)))
        .limit(1);

      if (existing) {
        if (existing.status === "active") {
          return reply.code(200).send({ data: { alreadyMember: true } });
        }
        await db
          .update(serverMemberships)
          .set({ status: "active", leftAt: null, updatedAt: new Date() })
          .where(eq(serverMemberships.membershipId, existing.membershipId));
      } else {
        await db.insert(serverMemberships).values({ serverId, userId, status: "active" });
      }

      await app.audit({
        action: "USER_UPDATED",
        targetType: "server_membership",
        targetId: serverId,
        metadata: { event: "joined", userId },
        ...clientMeta(req),
        actorUserId: userId,
      });
      return reply.code(201).send({ data: { joined: true } });
    },
  );

  /* ---------- Leave / remove member ---------- */
  app.delete(
    "/api/v1/servers/:serverId/members/:userId",
    { preHandler: [app.requireAuth()] },
    async (req, reply) => {
      const { serverId, userId } = req.params as { serverId: string; userId: string };
      const ctx = await loadServerContext(serverId, req.auth!.user.id);

      // Self can leave; otherwise need server.manage.
      if (userId !== req.auth!.user.id && !ctx.isOwner && !req.auth!.permissions.has("server.manage")) {
        throw new ApiError("RBAC_FORBIDDEN");
      }
      // Can't remove the owner.
      if (userId === ctx.server.ownerId) {
        throw new ApiError("CONFLICT", { internalMessage: "cannot remove owner" });
      }

      await db
        .update(serverMemberships)
        .set({ status: "left", leftAt: new Date(), updatedAt: new Date() })
        .where(
          and(eq(serverMemberships.serverId, serverId), eq(serverMemberships.userId, userId), ne(serverMemberships.status, "left")),
        );

      await app.audit({
        action: "USER_UPDATED",
        targetType: "server_membership",
        targetId: serverId,
        metadata: { event: "left", userId, by: req.auth!.user.id },
        ...clientMeta(req),
        actorUserId: req.auth!.user.id,
      });
      return reply.code(204).send();
    },
  );

  /* ---------- Suspend / activate member ---------- */
  app.patch(
    "/api/v1/servers/:serverId/members/:userId",
    { preHandler: [app.requireAuth(), app.requirePermission("server.manage")] },
    async (req, reply) => {
      const { serverId, userId } = req.params as { serverId: string; userId: string };
      const body = (req.body ?? {}) as { status?: "active" | "suspended" };
      const newStatus = body.status;
      if (newStatus !== "active" && newStatus !== "suspended") {
        throw new ApiError("VALIDATION_FAILED", { internalMessage: "status must be active|suspended" });
      }
      const ctx = await loadServerContext(serverId, req.auth!.user.id);
      if (userId === ctx.server.ownerId) {
        throw new ApiError("CONFLICT", { internalMessage: "cannot suspend owner" });
      }
      await db
        .update(serverMemberships)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(and(eq(serverMemberships.serverId, serverId), eq(serverMemberships.userId, userId)));
      await app.audit({
        action: "USER_UPDATED",
        targetType: "server_membership",
        targetId: serverId,
        metadata: { event: "status_change", userId, newStatus, by: req.auth!.user.id },
        ...clientMeta(req),
        actorUserId: req.auth!.user.id,
      });
      return reply.code(200).send({ data: { userId, status: newStatus } });
    },
  );
}

function serializeServer(row: typeof servers.$inferSelect, isOwner: boolean) {
  return {
    id: row.serverId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    robloxPlaceId: row.robloxPlaceId,
    robloxUniverseId: row.robloxUniverseId,
    ownerId: row.ownerId,
    status: row.status,
    isOwner,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
