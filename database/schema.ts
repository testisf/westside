/**
 * Westside — canonical Drizzle schema.
 *
 * Conventions:
 *  - UUID v7 for primary keys (time-ordered → btree-friendly).
 *  - TIMESTAMPTZ everywhere, stored UTC.
 *  - citext for case-insensitive uniqueness (email, username).
 *  - Append-only tables (audit_logs, security_events) cannot be updated or
 *    deleted by the app role; only an `audit_writer` role can insert.
 *  - Every FK column has an index.
 *  - Every column used in WHERE / ORDER BY of hot queries has an index.
 *
 * IMPORTANT: This file is the source of truth. Migrations are generated from
 * it via `pnpm db:generate`. Do NOT hand-edit generated SQL.
 */

import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* ---------- citext (case-insensitive text) ---------- */
// Drizzle's pg-core doesn't expose citext directly, so we declare it via
// customType. At the SQL level it's a citext column; in TS it's a string.
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

/* ---------- enums ---------- */

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "disabled",
  "locked",
  "pending",
]);

export const auditActionEnum = pgEnum("audit_action", [
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DISABLED",
  "USER_ENABLED",
  "USER_DELETED",
  "ROLE_ASSIGNED",
  "ROLE_REVOKED",
  "PERMISSION_GRANTED",
  "PERMISSION_REVOKED",
  "DEPARTMENT_CREATED",
  "DEPARTMENT_UPDATED",
  "DEPARTMENT_DELETED",
  "APIKEY_CREATED",
  "APIKEY_REVOKED",
  "APIKEY_ROTATED",
  "SESSION_REVOKED",
  "SESSION_REVOKED_ALL",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "EMAIL_VERIFIED",
  "MFA_ENABLED",
  "MFA_DISABLED",
  "ADMIN_CONFIG_CHANGED",
  "CAD_CALL_CREATED",
  "CAD_CALL_UPDATED",
  "CAD_CALL_CLOSED",
  "CAD_CALL_REOPENED",
]);

export const securityEventTypeEnum = pgEnum("security_event_type", [
  "FAILED_LOGIN",
  "RATE_LIMITED",
  "SUSPICIOUS_REQUEST",
  "REFRESH_REUSE",
  "RECURRING_LOCKOUT",
  "ACCOUNT_LOCKED",
  "TOKEN_REVOKED",
  "PERMISSION_DENIED",
  "ORIGIN_MISMATCH",
  "USER_AGENT_CHANGE",
]);

export const securityEventSeverityEnum = pgEnum("security_event_severity", [
  "info",
  "warn",
  "critical",
]);

/* ---------- users ---------- */

export const users = pgTable(
  "users",
  {
    userId: uuid("user_id").primaryKey().defaultRandom(),
    email: citext("email").notNull().unique(),
    username: citext("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    argon2Params: text("argon2_params").notNull(), // serialized; lets us rehash on policy bump
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
    mfaSecretEncrypted: text("mfa_secret_encrypted"),
    status: userStatusEnum("status").notNull().default("pending"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
    lastLoginIp: varchar("last_login_ip", { length: 45 }),
    displayName: varchar("display_name", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    statusIdx: index("users_status_idx").on(t.status),
    createdAtIdx: index("users_created_at_idx").on(t.createdAt),
  }),
);

/* ---------- email verification tokens ---------- */

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    tokenId: uuid("token_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    hash: text("hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("email_ver_tokens_user_idx").on(t.userId),
  }),
);

/* ---------- password reset tokens ---------- */

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    tokenId: uuid("token_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    hash: text("hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("pw_reset_tokens_user_idx").on(t.userId),
  }),
);

/* ---------- devices ---------- */

export const devices = pgTable(
  "devices",
  {
    deviceId: uuid("device_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }),
    platform: varchar("platform", { length: 60 }),
    fingerprint: text("fingerprint").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    userIdx: index("devices_user_idx").on(t.userId),
    uniqFp: unique("devices_user_fingerprint_uniq").on(t.userId, t.fingerprint),
  }),
);

/* ---------- refresh tokens (rotating, family-tracked) ---------- */

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    tokenId: uuid("token_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    hash: text("hash").notNull().unique(),
    deviceId: uuid("device_id").references(() => devices.deviceId, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("refresh_tokens_user_idx").on(t.userId),
    familyIdx: index("refresh_tokens_family_idx").on(t.familyId),
  }),
);

/* ---------- sessions ---------- */

export const sessions = pgTable(
  "sessions",
  {
    sessionId: uuid("session_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    refreshTokenId: uuid("refresh_token_id").references(() => refreshTokens.tokenId, {
      onDelete: "set null",
    }),
    deviceId: uuid("device_id").references(() => devices.deviceId, { onDelete: "set null" }),
    ip: varchar("ip", { length: 45 }),
    userAgent: text("user_agent"),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
  }),
);

/* ---------- roles ---------- */

export const roles = pgTable("roles", {
  roleId: uuid("role_id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 60 }).notNull().unique(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/* ---------- permissions ---------- */

export const permissions = pgTable("permissions", {
  permissionId: uuid("permission_id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  description: text("description"),
  category: varchar("category", { length: 40 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/* ---------- role_permissions (M:N) ---------- */

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.roleId, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.permissionId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
    permIdx: index("role_permissions_perm_idx").on(t.permissionId),
  }),
);

/* ---------- user_roles (M:N, with scope) ---------- */

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.roleId, { onDelete: "cascade" }),
    scopeServerId: uuid("scope_server_id"), // nullable → global role
    scopeDepartmentId: uuid("scope_department_id"), // nullable → all departments
    grantedBy: uuid("granted_by").references(() => users.userId, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
    userIdx: index("user_roles_user_idx").on(t.userId),
    roleIdx: index("user_roles_role_idx").on(t.roleId),
  }),
);

/* ---------- api_keys ---------- */

export const apiKeys = pgTable(
  "api_keys",
  {
    keyId: uuid("key_id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    hash: text("hash").notNull().unique(),
    scopes: text("scopes").array().notNull().default([]),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("api_keys_owner_idx").on(t.ownerUserId),
    hashIdx: index("api_keys_hash_idx").on(t.hash),
  }),
);

/* ---------- audit_logs (append-only) ---------- */

export const auditLogs = pgTable(
  "audit_logs",
  {
    logId: bigserial("log_id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.userId, { onDelete: "set null" }),
    action: auditActionEnum("action").notNull(),
    targetType: varchar("target_type", { length: 60 }),
    targetId: varchar("target_id", { length: 64 }),
    metadata: jsonb("metadata").notNull().default({}),
    ip: varchar("ip", { length: 45 }),
    userAgent: text("user_agent"),
    requestId: varchar("request_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
    actionIdx: index("audit_logs_action_idx").on(t.action),
    actorIdx: index("audit_logs_actor_idx").on(t.actorUserId),
    targetIdx: index("audit_logs_target_idx").on(t.targetType, t.targetId),
  }),
);

/* ---------- security_events (append-only) ---------- */

export const securityEvents = pgTable(
  "security_events",
  {
    eventId: bigserial("event_id", { mode: "number" }).primaryKey(),
    eventType: securityEventTypeEnum("event_type").notNull(),
    severity: securityEventSeverityEnum("severity").notNull().default("info"),
    userId: uuid("user_id").references(() => users.userId, { onDelete: "set null" }),
    ip: varchar("ip", { length: 45 }),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").notNull().default({}),
    requestId: varchar("request_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    createdAtIdx: index("security_events_created_at_idx").on(t.createdAt),
    typeIdx: index("security_events_type_idx").on(t.eventType),
    userIdx: index("security_events_user_idx").on(t.userId),
  }),
);

/* ---------- Phase 2: Servers + memberships ---------- */

export const serverStatusEnum = pgEnum("server_status", [
  "active",
  "suspended",
  "archived",
]);

export const servers = pgTable(
  "servers",
  {
    serverId: uuid("server_id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 60 }).notNull().unique(),
    description: text("description"),
    robloxPlaceId: varchar("roblox_place_id", { length: 32 }),
    robloxUniverseId: varchar("roblox_universe_id", { length: 32 }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.userId, { onDelete: "restrict" }),
    status: serverStatusEnum("status").notNull().default("active"),
    settings: jsonb("settings").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    ownerIdx: index("servers_owner_idx").on(t.ownerId),
    statusIdx: index("servers_status_idx").on(t.status),
  }),
);

export const serverMembershipStatusEnum = pgEnum("server_membership_status", [
  "active",
  "suspended",
  "left",
]);

export const serverMemberships = pgTable(
  "server_memberships",
  {
    membershipId: uuid("membership_id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.serverId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    status: serverMembershipStatusEnum("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: unique("server_memberships_server_user_uniq").on(t.serverId, t.userId),
    serverIdx: index("server_memberships_server_idx").on(t.serverId),
    userIdx: index("server_memberships_user_idx").on(t.userId),
  }),
);

/* ---------- Phase 2: Personnel ---------- */

export const personnelStatusEnum = pgEnum("personnel_status", [
  "available",
  "en_route",
  "on_scene",
  "busy",
  "transporting",
  "unavailable",
  "off_duty",
]);

export const personnel = pgTable(
  "personnel",
  {
    personnelId: uuid("personnel_id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.serverId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    callsign: varchar("callsign", { length: 40 }),
    badgeNumber: varchar("badge_number", { length: 40 }),
    rank: varchar("rank", { length: 60 }),
    title: varchar("title", { length: 80 }),
    status: personnelStatusEnum("status").notNull().default("off_duty"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    uniq: unique("personnel_server_user_uniq").on(t.serverId, t.userId),
    serverIdx: index("personnel_server_idx").on(t.serverId),
    userIdx: index("personnel_user_idx").on(t.userId),
    statusIdx: index("personnel_status_idx").on(t.status),
  }),
);

/* ---------- Phase 2: Vehicles ---------- */

export const vehicleStatusEnum = pgEnum("vehicle_status", [
  "in_service",
  "out_of_service",
  "maintenance",
  "retired",
]);

export const vehicles = pgTable(
  "vehicles",
  {
    vehicleId: uuid("vehicle_id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.serverId, { onDelete: "cascade" }),
    plate: varchar("plate", { length: 32 }).notNull(),
    make: varchar("make", { length: 60 }),
    model: varchar("model", { length: 60 }),
    year: integer("year"),
    color: varchar("color", { length: 40 }),
    category: varchar("category", { length: 40 }), // patrol, suv, k9, swat, fire, ems
    status: vehicleStatusEnum("status").notNull().default("in_service"),
    assignedPersonnelId: uuid("assigned_personnel_id").references(() => personnel.personnelId, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    uniq: unique("vehicles_server_plate_uniq").on(t.serverId, t.plate),
    serverIdx: index("vehicles_server_idx").on(t.serverId),
    statusIdx: index("vehicles_status_idx").on(t.status),
  }),
);

/* ---------- Phase 2: Notifications ---------- */

export const notificationCategoryEnum = pgEnum("notification_category", [
  "system",
  "security",
  "membership",
  "personnel",
  "vehicle",
  "audit",
  "custom",
]);

export const notifications = pgTable(
  "notifications",
  {
    notificationId: uuid("notification_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    category: notificationCategoryEnum("category").notNull().default("system"),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true, mode: "date" }),
    link: varchar("link", { length: 255 }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("notifications_user_idx").on(t.userId),
    createdAtIdx: index("notifications_created_at_idx").on(t.createdAt),
    readIdx: index("notifications_read_idx").on(t.readAt),
  }),
);

/* ---------- Types ---------- */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type SecurityEvent = typeof securityEvents.$inferSelect;

// Re-export schema object for convenience
export const schema = {
  users,
  emailVerificationTokens,
  passwordResetTokens,
  devices,
  refreshTokens,
  sessions,
  roles,
  permissions,
  rolePermissions,
  userRoles,
  apiKeys,
  auditLogs,
  securityEvents,
  // Phase 2
  servers,
  serverMemberships,
  personnel,
  vehicles,
  notifications,
};

export type Schema = typeof schema;
