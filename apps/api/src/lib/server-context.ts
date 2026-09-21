/**
 * Westside — server-context helpers.
 *
 * Phase 2 introduces the `server` concept. Most Phase 2 endpoints are scoped
 * to a server: `/api/v1/servers/:serverId/personnel/...` etc.
 *
 * Before any server-scoped handler runs, we verify:
 *   1. The server exists and is not archived.
 *   2. The caller is a member of the server (status='active').
 *
 * Returns the membership row if checks pass; throws RBAC_FORBIDDEN otherwise.
 *
 * NOTE: Owner of the server is always considered a member, even without an
 * explicit membership row. (The seed auto-creates one anyway.)
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@westside/database/client";
import { serverMemberships, servers } from "@westside/database";
import { ApiError } from "./error.ts";

export interface ServerContext {
  serverId: string;
  server: typeof servers.$inferSelect;
  membership: typeof serverMemberships.$inferSelect | null;
  isOwner: boolean;
}

export async function loadServerContext(
  serverId: string,
  userId: string,
): Promise<ServerContext> {
  const [server] = await db
    .select()
    .from(servers)
    .where(and(eq(servers.serverId, serverId), isNull(servers.deletedAt)))
    .limit(1);

  if (!server) throw new ApiError("NOT_FOUND");

  const isOwner = server.ownerId === userId;

  const [membership] = await db
    .select()
    .from(serverMemberships)
    .where(
      and(
        eq(serverMemberships.serverId, serverId),
        eq(serverMemberships.userId, userId),
        eq(serverMemberships.status, "active"),
      ),
    )
    .limit(1);

  if (!isOwner && !membership) {
    throw new ApiError("RBAC_FORBIDDEN", {
      internalMessage: `User ${userId} not a member of server ${serverId}`,
    });
  }

  return { serverId, server, membership, isOwner };
}
