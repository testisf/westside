/**
 * Westside — API key management.
 *
 * API keys are 32-byte random values, base64url-encoded, prefixed with "wsk_"
 * for visual identification. Stored only as their SHA-256 hash. The raw key
 * is returned to the caller exactly once on creation.
 *
 *   GET    /api/v1/api-keys
 *   POST   /api/v1/api-keys
 *   DELETE /api/v1/api-keys/:id          (revoke)
 *   POST   /api/v1/api-keys/:id/rotate
 */

import type { FastifyInstance } from "fastify";
import { randomBytes, createHash } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@westside/database/client";
import { apiKeys } from "@westside/database";
import type { AppConfig } from "../../config/index.ts";
import { createApiKeySchema } from "../../schemas/index.ts";
import { ApiError } from "../../lib/error.ts";
import { clientMeta } from "../../plugins/audit.ts";

const KEY_PREFIX = "wsk_";

function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const bytes = randomBytes(32);
  const raw = `${KEY_PREFIX}${bytes.toString("base64url")}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  // Show first 12 chars (after prefix) in the UI for identification.
  const prefix = raw.slice(0, KEY_PREFIX.length + 8);
  return { raw, hash, prefix };
}

export default async function apiKeyRoutes(app: FastifyInstance, _opts: { config: AppConfig }) {
  /* ---------- List (own keys) ---------- */
  app.get(
    "/api/v1/api-keys",
    { preHandler: [app.requireAuth(), app.requirePermission("apikey.view")] },
    async (req, reply) => {
      const rows = await db
        .select({
          id: apiKeys.keyId,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          scopes: apiKeys.scopes,
          expiresAt: apiKeys.expiresAt,
          lastUsedAt: apiKeys.lastUsedAt,
          revokedAt: apiKeys.revokedAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.ownerUserId, req.auth!.user.id))
        .orderBy(desc(apiKeys.createdAt));
      return reply.code(200).send({
        data: rows.map((r) => ({
          ...r,
          expiresAt: r.expiresAt?.toISOString() ?? null,
          lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
          revokedAt: r.revokedAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    },
  );

  /* ---------- Create ---------- */
  app.post(
    "/api/v1/api-keys",
    { preHandler: [app.requireAuth(), app.requirePermission("apikey.create")] },
    async (req, reply) => {
      const body = createApiKeySchema.parse(req.body);
      const { raw, hash, prefix } = generateApiKey();
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      if (expiresAt && expiresAt <= new Date()) {
        throw new ApiError("VALIDATION_FAILED", { internalMessage: "expiresAt must be in the future" });
      }
      const [row] = await db
        .insert(apiKeys)
        .values({
          name: body.name,
          ownerUserId: req.auth!.user.id,
          keyPrefix: prefix,
          hash,
          scopes: body.scopes,
          expiresAt,
        })
        .returning({ keyId: apiKeys.keyId });

      await app.audit({
        action: "APIKEY_CREATED",
        targetType: "api_key",
        targetId: row.keyId,
        metadata: { name: body.name, scopes: body.scopes, prefix },
        ...clientMeta(req),
        actorUserId: req.auth!.user.id,
      });

      return reply.code(201).send({
        data: {
          id: row.keyId,
          name: body.name,
          keyPrefix: prefix,
          scopes: body.scopes,
          expiresAt: expiresAt?.toISOString() ?? null,
          // ⚠ Returned exactly once. Client must store immediately.
          secret: raw,
        },
      });
    },
  );

  /* ---------- Revoke ---------- */
  app.delete(
    "/api/v1/api-keys/:id",
    { preHandler: [app.requireAuth(), app.requirePermission("apikey.revoke")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [row] = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.keyId, id), eq(apiKeys.ownerUserId, req.auth!.user.id)))
        .limit(1);
      if (!row) throw new ApiError("NOT_FOUND");
      if (row.revokedAt) {
        return reply.code(204).send(); // idempotent
      }
      await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.keyId, id));
      await app.audit({
        action: "APIKEY_REVOKED",
        targetType: "api_key",
        targetId: id,
        ...clientMeta(req),
        actorUserId: req.auth!.user.id,
      });
      return reply.code(204).send();
    },
  );

  /* ---------- Rotate ---------- */
  app.post(
    "/api/v1/api-keys/:id/rotate",
    { preHandler: [app.requireAuth(), app.requirePermission("apikey.rotate")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const [row] = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.keyId, id), eq(apiKeys.ownerUserId, req.auth!.user.id), isNull(apiKeys.revokedAt)))
        .limit(1);
      if (!row) throw new ApiError("NOT_FOUND");

      const { raw, hash, prefix } = generateApiKey();
      await db
        .update(apiKeys)
        .set({ hash, keyPrefix: prefix, updatedAt: new Date() })
        .where(eq(apiKeys.keyId, id));

      await app.audit({
        action: "APIKEY_ROTATED",
        targetType: "api_key",
        targetId: id,
        metadata: { prefix },
        ...clientMeta(req),
        actorUserId: req.auth!.user.id,
      });

      return reply.code(200).send({
        data: {
          id,
          keyPrefix: prefix,
          // ⚠ Returned exactly once.
          secret: raw,
        },
      });
    },
  );
}
