/**
 * Westside — system roles.
 *
 * System roles are seeded into the database on first run and cannot be deleted.
 * They can be edited (description only) but their permission grants are managed
 * via the admin UI / API — never assume a role name implies a permission set.
 *
 * Custom roles can be created by SERVER_ADMIN+ users.
 */

import type { Permission } from "./permissions.js";

export const ROLE_NAMES = [
  "USER",
  "OFFICER",
  "DISPATCHER",
  "SUPERVISOR",
  "DEPARTMENT_ADMIN",
  "SERVER_ADMIN",
  "OWNER",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

/**
 * Default permission grants per system role.
 * These are applied on seed; admins may modify afterwards.
 * This map is intentionally conservative — additional permissions
 * should be granted explicitly per community policy.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  USER: [
    "auth.refresh",
    "auth.logout",
    "auth.session.view",
    "auth.session.revoke",
    "auth.password.change",
    "auth.mfa.enable",
    "auth.mfa.disable",
    "notification.view",
    "notification.dismiss",
  ],

  OFFICER: [
    "auth.refresh",
    "auth.logout",
    "auth.session.view",
    "auth.session.revoke",
    "auth.password.change",
    "auth.mfa.enable",
    "auth.mfa.disable",
    "server.view",
    "personnel.view",
    "notification.view",
    "notification.dismiss",
  ],

  DISPATCHER: [
    "auth.refresh",
    "auth.logout",
    "auth.session.view",
    "auth.session.revoke",
    "auth.password.change",
    "auth.mfa.enable",
    "auth.mfa.disable",
    "server.view",
    "personnel.view",
    "vehicle.view",
    "vehicle.create",
    "notification.view",
    "notification.dismiss",
  ],

  SUPERVISOR: [
    "auth.refresh",
    "auth.logout",
    "auth.session.view",
    "auth.session.revoke",
    "auth.password.change",
    "auth.mfa.enable",
    "auth.mfa.disable",
    "server.view",
    "personnel.view",
    "personnel.create",
    "personnel.update",
    "vehicle.view",
    "vehicle.create",
    "vehicle.update",
    "notification.view",
    "notification.dismiss",
  ],

  DEPARTMENT_ADMIN: [
    "auth.refresh",
    "auth.logout",
    "auth.session.view",
    "auth.session.revoke",
    "auth.password.change",
    "auth.mfa.enable",
    "auth.mfa.disable",
    "server.view",
    "server.update",
    "server.manage",
    "personnel.view",
    "personnel.create",
    "personnel.update",
    "personnel.delete",
    "vehicle.view",
    "vehicle.create",
    "vehicle.update",
    "vehicle.delete",
    "audit.view",
    "notification.view",
    "notification.dismiss",
  ],

  SERVER_ADMIN: [
    "auth.refresh",
    "auth.logout",
    "auth.session.view",
    "auth.session.revoke",
    "auth.password.change",
    "auth.mfa.enable",
    "auth.mfa.disable",
    "server.view",
    "server.create",
    "server.update",
    "server.delete",
    "server.manage",
    "personnel.view",
    "personnel.create",
    "personnel.update",
    "personnel.delete",
    "vehicle.view",
    "vehicle.create",
    "vehicle.update",
    "vehicle.delete",
    "user.view",
    "user.view.all",
    "user.create",
    "user.update",
    "user.disable",
    "user.delete",
    "role.view",
    "role.create",
    "role.update",
    "role.delete",
    "role.assign",
    "role.revoke",
    "apikey.view",
    "apikey.create",
    "apikey.revoke",
    "apikey.rotate",
    "audit.view",
    "security.view",
    "integration.view",
    "integration.manage",
    "server_admin.manage",
    "notification.view",
    "notification.dismiss",
  ],

  OWNER: [
    // OWNER inherits every permission in the catalog.
    // Seeding code expands this to PERMISSIONS at runtime so it auto-stays
    // in sync as new permissions are added.
  ],
};
