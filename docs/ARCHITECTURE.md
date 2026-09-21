# Westside — Technical Architecture

> Westside is a production-grade communications platform for communities that operate **Emergency Response: Liberty County (ERLC)** on Roblox. It is original work — it does not copy any third-party CAD/radio product's code, UI, branding, or proprietary systems.

This document defines the architecture for the entire Westside platform. Implementation proceeds phase-by-phase (see §12 — Development Phases). Phase 1 is delivered alongside this document.

---

## 1. Recommended Technology Stack

Selection criteria: security, reliability, maintainability, scalability, performance, clean architecture — in that order.

| Layer | Technology | Why |
|---|---|---|
| Language | TypeScript 5.x end-to-end | Single language across web, API, desktop, shared packages. Eliminates type drift. |
| Monorepo | pnpm workspaces + Turborepo | Fast, deterministic builds; cheap local linking. |
| API framework | Fastify | Highest-throughput Node.js framework; mature plugin ecosystem; first-class TypeScript; built-in schema validation hooks. |
| HTTP schema validation | Zod | TypeScript-native, composable, runtime + compile-time types. |
| ORM | Drizzle ORM | Lightweight, SQL-first, type-safe; transparent migrations; no hidden N+1 magic. |
| Database | PostgreSQL 16 | ACID, row-level security options, JSONB for flexible fields, mature replication. |
| Cache / rate-limit store | Redis 7 | Low-latency KV for sessions, rate-limit counters, PTT presence. |
| Auth hashing | argon2 (Argon2id) | OWASP-recommended password hashing. |
| Tokens | `jose` (JWT/JOSE) | Standards-compliant JWT/JWE/JWS with key rotation support. |
| Web framework | Next.js 16 (App Router) + Tailwind CSS 4 + shadcn/ui | Modern RSC, server actions, edge-ready. |
| Desktop | Tauri 2 (Rust core + system webview) | Small binary, low memory, signed updates, no Chromium shipping. (Phase 4) |
| Real-time | `ws` (Fastify-WebSocket) | Minimal, fast, well-understood. Avoids Socket.IO overhead. |
| Audio (desktop) | WebRTC + Opus | Sub-500ms PTT latency, native echo cancellation. (Phase 4) |
| Logging | Pino (structured JSON) | Fastest structured logger for Node. |
| Observability | OpenTelemetry SDK → OTLP exporter | Vendor-neutral. (Phase 8) |
| Testing | Vitest + Supertest + Playwright | Fast unit/integration + e2e. |
| Containerization | Docker + Docker Compose | Reproducible prod and dev. |
| CI/CD | GitHub Actions | Lint → typecheck → test → build → publish → deploy. |
| Secrets | `.env` locally, Doppler/AWS Secrets Manager in prod | Never in code, never in repo, never in client. |

**Explicitly avoided:**
- Electron (too large attack surface for a security-first product)
- Prisma (heavier runtime; Drizzle is closer to SQL and easier to audit)
- Socket.IO (extra protocol layer not needed)
- MongoDB (relational data is the right fit)

---

## 2. Complete System Architecture

```
                          ┌────────────────────────────┐
                          │     Westside.exe (Tauri)    │
                          │  Win/mac/Linux desktop PTT  │
                          └─────────────┬──────────────┘
                                        │ HTTPS / WSS only
                                        ▼
┌─────────────────────┐         ┌──────────────────────────────────┐
│  Web Dashboard      │         │           Westside API             │
│  (Next.js 16)       │────────▶│  Fastify · /api/v1/* · /ws/*      │
│  SSR + RSC          │         │  Auth · RBAC · Rate limit · Audit │
└─────────────────────┘         └──────┬──────────┬──────────┬──────┘
                                       │          │          │
                                       ▼          ▼          ▼
                                ┌──────────┐ ┌─────────┐ ┌──────────────┐
                                │PostgreSQL│ │  Redis  │ │ Radio Service│
                                │  16      │ │   7     │ │ (Fastify ws) │
                                └──────────┘ └─────────┘ └──────┬───────┘
                                  ▲                              │
                                  │                              │ voice path
                                  │                              ▼
                          ┌───────┴────────┐         ┌──────────────────┐
                          │  Migrations     │         │  ERLC Integration │
                          │  /seed           │         │  Adapters         │
                          └────────────────┘         │  - HTTP API       │
                                                     │  - Webhook        │
                                                     │  - Server bridge  │
                                                     └──────────────────┘
```

### Trust boundaries

| Boundary | Mechanism |
|---|---|
| Client → API | TLS termination + API gateway + WAF rules |
| API → Database | DB user with least privilege; no superuser in app config |
| API → Redis | ACL-scoped Redis user |
| Web → API | Same as client; no shared session state on web |
| Desktop → API | Same as client; **zero** DB credentials in binary |
| API → ERLC adapters | Outbound-only; signed webhooks; never expose private server keys to client |

### Hard rules

1. **The desktop client never connects to PostgreSQL.** No DB URL, no DB credentials, no master API key in the binary.
2. **The desktop client only knows the public API URL** and uses per-user access/refresh tokens.
3. **All permission decisions are server-side.** The client can render or hide UI based on permissions, but every API call is re-authorized.
4. **All secrets come from environment variables or a secrets manager.** No secret lands in source control.
5. **All HTTP is HTTPS in production.** All WebSocket is WSS. HSTS enforced.

---

## 3. Database Architecture

PostgreSQL 16, normalized, with foreign keys and indexes.

### Phase 1 schema (delivered now)

```
users
 ├─ user_id (uuid pk)
 ├─ email (citext unique)
 ├─ username (citext unique)
 ├─ password_hash (argon2id)
 ├─ email_verified_at (timestamptz null)
 ├─ mfa_secret_encrypted (text null)
 ├─ status (text: active | disabled | locked | pending)
 ├─ failed_login_count (int default 0)
 ├─ locked_until (timestamptz null)
 ├─ last_login_at, last_login_ip
 ├─ created_at, updated_at, deleted_at

refresh_tokens
 ├─ token_id (uuid pk)
 ├─ user_id (fk → users)
 ├─ hash (text unique)              -- sha256 of token; raw never stored
 ├─ family_id (uuid)                -- for rotation detection
 ├─ device_id (fk → devices null)
 ├─ expires_at
 ├─ revoked_at (null)
 ├─ created_at, updated_at

sessions
 ├─ session_id (uuid pk)
 ├─ user_id (fk → users)
 ├─ refresh_token_id (fk → refresh_tokens null)
 ├─ device_id (fk → devices null)
 ├─ ip, user_agent
 ├─ issued_at, last_seen_at, expires_at, revoked_at

devices
 ├─ device_id (uuid pk)
 ├─ user_id (fk → users)
 ├─ name, platform, fingerprint (unique per user)
 ├─ last_seen_at, created_at, revoked_at

roles
 ├─ role_id (uuid pk)
 ├─ name (text unique)             -- USER, OFFICER, DISPATCHER, ...
 ├─ description
 ├─ is_system (bool)               -- system roles cannot be deleted

permissions
 ├─ permission_id (uuid pk)
 ├─ name (text unique)             -- radio.use, cad.view, ...
 ├─ description
 ├─ category (text)                -- radio, cad, mdt, admin, security

role_permissions (M:N)
 ├─ role_id, permission_id (composite pk)

user_roles (M:N)
 ├─ user_id, role_id, scope (server_id | department_id | null), granted_by, granted_at

audit_logs (append-only)
 ├─ log_id (bigserial pk)
 ├─ actor_user_id (null)
 ├─ action (text)                  -- USER_CREATED, ROLE_CHANGED, ...
 ├─ target_type, target_id
 ├─ metadata (jsonb)
 ├─ ip, user_agent
 ├─ created_at (indexed)

security_events (append-only)
 ├─ event_id (bigserial pk)
 ├─ event_type                     -- FAILED_LOGIN, RATE_LIMIT, SUSPICIOUS_REQUEST, ...
 ├─ user_id (null), ip, user_agent
 ├─ severity (info|warn|critical)
 ├─ metadata (jsonb)
 ├─ created_at (indexed)

api_keys
 ├─ key_id (uuid pk)
 ├─ name, owner_user_id
 ├─ key_prefix (text)              -- first 8 chars, shown in UI
 ├─ hash (text unique)             -- sha256 of full key
 ├─ scopes (text[])
 ├─ expires_at, last_used_at, revoked_at
 ├─ created_at, updated_at
```

### Phase 2+ schema (planned, not delivered yet)

```
departments, servers, server_memberships, units, unit_statuses,
calls, call_notes, call_assignments, call_timelines,
radio_channels, radio_memberships, radio_ptt_state,
personnel, vehicles, persons, bolos, warrants,
notifications, integration_configs, integration_events,
update_manifests, signed_releases
```

### Conventions

- All PKs: UUID v7 (time-ordered, index-friendly).
- All timestamps: `TIMESTAMPTZ`, stored UTC.
- `citext` for case-insensitive uniqueness on email/username.
- Append-only tables (`audit_logs`, `security_events`) get `REVOKE UPDATE, DELETE` from the app DB role; only an `audit_writer` role can `INSERT`.
- Indexes on every FK column + every column used in `WHERE`/`ORDER BY` of hot queries.
- Migrations via Drizzle Kit, forward-only, committed to repo.

---

## 4. API Architecture

### Versioning

- URL versioning: `/api/v1/*`.
- Sunset policy: 6-month deprecation window; `Sunset` and `Deprecation` HTTP headers when version is being retired.

### REST surface (Phase 1)

```
GET    /health                              # liveness
GET    /ready                               # readiness (DB+Redis ping)

POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/logout-all
POST   /api/v1/auth/verify-email
POST   /api/v1/auth/resend-verification
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
GET    /api/v1/auth/sessions                # list active sessions
DELETE /api/v1/auth/sessions/:id            # revoke one
GET    /api/v1/auth/me                      # current user + permissions

GET    /api/v1/users                        # admins only
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id                    # status, display name
POST   /api/v1/users/:id/roles              # assign role
DELETE /api/v1/users/:id/roles/:roleId

GET    /api/v1/roles
GET    /api/v1/permissions

GET    /api/v1/admin/audit-logs
GET    /api/v1/admin/security-events
```

### WebSocket surface (Phase 3+)

```
/ws/radio        # voice/PTT signaling + presence
/ws/dispatch     # call/timeline updates
/ws/units        # unit status changes
/ws/notifications
```

All `/ws/*` endpoints:
1. Accept connection only after a valid short-lived access token (passed as `?token=` query or `Sec-WebSocket-Protocol`).
2. Re-validate token on every message.
3. Disconnect on token expiry.

### Cross-cutting concerns

| Concern | Implementation |
|---|---|
| Request validation | Zod schemas on every route; reject unknown keys. |
| Response shape | Consistent envelope: `{ data, meta }` or `{ error: { code, message, details } }`. |
| Errors | Never leak stack traces or DB errors. Map to stable error codes (`AUTH_INVALID_CREDENTIALS`, `RBAC_FORBIDDEN`, `RATE_LIMITED`, `VALIDATION_FAILED`). |
| Rate limiting | Sliding window in Redis. Per-IP for unauth routes, per-user for authed. |
| Idempotency | `Idempotency-Key` header on POST/PATCH (Phase 2). |
| Pagination | `?cursor=&limit=` (keyset where possible). |
| Audit | Every state-changing endpoint writes to `audit_logs`. |
| Correlation | Every request gets `X-Request-Id`; propagated to logs, audit, errors. |
| Health | `/health` (process liveness), `/ready` (DB + Redis ping). |
| Structured logging | Pino JSON, with redaction of `password`, `token`, `authorization`, `cookie`. |

---

## 5. Authentication Architecture

### Passwords

- Hashed with **Argon2id** (`m=64MiB, t=3, p=4`).
- Server-side password policy: ≥12 chars, ≤128 chars, no spaces, at least 3 of {lower, upper, digit, symbol}. Reject passwords from a small blocklist (`password`, `westside`, etc.).
- Forgot-password: single-use token (32 bytes, base64url), hash stored in `password_resets` table with 15-min TTL.

### Tokens

- **Access token**: JWT, RS256, **60-second** TTL. Claims: `sub`, `sid` (session id), `jti`, `iat`, `exp`, `iss`, `aud`, `perms` (a compact list — but **server still re-derives from DB on each request**).
- **Refresh token**: opaque 32-byte random, base64url. Stored only as **SHA-256 hash** in `refresh_tokens`. Raw token returned to client exactly once.
- **Refresh rotation**: every refresh issues a new refresh token and **revokes the old one**. If a revoked token is presented again → entire family is revoked → `SECURITY_EVENT: REFRESH_REUSE` fired → all sessions for that user revoked.
- **Cookie transport for web**: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`, scoped refresh cookie.
- **Header transport for desktop**: `Authorization: Bearer <access>`; refresh token stored in OS keychain.

### Session lifecycle

1. Login → verify password → create `session` + `refresh_token` (same `family_id`) → return access + refresh.
2. Each subsequent request → `verifyAccessToken` middleware → re-load user + permissions from DB → inject `req.user` → proceed.
3. Refresh → validate hash, check family alive → issue new pair, rotate.
4. Logout → revoke current refresh + session.
5. Logout-all → revoke every session for that user.
6. Revoke-session-by-id → admin or self.

### Login rate limiting

- Per-IP + per-username sliding window.
- After 5 failed attempts in 15 min → account auto-locked for 15 min (`users.locked_until`).
- Each failed attempt → `security_events` row (`FAILED_LOGIN`).
- On success: `failed_login_count = 0`, `last_login_at` updated.

### Email verification

- On register: `email_verification_tokens` row (hash + 24h TTL). Send verification link.
- Unverified users can authenticate but cannot use any non-auth endpoint.
- Verification link → single-use, IP-agnostic.

### Optional 2FA (architecture ready in Phase 1, wired in Phase 2)

- TOTP-only (RFC 6238). Secret encrypted at rest with `AES-256-GCM` using a server-side KEK from env.
- Backup codes: 10 single-use, hashed with bcrypt.
- Login flow: stage 1 (password) → returns `mfa_required` ticket (60s TTL) → stage 2 (TOTP) → real tokens.

### Threat model

- Token theft at rest → mitigated by hashing refresh tokens.
- Refresh replay → mitigated by rotation + family revocation.
- CSRF for cookie-based endpoints → `SameSite=Strict` + custom `X-Requested-With` header + `Origin` check.
- Session fixation → new session id on every login.
- Privilege escalation via stale token → `perms` claim re-derived from DB every request.

---

## 6. Radio / Voice Architecture

### Principles

- Voice is a **real-time stream**; it must never be persisted in the database.
- Voice is routed **peer-to-peer where possible** (mesh over WebRTC) and **SFU-relayed** when needed.
- Signaling goes through the API's WebSocket layer; media goes through a dedicated radio service.

### Components (Phase 3+)

```
Desktop client (WebRTC + Opus)
    │
    │ WSS signaling (PTT, channel switches, presence)
    ▼
Westside API ──▶ Radio Service (Fastify-WebSocket)
    │                  │
    │                  ├── SFU mode: SELECTIVE_FORWARD to other clients in channel
    │                  └── Mesh mode: signal client-to-client DTLS/ICE
    │
    └──▶ PostgreSQL (channel config, memberships, permissions — never audio)
```

### Channels

- A `radio_channel` has: id, name, kind (`DEPARTMENT`, `DISPATCH`, `TACTICAL`, `EMERGENCY`), department_id (nullable), server_id, max_priority.
- `radio_memberships` (M:N): user_id × channel_id with `can_tx`, `can_rx`, `priority` flags — enforced server-side on every PTT.

### PTT protocol

```
client → server: { type: "PTT_REQUEST", channel, priority }
server → all in channel: { type: "PTT_GRANT", userId, channel, expiresAt }
client → server: { type: "PTT_RELEASE", channel }
```

- Server enforces single-talker per channel (per priority bucket).
- PTT grant has 5-second lease; client must refresh or release.
- Emergency/Priority transmission: preempts lower-priority grants with `PTT_PREEMPT` event.

### Permission enforcement

- `radio.use` — can join channels.
- `radio.dispatch` — can transmit on DISPATCH channels.
- `radio.priority` — can issue priority PTT.
- Channel-level `can_tx`/`can_rx` checked server-side on every WS message.

### Latency budget

| Hop | Budget |
|---|---|
| Mic capture + encode (Opus 20ms) | 25 ms |
| Network uplink | 60 ms |
| SFU forward | 5 ms |
| Network downlink | 60 ms |
| Decode + play | 25 ms |
| **Total target** | **< 200 ms** |

### Independent scaling

Radio service is its own process (`apps/radio`) behind its own subdomain (`radio.westside.example`). It talks to PostgreSQL read-replica for channel config and Redis for transient PTT state. Horizontal scaling via Redis pub/sub for cross-node fan-out.

---

## 7. Desktop Architecture

### Stack

- **Tauri 2** (Rust core, system webview, signed updates).
- **Frontend**: same React + Tailwind + shadcn/ui as the web — compiled to a static bundle, embedded in the binary.
- **Audio**: WebRTC `getUserMedia` + Web Audio API; Opus encoder.
- **PTT hotkey**: OS-level global hotkey via Tauri plugin (Windows `RegisterHotKey`, mac `CGEventTap`, Linux X11).
- **Secure storage**: OS keychain (Windows Credential Manager, mac Keychain, libsecret on Linux).

### What goes in the binary

| Allowed | Forbidden |
|---|---|
| Public API URL (`https://api.westside.example`) | DB connection string |
| Public websocket URL | DB credentials |
| Public update-manifest URL + signing public key | Master API keys |
| App version, build hash | Admin credentials |
| Bundle ID, app icons | Private server secrets |
| CSP, allowed origins | Refresh tokens (these live in OS keychain, not the binary) |

### Update flow

1. On launch: `GET <update-manifest-url>/manifest.json` — signed JSON `{ version, url, sha256, signature, minRequiredVersion }`.
2. Verify manifest signature with embedded **public** key (private key never ships).
3. If `version > current` and `minRequiredVersion <= current`: download to temp, verify SHA-256, verify detached signature.
4. Stage new binary, swap on next restart.
5. On crash-loop detection: auto-rollback to previous binary (Tauri's built-in update validator).

### Anti-reverse-engineering note

We **assume** an attacker can extract every URL and string from `Westside.exe`. The system remains secure because:
- No secret in the binary is sufficient to authenticate.
- Every API call requires a per-user access token issued by the server.
- The server enforces RBAC; the client cannot escalate.
- The signing public key in the binary can only verify updates — it cannot sign them.

---

## 8. Web Architecture

### Stack

- Next.js 16, App Router, React Server Components by default.
- Tailwind CSS 4 + shadcn/ui for primitives.
- Dark mode first-class (system + user toggle, persisted via cookie).
- No server-side session storage — the web app talks to the same `/api/v1/*` as everyone else.

### Routing (Phase 1)

```
/                         → redirect to /dashboard or /login
/login                    → credentials form
/register                 → registration form
/verify-email             → token redemption
/forgot-password          → email entry
/reset-password           → token + new password
/dashboard                → shell + sidebar + overview (auth required)
/settings                 → profile, sessions, security
/admin/audit              → SERVER_ADMIN+
/admin/security           → SERVER_ADMIN+
```

### Auth on the web

- Login → store access token in memory + refresh token in `HttpOnly Secure SameSite=Strict` cookie.
- Server Components fetch with the access token; on 401, call `/auth/refresh` server-side using the cookie, then retry once.
- Logout → server-side `/auth/logout` → clear cookie.

### Accessibility / UX

- WCAG 2.2 AA target.
- Keyboard-navigable sidebar, command palette (Cmd+K) in Phase 2.
- Mobile-first; collapses to bottom tab bar < 768px.

---

## 9. ERLC / Roblox Integration Architecture

### Reality check (important)

Roblox and ERLC do **not** expose a public, official REST API for arbitrary third parties to read/write game state. Three practical integration surfaces exist:

1. **HTTPService from inside a Roblox place** (Roblox → outbound HTTPS to Westside). Westside cannot initiate calls *into* Roblox; it can only receive webhooks/polls from a Roblox server script.
2. **ERLC's official bot/api hooks** (where ERLC itself publishes endpoints). These are external services, not part of Roblox. Use their official docs only.
3. **A trusted bridge server** (small Node service running on the community's own infrastructure) that holds the ERLC private server credentials and translates Westside API calls to ERLC's HTTP API. Westside never sees ERLC credentials.

### Adapter pattern

```
packages/erlc-adapters/
  index.ts                 # registry of available adapters
  types.ts                 # shared adapter interface
  http-api.ts              # outbound to ERLC HTTP API (where supported)
  webhook.ts               # inbound webhooks from Roblox scripts
  bridge.ts                # talks to a community-operated bridge server
  no-op.ts                 # stub for unsupported features (documented)
```

Every adapter implements:

```ts
interface ERLCAdapter {
  name: string;
  supportedCapabilities: ERLCCapability[];     // declared explicitly
  getServerStatus(serverId: string): Promise<ServerStatus | null>;
  kickPlayer(serverId: string, playerId: string): Promise<void>;
  sendMessage(serverId: string, channel: string, msg: string): Promise<void>;
  // ...
}
```

### Hard rule

**No capability is silently faked.** If an adapter can't do something, the API returns `ERLC_NOT_SUPPORTED` with a clear message. The UI shows the capability matrix per server.

---

## 10. Security Architecture

### Defense in depth

```
Network:     TLS 1.3, HSTS, no mixed content, WAF in front of API
Application: helmet headers, strict CSP, CORS allowlist, request size limit
Auth:        Argon2id, short-lived JWT, rotating refresh tokens, family revocation
RBAC:        server-side permission check on EVERY protected endpoint
Rate-limit:  per-IP and per-user sliding window; login brute-force protection
Input:       Zod validation on every route; parameterized SQL everywhere
Secrets:     env-only; never in repo; never in client binary
Audit:       append-only audit_logs + security_events
Monitoring:  anomaly detection on security events (Phase 7+)
```

### Security middleware pipeline (Fastify)

```
preHandler:
  1. request-id inject
  2. body size guard (≤ 256 KB default)
  3. helmet headers
  4. CORS check
  5. rate-limit (per-IP)
  6. request validation (Zod)
  7. auth (verify access token, load user + perms)
  8. authorization (check required permission)
  9. audit-log start
onResponse:
  - audit-log complete
  - emit security event on suspicious patterns
onError:
  - never expose stack; map to error envelope
```

### Secret rotation

- JWT signing key: dual-key (primary + secondary) with overlap window.
- Argon2 parameters: stored alongside hash; can be re-hashed on next login if params bump.
- API keys: rotatable; old key keeps working for 24h after rotation, then revoked.

### Account lockout

- 5 failed logins in 15 minutes → 15-minute lock.
- 3 lockouts in 24 hours → 24-hour lock + `SECURITY_EVENT: RECURRING_LOCKOUT`.

### Suspicious-request detection (heuristics)

- Multiple User-Agent changes mid-session.
- Refresh token reuse (revoked token presented).
- Request with `Origin` header not in allowlist.
- Token `jti` not in current session.
- Each → `security_events` row + optional auto-revoke.

### What we never log

- Raw passwords, raw tokens, raw API keys, refresh tokens, session ids, full credit-card numbers (n/a here but rule stands), private keys, cookie values. Pino redaction enforced.

### What we always log

- Login attempts (success + failure), role/permission changes, API key creation/revocation, session revocation, account disable, password reset requests, suspicious-request flags, audit-relevant admin actions.

---

## 11. Project Folder Structure

```
/westside
├── apps/
│   ├── api/                       # Fastify API
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── config/
│   │   │   ├── plugins/           # fastify plugins (auth, rbac, rate-limit, audit)
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── users/
│   │   │   │   ├── rbac/
│   │   │   │   ├── audit/
│   │   │   │   └── health/
│   │   │   ├── lib/               # token, argon, redis, db helpers
│   │   │   └── schemas/           # zod schemas
│   │   ├── tests/
│   │   └── package.json
│   ├── web/                       # Next.js 16 dashboard
│   │   ├── app/
│   │   ├── lib/
│   │   ├── components/
│   │   └── package.json
│   ├── radio/                     # (Phase 3+) radio service
│   └── desktop/                   # (Phase 4) Tauri client
├── packages/
│   ├── shared/                    # shared TS types, error codes, constants
│   ├── ui/                        # shadcn-based component lib (Phase 2+)
│   └── config/                    # tsconfig, eslint, prettier
├── database/
│   ├── migrations/                # drizzle migrations
│   ├── seed/
│   └── schema.ts                  # canonical drizzle schema
├── infra/
│   ├── docker/
│   │   ├── docker-compose.dev.yml
│   │   ├── Dockerfile.api
│   │   └── Dockerfile.web
│   └── deployment/
├── docs/
│   ├── ARCHITECTURE.md            # this file
│   ├── SECURITY.md                # Phase 1
│   ├── API.md                     # Phase 2+
│   └── RUNBOOK.md                 # Phase 8
├── .env.example
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── README.md
```

---

## 12. Development Phases

| Phase | Scope | Status |
|---|---|---|
| **1** | Project structure · DB · API · Auth · RBAC · Security middleware · Basic web dashboard | **← Delivered now** |
| 2 | Departments · Users mgmt · Servers · Units · CAD core | Planned |
| 3 | WebSocket infra · Radio channels · Radio presence · PTT | Planned |
| 4 | Tauri desktop client · Auth · Audio · PTT · Auto-update | Planned |
| 5 | MDT · Records · BOLOs · Warrants | Planned |
| 6 | ERLC/Roblox integration adapters | Planned |
| 7 | Admin panel · Security dashboard · Audit UI · Update pipeline | Planned |
| 8 | Prod deployment · Monitoring · Backups · Pen-test · Load test | Planned |

Each phase follows the same rhythm: **explain → build → run instructions → tests → security review → fix before next.**

---

## 13. Local Development Setup

### Prerequisites

- Node.js 22+ (LTS)
- pnpm 9+
- Docker + Docker Compose
- (Phase 4 only) Rust toolchain + Tauri prerequisites

### One-time

```bash
git clone <repo> westside
cd westside
pnpm install
cp .env.example .env
# edit .env — generate JWT keys, set DB password, set Redis password
docker compose -f infra/docker/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:seed            # creates OWNER role + bootstrap user
pnpm dev                # turbo dev — runs api + web in parallel
```

### URLs (dev)

- Web: http://localhost:3000
- API: http://localhost:4000
- Postgres: localhost:5432
- Redis: localhost:6379

### Generating dev JWT keys

```bash
openssl genpkey -algorithm RSA -out .keys/jwt-private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in .keys/jwt-private.pem -pubout -out .keys/jwt-public.pem
```

(.keys is gitignored.)

---

## 14. Production Deployment Architecture

```
                      Internet
                         │
                         ▼
                ┌─────────────────┐
                │   CDN (Cloudflare) │  ── static assets, WAF, DDoS
                └────────┬────────┘
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
      ┌──────────┐              ┌──────────┐
      │  Web SSR │              │  API LB  │
      │  (Vercel │              │ (AWS ALB │
      │   or Fargate)│          │   / Fly) │
      └─────┬────┘              └─────┬────┘
            │                         │
            └──────────┬──────────────┘
                       ▼
              ┌────────────────┐
              │  API cluster    │  N Fastify containers behind ALB
              │  (Fastify)      │  autoscale on CPU + RPS
              └────┬───────┬────┘
                   │       │
                   ▼       ▼
            ┌────────┐ ┌────────┐
            │ PG 16  │ │ Redis  │
            │ primary│ │  7     │
            │ + 2 RR │ │  HA    │
            └────────┘ └────────┘
                   ▲
                   │ async replication
            ┌────────────┐
            │  Radio     │  separate autoscaling group
            │  service   │  behind its own LB
            └────────────┘

Backups:   daily pg_basebackup + WAL archiving to S3 (PITR)
Secrets:   AWS Secrets Manager / Doppler; rotated quarterly
Logs:      OTLP → Grafana Cloud / Datadog
Alerts:    Sentry (app), Grafana (infra)
```

### Hardening

- API behind ALB with TLS 1.3 only, HSTS preload.
- Postgres in private subnet, no public endpoint.
- Redis with AUTH + TLS.
- Containers run as non-root UID 10001.
- Image scanning (Trivy) in CI on every PR.
- Reproducible builds; SBOM emitted per release.

---

## 15. Testing Strategy

### Pyramid

```
            ┌─────────────┐
            │   e2e (5%)  │   Playwright — full user journeys
            ├─────────────┤
            │ integration │   Fastify injected routes + real DB (test container)
            │    (30%)    │
            ├─────────────┤
            │   unit (65%)│   pure logic, services, validators
            └─────────────┘
```

### Coverage targets (Phase 1)

- Auth module: ≥ 90% line coverage.
- RBAC middleware: 100% (small surface, high risk).
- Token rotation logic: 100%.
- Security middleware: ≥ 85%.

### Security tests

- Token-reuse attack simulation (must revoke family).
- Rate-limit brute-force simulation.
- SQL-injection fuzz on every input that lands in a query.
- XSS payload list against every form input.
- CSRF on cookie endpoints with no `Origin` header.
- Permission matrix test: for every `(role × endpoint × permission)` triple — expected `200` or `403`.

### Load tests (Phase 8)

- `k6` script simulating 1k concurrent WS connections + 5k auth req/s.
- P99 latency target: < 200 ms for auth, < 50 ms for cached reads.

### CI gate

```
lint → typecheck → unit → integration → build → security-scan → e2e (on main)
```

Failing any of `lint`, `typecheck`, `unit`, `integration` blocks merge to `main`.

---

## Summary

Westside is built on a centralized, security-first architecture with a strict trust boundary at the API. The desktop client is treated as fully untrusted; the server is the single source of truth for identity, authorization, and audit. The system is designed to scale the radio service independently of the rest of the API and to add ERLC integration adapters without rewrites.

**Phase 1 is delivered in the same commit as this document.**
