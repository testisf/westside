-- Adds listing/submission metadata columns to the `servers` table:
--   privacy_policy_url, terms_of_service_url, entry_link,
--   demo_video_url, category_justification.
-- All nullable so existing rows migrate cleanly. Description already exists
-- on the servers table and is intentionally NOT re-added here.
ALTER TABLE "servers" ADD COLUMN "privacy_policy_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "terms_of_service_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "entry_link" varchar(2048);--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "demo_video_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "category_justification" text;
