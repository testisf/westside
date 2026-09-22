/**
 * Westside — migration runner.
 *
 * Drizzle generates SQL files in `migrations/`. This script applies them
 * forward-only, tracking applied migrations in the drizzle metadata table.
 *
 * Usage:
 *   pnpm db:migrate
 */

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  options: "application_name=westside-migrator",
} as postgres.Options<{}>);

// Fix Windows path: use fileURLToPath + dirname instead of URL.pathname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = __dirname;

async function main() {
  // Ensure migrations tracking table exists.
  await sql`CREATE TABLE IF NOT EXISTS _westside_migrations (
    id serial primary key,
    filename text not null unique,
    applied_at timestamptz not null default now()
  )`;

  const applied = await sql`SELECT filename FROM _westside_migrations ORDER BY filename`;
  const appliedSet = new Set(applied.map((r) => r.filename));

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("ℹ️  No migration files found. Generating initial schema via drizzle-kit generate first.");
  }

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`✓ already applied: ${file}`);
      continue;
    }
    const path = join(MIGRATIONS_DIR, file);
    const raw = await readFile(path, "utf8");
    console.log(`→ applying: ${file}`);
    await sql.unsafe(raw);
    await sql`INSERT INTO _westside_migrations (filename) VALUES (${file})`;
    console.log(`✓ applied: ${file}`);
  }
  console.log("✓ migrations complete");
}

main()
  .catch((err) => {
    console.error("✗ migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
