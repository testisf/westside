/**
 * Westside — Drizzle DB client.
 *
 * Single shared connection pool for the API process. Connection settings are
 * tuned for a small Fastify app behind Postgres 16:
 *   - pool max = 10 (API is horizontally scalable; per-instance pool stays small)
 *   - statement_timeout = 30s (defends against runaway queries)
 *   - idle_timeout = 20s (returns idle conns to PG)
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set.");
}

// Don't log the connection string — it contains a password.
export const client = postgres(url, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Statement-level safety: any single query that runs longer than 30s
  // is killed server-side. This protects the API from runaway queries
  // even if the client doesn't time out.
  // (postgres-js passes `options` through to Postgres as command-line options.)
  options: "statement_timeout=30000 application_name=westside-api",
  // Never prepare with parameters that contain user input; drizzle uses
  // parameterized queries by default.
  prepare: false,
} as postgres.Options<{}>);

export const db = drizzle(client, { schema, logger: process.env.LOG_LEVEL === "trace" });

export type Db = typeof db;

export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}

export { schema };
