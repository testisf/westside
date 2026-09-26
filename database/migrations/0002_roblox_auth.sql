-- Roblox-only sign-in: accounts no longer require an email/password, and
-- carry a Roblox identity instead. Existing password-based accounts are
-- untouched; new accounts created through Roblox sign-in leave email,
-- password_hash and argon2_params NULL.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "argon2_params" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "roblox_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "roblox_username" varchar(100);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_roblox_id_idx" ON "users" USING btree ("roblox_id");--> statement-breakpoint
-- Partial unique index: any number of NULLs allowed, but a non-null
-- roblox_id must be unique. Drizzle's schema.ts documents this constraint
-- but can't express it directly, so it lives only here.
CREATE UNIQUE INDEX IF NOT EXISTS "users_roblox_id_unique" ON "users" USING btree ("roblox_id") WHERE "roblox_id" IS NOT NULL;
