/**
 * Westside — seed.
 *
 * Creates:
 *   - All permission rows (from @westside/shared catalog)
 *   - All system role rows (from @westside/shared catalog)
 *   - role_permissions rows linking system roles to their default permissions
 *   - OWNER role is granted every permission in the catalog
 *   - A bootstrap OWNER account (env-configurable)
 *
 * Idempotent: safe to re-run.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from "@westside/shared";
import argon2 from "argon2";

import {
  permissions,
  roles,
  rolePermissions,
  users,
  userRoles,
  servers,
  serverMemberships,
} from "../schema.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1, idle_timeout: 5 });
const db = drizzle(sql, {
  schema: { permissions, roles, rolePermissions, users, userRoles, servers, serverMemberships },
});

function permissionCategory(name: string): string {
  return name.split(".")[0] ?? "misc";
}

async function main() {
  console.log("→ seeding permissions…");
  for (const name of PERMISSIONS) {
    const [row] = await sql`
      INSERT INTO permissions (name, description, category)
      VALUES (${name}, ${null}, ${permissionCategory(name)})
      ON CONFLICT (name) DO UPDATE SET category = EXCLUDED.category
      RETURNING permission_id
    `;
    if (!row) throw new Error(`Failed to upsert permission: ${name}`);
  }
  console.log(`  ✓ ${PERMISSIONS.length} permissions ensured`);

  console.log("→ seeding system roles…");
  for (const [roleName, perms] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
    const [row] = await sql`
      INSERT INTO roles (name, description, is_system)
      VALUES (${roleName}, ${`System role: ${roleName}`}, true)
      ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, is_system = true
      RETURNING role_id
    `;
    const roleId = row.role_id;

    // For OWNER, grant every permission.
    const permList = roleName === "OWNER" ? PERMISSIONS : perms;
    for (const permName of permList) {
      await sql`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT ${roleId}, permission_id FROM permissions WHERE name = ${permName}
        ON CONFLICT DO NOTHING
      `;
    }
    console.log(`  ✓ role ${roleName}: ${permList.length} permissions`);
  }

  console.log("→ seeding bootstrap OWNER account…");
  const ownerEmail = process.env.BOOTSTRAP_OWNER_EMAIL ?? "owner@westside.local";
  const ownerUsername = process.env.BOOTSTRAP_OWNER_USERNAME ?? "owner";
  const ownerPassword = process.env.BOOTSTRAP_OWNER_PASSWORD ?? "ChangeMe!Strong-Password-2026";

  const argon2Params = JSON.stringify({
    type: argon2.argon2id,
    memoryCost: Number(process.env.ARGON2_MEMORY_KIB ?? 65536),
    timeCost: Number(process.env.ARGON2_TIME_COST ?? 3),
    parallelism: Number(process.env.ARGON2_PARALLELISM ?? 4),
  });

  const passwordHash = await argon2.hash(ownerPassword, {
    type: argon2.argon2id,
    memoryCost: Number(process.env.ARGON2_MEMORY_KIB ?? 65536),
    timeCost: Number(process.env.ARGON2_TIME_COST ?? 3),
    parallelism: Number(process.env.ARGON2_PARALLELISM ?? 4),
  });

  const [ownerRow] = await sql`
    INSERT INTO users (email, username, password_hash, argon2_params, status, email_verified_at)
    VALUES (${ownerEmail}, ${ownerUsername}, ${passwordHash}, ${argon2Params}, 'active', now())
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      argon2_params = EXCLUDED.argon2_params,
      status = 'active',
      email_verified_at = now()
    RETURNING user_id
  `;
  const ownerUserId = ownerRow.user_id;

  const [ownerRoleRow] = await sql`SELECT role_id FROM roles WHERE name = 'OWNER' LIMIT 1`;
  await sql`
    INSERT INTO user_roles (user_id, role_id)
    VALUES (${ownerUserId}, ${ownerRoleRow.role_id})
    ON CONFLICT DO NOTHING
  `;

  console.log(`  ✓ OWNER account ready: ${ownerEmail} / ${ownerUsername}`);

  // Seed a default server owned by the bootstrap OWNER.
  const [serverRow] = await sql`
    INSERT INTO servers (name, slug, description, owner_id, status)
    VALUES ('Westside Community', 'westside', 'Default Westside community server', ${ownerUserId}, 'active')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, owner_id = EXCLUDED.owner_id
    RETURNING server_id
  `;
  const serverId = serverRow.server_id;

  await sql`
    INSERT INTO server_memberships (server_id, user_id, status)
    VALUES (${serverId}, ${ownerUserId}, 'active')
    ON CONFLICT (server_id, user_id) DO UPDATE SET status = 'active', left_at = null
  `;
  console.log(`  ✓ Default server ready: westside (id=${serverId})`);

  console.log("✓ seed complete");
}

main()
  .catch((err) => {
    console.error("✗ seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
