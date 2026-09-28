# Westside — Submission fields drop-in

Adds these 6 listing/submission fields to the **Server** entity (description already existed, so it was kept and is now surfaced as part of the listing flow):

- Privacy Policy URL
- Terms of Service URL
- Description  *(existing column, no migration needed)*
- Entry Link
- Demo Video URL
- Category Justification

## Files in this drop

Drag each file into the matching path under your repo root. Paths are relative to your project root (the folder that contains `apps/`, `database/`, `packages/`, etc.).

| File in this zip | Drop it at (relative to repo root) |
| --- | --- |
| `database/schema.ts` | `database/schema.ts` *(replaces existing)* |
| `database/migrations/0003_server_submission_fields.sql` | `database/migrations/0003_server_submission_fields.sql` *(new file)* |
| `apps/api/src/schemas/index.ts` | `apps/api/src/schemas/index.ts` *(replaces existing)* |
| `apps/api/src/modules/servers/routes.ts` | `apps/api/src/modules/servers/routes.ts` *(replaces existing)* |
| `apps/web/app/dashboard/servers/page.tsx` | `apps/web/app/dashboard/servers/page.tsx` *(replaces existing)* |
| `apps/web/app/dashboard/servers/[serverId]/page.tsx` | `apps/web/app/dashboard/servers/[serverId]/page.tsx` *(replaces existing)* |

> Note: the `[serverId]` folder name literally contains square brackets — that's a Next.js dynamic route segment, not a placeholder.

## After dropping the files in

1. **Apply the migration** (pick whichever your project uses):

   ```bash
   # Drizzle Kit (recommended — matches the file naming convention)
   pnpm db:migrate

   # or, apply the SQL directly:
   psql "$DATABASE_URL" -f database/migrations/0003_server_submission_fields.sql
   ```

   If you use `pnpm db:generate` to regenerate migrations from `schema.ts`, it will produce an equivalent migration — you can either keep `0003_server_submission_fields.sql` or delete it and use the generated one.

2. **Restart the API and web app** so the new Zod schemas and UI take effect.

## What changed in each file

### `database/schema.ts`
Added 5 new nullable columns to the `servers` table:

```ts
privacyPolicyUrl:    varchar("privacy_policy_url",     { length: 2048 }),
termsOfServiceUrl:   varchar("terms_of_service_url",  { length: 2048 }),
entryLink:           varchar("entry_link",             { length: 2048 }),
demoVideoUrl:         varchar("demo_video_url",        { length: 2048 }),
categoryJustification: text("category_justification"),
```

All nullable so existing rows migrate cleanly. `description` was already there.

### `database/migrations/0003_server_submission_fields.sql`
Drizzle-style migration with `--> statement-breakpoint` separators, matching the convention used in `0002_roblox_auth.sql`.

### `apps/api/src/schemas/index.ts`
- Adds an `optionalUrl` Zod helper that coerces empty strings to `undefined` and validates `z.string().url().max(2048)`.
- Adds `categoryJustification: z.string().max(2000).optional()`.
- Both `createServerSchema` and `updateServerSchema` accept the 5 new fields.

### `apps/api/src/modules/servers/routes.ts`
- `POST /api/v1/servers` writes the 5 new fields (each `?? null`).
- `PATCH /api/v1/servers/:serverId` passes the new fields through to `db.update()`.
- `serializeServer()` returns the 5 new fields on every response.

### `apps/web/app/dashboard/servers/page.tsx`
- The **New server** dialog now has a "Listing details" group with all 5 fields (all optional). Fill them in now or skip and edit later.

### `apps/web/app/dashboard/servers/[serverId]/page.tsx`
- Adds a **Listing details** Section showing each field, with clickable links for URLs.
- Adds an **Edit listing** button (owners only) that opens a modal to PATCH the 5 fields.
- Uses `server.reload()` (the actual method exposed by `useApi`) to refresh after save.

## Notes

- `apps/desktop/...` contains what looks like an older snapshot of the same files (under `apps/desktop/apps/api/...` and `apps/desktop/apps/web/...`). I did NOT touch those — if you build the desktop bundle from that snapshot, copy the same files there too.
- All fields are optional. Empty strings submitted from the UI are coerced to `undefined` so the API stores `NULL` rather than `""`.
- No new permissions were added — anyone who can already create/edit a server can set these fields.
