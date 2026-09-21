CREATE TYPE "public"."notification_category" AS ENUM('system', 'security', 'membership', 'personnel', 'vehicle', 'audit', 'custom');--> statement-breakpoint
CREATE TYPE "public"."personnel_status" AS ENUM('available', 'en_route', 'on_scene', 'busy', 'transporting', 'unavailable', 'off_duty');--> statement-breakpoint
CREATE TYPE "public"."server_membership_status" AS ENUM('active', 'suspended', 'left');--> statement-breakpoint
CREATE TYPE "public"."server_status" AS ENUM('active', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('in_service', 'out_of_service', 'maintenance', 'retired');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"notification_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "notification_category" DEFAULT 'system' NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"link" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personnel" (
	"personnel_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"callsign" varchar(40),
	"badge_number" varchar(40),
	"rank" varchar(60),
	"title" varchar(80),
	"status" "personnel_status" DEFAULT 'off_duty' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "personnel_server_user_uniq" UNIQUE("server_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "server_memberships" (
	"membership_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "server_membership_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_memberships_server_user_uniq" UNIQUE("server_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "servers" (
	"server_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(60) NOT NULL,
	"description" text,
	"roblox_place_id" varchar(32),
	"roblox_universe_id" varchar(32),
	"owner_id" uuid NOT NULL,
	"status" "server_status" DEFAULT 'active' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "servers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicles" (
	"vehicle_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"plate" varchar(32) NOT NULL,
	"make" varchar(60),
	"model" varchar(60),
	"year" integer,
	"color" varchar(40),
	"category" varchar(40),
	"status" "vehicle_status" DEFAULT 'in_service' NOT NULL,
	"assigned_personnel_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "vehicles_server_plate_uniq" UNIQUE("server_id","plate")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personnel" ADD CONSTRAINT "personnel_server_id_servers_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("server_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personnel" ADD CONSTRAINT "personnel_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "server_memberships" ADD CONSTRAINT "server_memberships_server_id_servers_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("server_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "server_memberships" ADD CONSTRAINT "server_memberships_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "servers" ADD CONSTRAINT "servers_owner_id_users_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("user_id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_server_id_servers_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("server_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_assigned_personnel_id_personnel_personnel_id_fk" FOREIGN KEY ("assigned_personnel_id") REFERENCES "public"."personnel"("personnel_id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_read_idx" ON "notifications" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personnel_server_idx" ON "personnel" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personnel_user_idx" ON "personnel" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personnel_status_idx" ON "personnel" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_memberships_server_idx" ON "server_memberships" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "server_memberships_user_idx" ON "server_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "servers_owner_idx" ON "servers" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "servers_status_idx" ON "servers" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_server_idx" ON "vehicles" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vehicles_status_idx" ON "vehicles" USING btree ("status");