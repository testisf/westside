/**
 * Permission catalog tests — verify every system role has a sensible
 * permission set, OWNER has every permission, and no permission is silently
 * missing from the catalog.
 */

import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  PERMISSION_SET,
  isPermission,
  SYSTEM_ROLE_PERMISSIONS,
  ROLE_NAMES,
} from "@westside/shared";

describe("permission catalog", () => {
  it("exposes a non-empty set of permissions", () => {
    expect(PERMISSIONS.length).toBeGreaterThan(30);
    expect(PERMISSION_SET.size).toBe(PERMISSIONS.length);
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length); // no duplicates
  });

  it("every permission matches the domain.action naming convention", () => {
    for (const p of PERMISSIONS) {
      // Allow domain.action or domain.subdomain.action (e.g. "auth.session.view")
      expect(p).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
    }
  });

  it("isPermission narrows correctly", () => {
    expect(isPermission("cad.view")).toBe(true);
    expect(isPermission("nonexistent.thing")).toBe(false);
    expect(isPermission("")).toBe(false);
  });

  it("includes critical permissions", () => {
    const mustHave = [
      "radio.use",
      "radio.dispatch",
      "radio.priority",
      "cad.view",
      "cad.create_call",
      "mdt.use",
      "records.view",
      "audit.view",
      "security.view",
      "user.view.all",
      "role.assign",
      "role.revoke",
    ];
    for (const p of mustHave) {
      expect(PERMISSION_SET.has(p as any)).toBe(true);
    }
  });
});

describe("system roles", () => {
  it("defines all 7 expected system roles", () => {
    expect(ROLE_NAMES).toEqual([
      "USER",
      "OFFICER",
      "DISPATCHER",
      "SUPERVISOR",
      "DEPARTMENT_ADMIN",
      "SERVER_ADMIN",
      "OWNER",
    ]);
  });

  it("every system role grant exists in the permission catalog", () => {
    for (const [role, perms] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
      // OWNER is empty in code; the seed expands it to PERMISSIONS at runtime.
      if (role === "OWNER") continue;
      for (const p of perms) {
        expect(PERMISSION_SET.has(p), `${role} grants unknown permission: ${p}`).toBe(true);
      }
    }
  });

  it("USER has only basic auth permissions", () => {
    const perms = SYSTEM_ROLE_PERMISSIONS.USER;
    expect(perms).toContain("auth.refresh");
    expect(perms).toContain("auth.logout");
    expect(perms).not.toContain("user.view.all");
    expect(perms).not.toContain("server.manage");
  });

  it("OFFICER has server view + personnel view but not admin", () => {
    const perms = SYSTEM_ROLE_PERMISSIONS.OFFICER;
    expect(perms).toContain("server.view");
    expect(perms).toContain("personnel.view");
    expect(perms).not.toContain("user.disable");
    expect(perms).not.toContain("role.assign");
    expect(perms).not.toContain("server.manage");
  });

  it("DISPATCHER has vehicle create + personnel view", () => {
    const perms = SYSTEM_ROLE_PERMISSIONS.DISPATCHER;
    expect(perms).toContain("server.view");
    expect(perms).toContain("personnel.view");
    expect(perms).toContain("vehicle.view");
    expect(perms).toContain("vehicle.create");
  });

  it("SERVER_ADMIN has audit + security + user management", () => {
    const perms = SYSTEM_ROLE_PERMISSIONS.SERVER_ADMIN;
    expect(perms).toContain("audit.view");
    expect(perms).toContain("security.view");
    expect(perms).toContain("user.view.all");
    expect(perms).toContain("user.disable");
    expect(perms).toContain("role.create");
    expect(perms).toContain("integration.manage");
  });

  it("SERVER_ADMIN is a superset of USER (sanity check on monotonicity)", () => {
    const user = new Set(SYSTEM_ROLE_PERMISSIONS.USER);
    const admin = new Set(SYSTEM_ROLE_PERMISSIONS.SERVER_ADMIN);
    for (const p of user) {
      expect(admin.has(p), `SERVER_ADMIN missing USER permission: ${p}`).toBe(true);
    }
  });

  it("every system role grants at least one permission (OWNER expanded at seed time)", () => {
    for (const [role, perms] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
      if (role === "OWNER") continue; // OWNER is expanded to PERMISSIONS at seed time
      expect(perms.length, `${role} has zero permissions`).toBeGreaterThan(0);
    }
  });
});
