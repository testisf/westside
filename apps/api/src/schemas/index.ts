/**
 * Westside — Zod request schemas.
 * Every endpoint takes a Zod schema, parses input, rejects unknown keys.
 */

import { z } from "zod";

const emailSchema = z.string().email().max(254).toLowerCase();
const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(32, "Username must be at most 32 characters")
  .regex(/^[a-zA-Z0-9_.-]+$/, "Username may contain letters, digits, . _ -");

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((v) => !/\s/.test(v), {
    message: "Password may not contain whitespace",
  })
  .refine(
    (v) => {
      const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(v));
      return classes.length >= 3;
    },
    { message: "Password must include at least 3 of: lowercase, uppercase, digit, symbol" },
  )
  .refine((v) => !/(password|westside|qwerty|letmein|admin|root)/i.test(v), {
    message: "Password contains a forbidden word",
  });

export const registerSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    identifier: z.string().min(3).max(254), // email or username
    password: z.string().min(1).max(1024),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1).max(256),
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: z.string().min(1).max(256),
  })
  .strict();

export const resendVerificationSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1).max(256),
    password: passwordSchema,
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(1024),
    newPassword: passwordSchema,
  })
  .strict();

export const assignRoleSchema = z
  .object({
    roleId: z.string().uuid(),
  })
  .strict();

export const updateUserSchema = z
  .object({
    displayName: z.string().min(1).max(100).optional(),
    status: z.enum(["active", "disabled", "locked", "pending"]).optional(),
  })
  .strict();

/* ---------- Phase 2: Servers ---------- */

const slugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(60, "Slug must be at most 60 characters")
  .regex(/^[a-z0-9-]+$/, "Slug may contain lowercase letters, digits, and hyphens only");

export const createServerSchema = z
  .object({
    name: z.string().min(3).max(120),
    slug: slugSchema,
    description: z.string().max(2000).optional(),
    robloxPlaceId: z.string().max(32).optional(),
    robloxUniverseId: z.string().max(32).optional(),
  })
  .strict();

export const updateServerSchema = z
  .object({
    name: z.string().min(3).max(120).optional(),
    description: z.string().max(2000).optional(),
    robloxPlaceId: z.string().max(32).optional(),
    robloxUniverseId: z.string().max(32).optional(),
    status: z.enum(["active", "suspended", "archived"]).optional(),
  })
  .strict();

export const joinServerSchema = z.object({}).strict();

/* ---------- Phase 2: Personnel ---------- */

export const createPersonnelSchema = z
  .object({
    userId: z.string().uuid(),
    callsign: z.string().min(1).max(40).optional(),
    badgeNumber: z.string().min(1).max(40).optional(),
    rank: z.string().min(1).max(60).optional(),
    title: z.string().min(1).max(80).optional(),
    notes: z.string().max(5000).optional(),
  })
  .strict();

export const updatePersonnelSchema = z
  .object({
    callsign: z.string().min(1).max(40).optional(),
    badgeNumber: z.string().min(1).max(40).optional(),
    rank: z.string().min(1).max(60).optional(),
    title: z.string().min(1).max(80).optional(),
    status: z
      .enum(["available", "en_route", "on_scene", "busy", "transporting", "unavailable", "off_duty"])
      .optional(),
    notes: z.string().max(5000).optional(),
  })
  .strict();

/* ---------- Phase 2: Vehicles ---------- */

export const createVehicleSchema = z
  .object({
    plate: z.string().min(1).max(32),
    make: z.string().min(1).max(60).optional(),
    model: z.string().min(1).max(60).optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    color: z.string().min(1).max(40).optional(),
    category: z.string().min(1).max(40).optional(),
    notes: z.string().max(5000).optional(),
  })
  .strict();

export const updateVehicleSchema = z
  .object({
    make: z.string().min(1).max(60).optional(),
    model: z.string().min(1).max(60).optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    color: z.string().min(1).max(40).optional(),
    category: z.string().min(1).max(40).optional(),
    status: z.enum(["in_service", "out_of_service", "maintenance", "retired"]).optional(),
    assignedPersonnelId: z.string().uuid().nullable().optional(),
    notes: z.string().max(5000).optional(),
  })
  .strict();

/* ---------- Phase 2: API keys ---------- */

export const createApiKeySchema = z
  .object({
    name: z.string().min(3).max(120),
    scopes: z.array(z.string().min(1).max(80)).default([]),
    expiresAt: z.string().datetime().optional(),
  })
  .strict();
