/**
 * Westside — RBAC routes (roles + permissions read endpoints).
 *   GET /api/v1/roles
 *   GET /api/v1/permissions
 */

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "@westside/database/client";
import { rolePermissions, roles, permissions } from "@westside/database";
import type { AppConfig } from "../../config/index.ts";

export default async function rbacRoutes(app: FastifyInstance, _opts: { config: AppConfig }) {
  app.get("/api/v1/roles", { preHandler: [app.requireAuth(), app.requirePermission("role.view")] }, async (_req, reply) => {
    const rows = await db
      .select({
        roleId: roles.roleId,
        name: roles.name,
        description: roles.description,
        isSystem: roles.isSystem,
      })
      .from(roles)
      .orderBy(roles.name);

    // Hydrate with permissions.
    const out = [];
    for (const r of rows) {
      const perms = await db
        .select({ name: permissions.name })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.permissionId))
        .where(eq(rolePermissions.roleId, r.roleId));
      out.push({
        id: r.roleId,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        permissions: perms.map((p) => p.name),
      });
    }
    return reply.code(200).send({ data: out });
  });

  app.get(
    "/api/v1/permissions",
    { preHandler: [app.requireAuth(), app.requirePermission("role.view")] },
    async (_req, reply) => {
      const rows = await db
        .select({
          id: permissions.permissionId,
          name: permissions.name,
          description: permissions.description,
          category: permissions.category,
        })
        .from(permissions)
        .orderBy(permissions.category, permissions.name);
      return reply.code(200).send({ data: rows });
    },
  );
}
