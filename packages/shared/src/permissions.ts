/**
 * Westside — granular permission catalog.
 *
 * Permissions are the atomic unit of authorization. Roles bundle permissions,
 * but the API always checks the permission, never the role name.
 *
 * Naming convention: <domain>.<action>
 *   - domains: auth, user, role, cad, mdt, radio, records, vehicle,
 *              bolo, warrant, department, server, audit, security, apikey, integration
 *   - actions: use, view, create, update, delete, manage, assign, revoke, dispatch
 *
 * Add new permissions here. The DB seeds from this file so that the catalog
 * stays in sync with the code.
 */

export const PERMISSIONS = [
  // Auth / self
  "auth.refresh",
  "auth.logout",
  "auth.session.view",
  "auth.session.revoke",
  "auth.password.change",
  "auth.mfa.enable",
  "auth.mfa.disable",

  // User management
  "user.view",
  "user.view.all",
  "user.create",
  "user.update",
  "user.disable",
  "user.delete",

  // Role management
  "role.view",
  "role.create",
  "role.update",
  "role.delete",
  "role.assign",
  "role.revoke",

  // Department
  "department.view",
  "department.create",
  "department.update",
  "department.delete",
  "department.manage",

  // Server
  "server.view",
  "server.create",
  "server.update",
  "server.delete",
  "server.manage",

  // Unit
  "unit.view",
  "unit.create",
  "unit.update",
  "unit.delete",
  "unit.assign",
  "unit.status.update",

  // Personnel (Phase 2)
  "personnel.view",
  "personnel.create",
  "personnel.update",
  "personnel.delete",

  // CAD
  "cad.view",
  "cad.create_call",
  "cad.update_call",
  "cad.assign_unit",
  "cad.close_call",
  "cad.reopen_call",
  "cad.add_note",

  // MDT
  "mdt.use",
  "mdt.search",

  // Records
  "records.view",
  "records.create",
  "records.update",
  "records.delete",

  // Vehicles
  "vehicle.view",
  "vehicle.create",
  "vehicle.update",
  "vehicle.delete",

  // BOLOs
  "bolo.view",
  "bolo.create",
  "bolo.update",
  "bolo.delete",

  // Warrants
  "warrant.view",
  "warrant.create",
  "warrant.update",
  "warrant.delete",

  // Radio
  "radio.use",
  "radio.dispatch",
  "radio.priority",
  "radio.channel.join",
  "radio.channel.leave",
  "radio.channel.manage",
  "radio.ptt",

  // Notifications
  "notification.view",
  "notification.dismiss",

  // API keys
  "apikey.view",
  "apikey.create",
  "apikey.revoke",
  "apikey.rotate",

  // Admin / security
  "audit.view",
  "security.view",
  "integration.view",
  "integration.manage",
  "server_admin.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_SET: ReadonlySet<Permission> = new Set(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value as Permission);
}
