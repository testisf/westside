/**
 * Westside — Vehicles API module (server-scoped).
 *
 *   GET    /api/v1/servers/:serverId/vehicles
 *   POST   /api/v1/servers/:serverId/vehicles
 *   GET    /api/v1/servers/:serverId/vehicles/:id
 *   PATCH  /api/v1/servers/:serverId/vehicles/:id
 *   DELETE /api/v1/servers/:serverId/vehicles/:id
 */

import type { FastifyInstance } from "fastify";
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@westside/database/client";
import { vehicles } from "@westside/database";
import type { AppConfig } from "../../config/index.ts";
import { createVehicleSchema, updateVehicleSchema } from "../../schemas/index.ts";
import { ApiError } from "../../lib/error.ts";
import { clientMeta } from "../../plugins/audit.ts";
import { loadServerContext } from "../../lib/server-context.ts";

export default async function vehicleRoutes(app: FastifyInstance, _opts: { config: AppConfig }) {
  /* ---------- List ---------- */
  app.get(
    "/api/v1/servers/:serverId/vehicles",
    { preHandler: [app.requireAuth(), app.requirePermission("vehicle.view")] },
    async (req, reply) => {
      const { serverId } = req.params as { serverId: string };
      await loadServerContext(serverId, req.auth!.user.id);

      const q = (req.query ?? {}) as { search?: string };
      const search = q.search?.trim();
      const rows = await db
        .select()
        .from(vehicles)
        .where(
          and(
            eq(vehicles.serverId, serverId),
            isNull(vehicles.deletedAt),
            search
              ? or(ilike(vehicles.plate, `%${search}%`), ilike(vehicles.make, `%${search}%`), ilike(vehicles.model, `%${search}%`))
              : undefined,
          ),
        );
      return reply.code(200).send({
        data: rows.map((r) => ({
          id: r.vehicleId,
          plate: r.plate,
          make: r.make,
          model: r.model,
          year: r.year,
          color: r.color,
          category: r.category,
          status: r.status,
          assignedPersonnelId: r.assignedPersonnelId,
          notes: r.notes,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      });
    },
  );

  /* ---------- Create ---------- */
  app.post(
    "/api/v1/servers/:serverId/vehicles",
    { preHandler: [app.requireAuth(), app.requirePermission("vehicle.create")] },
    async (req, reply) => {
      const { serverId } = req.params as { serverId: string };
      await loadServerContext(serverId, req.auth!.user.id);
      const body = createVehicleSchema.parse(req.body);
      try {
        const [row] = await db
          .insert(vehicles)
          .values({
            serverId,
            plate: body.plate.toUpperCase(),
            make: body.make ?? null,
            model: body.model ?? null,
            year: body.year ?? null,
            color: body.color ?? null,
            category: body.category ?? null,
            notes: body.notes ?? null,
          })
          .returning();
        await app.audit({
          action: "USER_UPDATED",
          targetType: "vehicle",
          targetId: row.vehicleId,
          metadata: { serverId, plate: body.plate },
          ...clientMeta(req),
          actorUserId: req.auth!.user.id,
        });
        return reply.code(201).send({ data: { id: row.vehicleId } });
      } catch (err: any) {
        if (err?.code === "23505") {
          throw new ApiError("CONFLICT", { internalMessage: "plate already exists on this server" });
        }
        throw err;
      }
    },
  );

  /* ---------- Get one ---------- */
  app.get(
    "/api/v1/servers/:serverId/vehicles/:id",
    { preHandler: [app.requireAuth(), app.requirePermission("vehicle.view")] },
    async (req, reply) => {
      const { serverId, id } = req.params as { serverId: string; id: string };
      await loadServerContext(serverId, req.auth!.user.id);
      const [row] = await db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.vehicleId, id), eq(vehicles.serverId, serverId), isNull(vehicles.deletedAt)))
        .limit(1);
      if (!row) throw new ApiError("NOT_FOUND");
      return reply.code(200).send({
        data: {
          id: row.vehicleId,
          plate: row.plate,
          make: row.make,
          model: row.model,
          year: row.year,
          color: row.color,
          category: row.category,
          status: row.status,
          assignedPersonnelId: row.assignedPersonnelId,
          notes: row.notes,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        },
      });
    },
  );

  /* ---------- Update ---------- */
  app.patch(
    "/api/v1/servers/:serverId/vehicles/:id",
    { preHandler: [app.requireAuth(), app.requirePermission("vehicle.update")] },
    async (req, reply) => {
      const { serverId, id } = req.params as { serverId: string; id: string };
      const body = updateVehicleSchema.parse(req.body);
      const [updated] = await db
        .update(vehicles)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(vehicles.vehicleId, id), eq(vehicles.serverId, serverId), isNull(vehicles.deletedAt)))
        .returning();
      if (!updated) throw new ApiError("NOT_FOUND");
      await app.audit({
        action: "USER_UPDATED",
        targetType: "vehicle",
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
    "/api/v1/servers/:serverId/vehicles/:id",
    { preHandler: [app.requireAuth(), app.requirePermission("vehicle.delete")] },
    async (req, reply) => {
      const { serverId, id } = req.params as { serverId: string; id: string };
      await db
        .update(vehicles)
        .set({ deletedAt: new Date(), status: "retired", updatedAt: new Date() })
        .where(and(eq(vehicles.vehicleId, id), eq(vehicles.serverId, serverId)));
      await app.audit({
        action: "USER_UPDATED",
        targetType: "vehicle",
        targetId: id,
        metadata: { event: "deleted" },
        ...clientMeta(req),
        actorUserId: req.auth!.user.id,
      });
      return reply.code(204).send();
    },
  );
}
