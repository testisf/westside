# Westside

> A production-grade communications platform for communities that operate **Emergency Response: Liberty County (ERLC)** on Roblox.
>
> Westside is an original platform. It does not copy any third-party CAD/radio product's code, UI, branding, or proprietary systems.

---

## What this repository contains — Phase 1

Phase 1 is the **security foundation**. It delivers:

| Capability | Status |
|---|---|
| Monorepo (pnpm + Turborepo) | ✓ |
| PostgreSQL schema (Drizzle ORM) | ✓ users · sessions · refresh_tokens · devices · roles · permissions · role_permissions · user_roles · api_keys · audit_logs · security_events · email_verification_tokens · password_reset_tokens |
| Argon2id password hashing | ✓ |
| JWT access tokens (RS256, 60s TTL) | ✓ |
| Opaque refresh tokens with rotation + family revocation | ✓ |
| Session management (list / revoke / revoke-all) | ✓ |
| Email verification (token-issued) | ✓ |
| Password reset (single-use token) | ✓ |
| RBAC with granular permissions | ✓ 60+ permissions across 14 categories |
| Server-side permission checks on every protected endpoint | ✓ |
| Security middleware: helmet · CORS · body limit · per-IP rate-limit | ✓ |
| Login brute-force protection + account lockout | ✓ |
| Audit logging (append-only) | ✓ |
| Security event logging (append-only) | ✓ |
| Error envelope — never leaks stack/DB errors | ✓ |
| Structured logging with Pino + redaction | ✓ |
| Health endpoints (`/health` + `/ready`) | ✓ |
| Next.js 16 web dashboard with login + dashboard + dark mode | ✓ |
| Docker Compose for Postgres + Redis | ✓ |

### What's deliberately NOT in Phase 1

- Departments, Units, CAD, MDT, Records, BOLOs, Warrants → Phase 2 / 5
- Real-time WebSocket infrastructure → Phase 3
- Desktop client (Westside.exe) → Phase 4
- ERLC/Roblox integration adapters → Phase 6
- Admin panel + Security dashboard UI → Phase 7
- Production deployment + monitoring + load tests → Phase 8

---

## Quick start

### Prerequisites

- **Node.js 22+**
- **pnpm 9+** — `npm install -g pnpm`
- **Docker** + Docker Compose (for local Postgres + Redis)

### 1. Install

```bash
git clone <repo> westside && cd westside
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` if you want to change defaults. Then generate the JWT signing keys:

```bash
mkdir -p .keys
openssl genpkey -algorithm RSA -out .keys/jwt-private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in .keys/jwt-private.pem -pubout -out .keys/jwt-public.pem
```

### 3. Start Postgres + Redis

```bash
pnpm infra:up
# Verify they're up:
docker compose -f infra/docker/docker-compose.dev.yml ps
```

### 4. Apply migrations

The first migration is generated from the schema:

```bash
pnpm db:generate        # produces database/migrations/0000_*.sql
pnpm db:migrate
```

### 5. Seed (creates permissions, system roles, and an OWNER account)

```bash
pnpm db:seed
# Credentials come from BOOTSTRAP_OWNER_* env vars.
# Default: owner@westside.local / owner / ChangeMe!Strong-Password-2026
```

### 6. Run

```bash
pnpm dev
# Web:   http://localhost:3000
# API:   http://localhost:4000
```

### 7. Verify

```bash
curl http://localhost:4000/health
# {"status":"ok","uptime":...}

curl http://localhost:4000/ready
# {"status":"ok","checks":{"database":{"status":"ok",...},"redis":{"status":"ok",...}}}
```

Open http://localhost:3000 in your browser. You'll be redirected to `/login`. Use the bootstrap OWNER credentials.

---

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the complete 15-section technical design.

### Project layout

```
westside/
├── apps/
│   ├── api/                  # Fastify API (Phase 1)
│   └── web/                  # Next.js 16 dashboard (Phase 1)
├── packages/
│   ├── shared/               # error codes, permission catalog, role catalog, types
│   └── config/               # shared tsconfig
├── database/                 # Drizzle schema + migrations + seed
├── infra/
│   └── docker/
│       ├── docker-compose.dev.yml
│       └── Dockerfile.api
├── docs/ARCHITECTURE.md
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example
```

---

## Security model — the non-negotiables

These rules apply to every phase, every PR, every line of code:

1. **The desktop client never connects to PostgreSQL.** No DB URL, no DB credentials, no master API key in the binary.
2. **The desktop client only knows the public API URL** and uses per-user access/refresh tokens.
3. **All permission decisions are server-side.** The client may render/hide UI based on permissions, but every API call is re-authorized.
4. **All secrets come from environment variables.** No secret lands in source control.
5. **All HTTP is HTTPS in production.** All WebSocket is WSS. HSTS enforced.
6. **Reverse-engineering the desktop client must not compromise security.** Even if every URL and string is extracted, the system remains secure.

---

## API surface (Phase 1)

```
GET    /health
GET    /ready

POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/logout-all
POST   /api/v1/auth/verify-email
POST   /api/v1/auth/resend-verification
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
POST   /api/v1/auth/change-password
GET    /api/v1/auth/sessions
DELETE /api/v1/auth/sessions/:id
GET    /api/v1/auth/me

GET    /api/v1/users                       (requires user.view.all)
GET    /api/v1/users/:id                    (requires user.view)
PATCH  /api/v1/users/:id                    (requires user.update)
POST   /api/v1/users/:id/roles              (requires role.assign)
DELETE /api/v1/users/:id/roles/:roleId      (requires role.revoke)

GET    /api/v1/roles                        (requires role.view)
GET    /api/v1/permissions                  (requires role.view)

GET    /api/v1/admin/audit-logs             (requires audit.view)
GET    /api/v1/admin/security-events        (requires security.view)
```

### Response envelope

```jsonc
// Success
{ "data": { ... }, "meta": { "nextCursor": "..." } }

// Error
{ "error": { "code": "AUTH_INVALID_CREDENTIALS", "message": "...", "requestId": "..." } }
```

### Stable error codes

See [`packages/shared/src/errors.ts`](packages/shared/src/errors.ts) for the canonical list. Examples:

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong email/username or password |
| `AUTH_TOKEN_INVALID` | 401 | Missing or malformed access token |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token TTL elapsed; refresh required |
| `AUTH_REFRESH_REUSE` | 401 | Refresh token reuse detected; all sessions revoked |
| `AUTH_ACCOUNT_LOCKED` | 423 | Too many failed logins |
| `AUTH_UNVERIFIED_EMAIL` | 403 | Email not verified |
| `RBAC_FORBIDDEN` | 403 | Permission denied |
| `RATE_LIMITED` | 429 | Too many requests |
| `VALIDATION_FAILED` | 422 | Zod validation rejected the body/params |
| `NOT_FOUND` | 404 | Unknown resource |
| `INTERNAL_ERROR` | 500 | Anything else; details only in server logs |

---

## Development commands

| Command | Description |
|---|---|
| `pnpm dev` | Run api + web in parallel (via Turborepo) |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | TypeScript --noEmit across all workspaces |
| `pnpm test` | Run vitest across all workspaces |
| `pnpm db:generate` | Generate SQL migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed` | Idempotent seed (permissions, system roles, OWNER account) |
| `pnpm infra:up` | Start Postgres + Redis via Docker Compose |
| `pnpm infra:down` | Stop Postgres + Redis |

---

## Testing

```bash
pnpm test
```

Phase 1 includes:

- **Unit tests** for token sign/verify, password hashing, refresh-token family rotation, error envelope.
- **Schema tests** for Zod validation (rejects unknown keys, weak passwords, malformed emails).
- **Permission matrix test** — for every `(role × permission)` pair, the expected result is asserted.

Tests that require a live Postgres are tagged `@integration` and skipped unless `DATABASE_URL` points to a reachable DB.

---

## What's next — Phase 2

Phase 2 adds the operational backbone:

- **Departments** — multi-tenant scoping for everything else.
- **Servers** — an ERLC community server record.
- **Server memberships** — links users to servers with roles.
- **Units** — personnel assigned to a department on a server.
- **CAD core** — create calls, assign units, set status, add notes, close/reopen.

Each phase will be shipped as a separate PR with the same structure: **explain → build → run instructions → tests → security review**.

---

## License

UNLICENSED. © Westside. All rights reserved.
