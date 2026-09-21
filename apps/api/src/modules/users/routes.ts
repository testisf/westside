/**
 * Westside — user-management routes.
 *   GET    /api/v1/users
 *   GET    /api/v1/users/:id
 *   PATCH  /api/v1/users/:id
 *   POST   /api/v1/users/:id/roles
 *   DELETE /api/v1/users/:id/roles/:roleId
 */

import type { FastifyInstance } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@westside/database/client";
import { roles, userRoles, users } from "@westside/database";
import type { AppConfig } from "../../config/index.ts";
import { assignRoleSchema, updateUserSchema } from "../../schemas/index.ts";
import { ApiError } from "../../lib/error.ts";
import { clientMeta } from "../../plugins/audit.ts";

export default async function userRoutes(app: FastifyInstance, _opts: { config: AppConfig }) {
  /* ---------- List users (paginated; admin only) ---------- */
  app.get(
    "/api/v1/users",
    { preHandler: [app.requireAuth(), app.requirePermission("user.view.all")] },
    async (req, reply) => {
      const q = (req.query ?? {}) as { limit?: string; cursor?: string };
      const limit = Math.min(100, Math.max(1, Number(q.limit ?? 50)));
      const cursor = q.cursor ?? null;
      void cursor; // Phase 2 will wire keyset pagination
      const stmt = db
        .select({
          id: users.userId,
          email: users.email,
          username: users.username,
          status: users.status,
          emailVerified: users.emailVerifiedAt,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(isNull(users.deletedAt))
        .orderBy(users.userId)
        .limit(limit + 1);
      const rows = await stmt;
      let nextCursor: string | null = null;
      if (rows.length > limit) {
        const last = rows.pop()!;
        nextCursor = last.id;
      }
      return reply.code(200).send({
        data: rows.map((r) => ({
          ...r,
          emailVerified: !!r.emailVerified,
          lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        meta: { nextCursor },
      });
    },
  );

  /* ---------- Get one user ---------- */
  app.get(
    "/api/v1/users/:id",
    { preHandler: [app.requireAuth(), app.requirePermission("user.view")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [row] = await db
        .select({
          id: users.userId,
          email: users.email,
          username: users.username,
          status: users.status,
          emailVerified: users.emailVerifiedAt,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(and(eq(users.userId, id), isNull(users.deletedAt)))
        .limit(1);
      if (!row) throw new ApiError("NOT_FOUND");
      // Users can view themselves with user.view; others require user.view.all
      if (row.id !== req.auth!.user.id && !req.auth!.permissions.has("user.view.all")) {
        throw new ApiError("RBAC_FORBIDDEN");
      }
      return reply.code(200).send({
        data: {
          ...row,
          emailVerified: !!row.emailVerified,
          lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        },
      });
    },
  );

  /* ---------- Update user ---------- */
  app.patch(
    "/api/v1/users/:id",
    { preHandler: [app.requireAuth(), app.requirePermission("user.update")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = updateUserSchema.parse(req.body);
      const [updated] = await db
        .update(users)
        .set({ ...(body.displayName ? { displayName: body.displayName } : {}), ...(body.status ? { status: body.status } : {}), updatedAt: new Date() })
        .where(and(eq(users.userId, id), isNull(users.deletedAt)))
        .returning({ userId: users.userId });
      if (!updated) throw new ApiError("NOT_FOUND");

      await app.audit({
        action: "USER_UPDATED",
        targetType: "user",
        targetId: id,
        metadata: body,
        ...clientMeta(req),
      });
      return reply.code(200).send({ data: { id } });
    },
  );

  /* ---------- Assign role ---------- */
  app.post(
    "/api/v1/users/:id/roles",
    { preHandler: [app.requireAuth(), app.requirePermission("role.assign")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = assignRoleSchema.parse(req.body);
      const [role] = await db.select().from(roles).where(eq(roles.roleId, body.roleId)).limit(1);
      if (!role) throw new ApiError("NOT_FOUND");

      await db
        .insert(userRoles)
        .values({ userId: id, roleId: body.roleId, grantedBy: req.auth!.user.id })
        .onConflictDoNothing();

      await app.audit({
        action: "ROLE_ASSIGNED",
        targetType: "user",
        targetId: id,
        metadata: { roleId: body.roleId, roleName: role.name },
        ...clientMeta(req),
        actorUserId: req.auth!.user.id,
      });
      return reply.code(201).send({ data: { userId: id, roleId: body.roleId } });
    },
  );

  /* ---------- Revoke role ---------- */
  app.delete(
    "/api/v1/users/:id/roles/:roleId",
    { preHandler: [app.requireAuth(), app.requirePermission("role.revoke")] },
    async (req, reply) => {
      const { id, roleId } = req.params as { id: string; roleId: string };
      await db
        .update(userRoles)
        .set({ revokedAt: new Date() })
        .where(and(eq(userRoles.userId, id), eq(userRoles.roleId, roleId)));
      await app.audit({
        action: "ROLE_REVOKED",
        targetType: "user",
        targetId: id,
        metadata: { roleId },
        ...clientMeta(req),
        actorUserId: req.auth!.user.id,
      });
      return reply.code(204).send();
    },
  );
}
