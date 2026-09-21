# Westside Security — Phase 1 Baseline

This document is the living security checklist for Westside. Each phase will extend it. Phase 1 establishes the baseline; later phases add radio security, integration security, and production hardening.

---

## Threat model summary

| Asset | Threat | Mitigation (Phase 1) |
|---|---|---|
| User password | Disclosure at rest | Argon2id hash, params embedded |
| User password | Brute-force login | 5 attempts / 15min, then 15-min lock |
| Access token | Theft at rest (client) | 60-second TTL |
| Refresh token | Theft at rest (client) | 32-byte random, only SHA-256 hash persisted |
| Refresh token | Replay after rotation | Family revocation; reuse detected → all sessions revoked |
| Session | Hijacking | Session id bound to refresh token; revocation cascades |
| RBAC decision | Client tampering | Server re-derives permissions from DB on EVERY request |
| API endpoint | Anonymous abuse | Per-IP rate-limit (Redis sliding window) |
| API endpoint | DB error leak | All errors mapped to stable error codes via global handler |
| Audit log | Tampering | Append-only; DB role restricts UPDATE/DELETE (Phase 8 policy) |
| Sensitive logs | PII/secret leakage | Pino redaction on `password`, `token`, `authorization`, `cookie` |
| Origin spoofing | CSRF | `SameSite=Strict` cookie + `Origin` allowlist check |
| Account enumeration | Timing oracle on login | Always run Argon2 verify (dummy hash if user missing) |

---

## Phase 1 security checklist

### Authentication
- [x] Password hashing uses **Argon2id** (OWASP-recommended)
- [x] Argon2 parameters: `m=64MiB, t=3, p=4` (configurable via env)
- [x] Password policy: ≥12 chars, ≤128 chars, no whitespace, 3-of-4 char classes, blocklist
- [x] Rehash on next login when policy bumps params
- [x] Login attempts always run a hash comparison (timing-oracle defence)
- [x] Account lockout after 5 failed logins / 15 min
- [x] Failed-login events recorded in `security_events`

### Tokens
- [x] Access tokens are JWT RS256, **60-second** TTL
- [x] Refresh tokens are 32-byte random, base64url
- [x] Refresh tokens stored only as **SHA-256 hash** in DB
- [x] Refresh rotation: every refresh issues new + revokes old
- [x] Refresh-token reuse detected → entire family revoked → all sessions revoked
- [x] Refresh token delivered via `HttpOnly Secure SameSite=Strict` cookie (web) or JSON body (desktop)

### Sessions
- [x] New session id on every login (session-fixation defence)
- [x] Session bound to refresh token; revoking one revokes the other
- [x] `POST /auth/logout` revokes current session
- [x] `POST /auth/logout-all` revokes every session for the user
- [x] `DELETE /auth/sessions/:id` revokes a specific session

### RBAC
- [x] Permissions are granular (`radio.use`, `cad.create_call`, …), not role-name based
- [x] 60+ permissions across 14 categories
- [x] Every protected endpoint has `preHandler: [app.requireAuth(), app.requirePermission("...")]`
- [x] Permissions are re-loaded from DB on every request (never trust client-supplied perms)
- [x] `perms` claim in JWT is for client UX only

### Input validation
- [x] Every route parses body with Zod schema
- [x] Every schema uses `.strict()` to reject unknown keys
- [x] Password policy enforced at validation layer
- [x] Email + username validated and length-bounded
- [x] All DB queries use Drizzle's parameterized queries (no string concatenation)

### HTTP security
- [x] `@fastify/helmet` enforces HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- [x] CORS allowlist from env (no `*` in production)
- [x] `credentials: true` for cookie-based auth
- [x] Body size limit 256 KB
- [x] Request-id propagated to every log, audit row, and error envelope

### Rate limiting
- [x] Global per-IP rate limit (Redis-backed sliding window)
- [x] Stricter per-IP + per-identifier limit on `/auth/login` (5 / 15min)
- [x] Stricter limit on `/auth/register` (10 / hour)
- [x] Stricter limit on `/auth/forgot-password` (5 / 15min)

### Audit & security events
- [x] `audit_logs` table is append-only (DB role restrictions to be added in Phase 8 migration)
- [x] `security_events` table is append-only
- [x] Every state-changing endpoint writes an audit row
- [x] Failed logins, lockouts, refresh reuse, origin mismatches → security events
- [x] Audit metadata is sanitized before being returned via API (credentials redacted)

### Error handling
- [x] Global error handler maps every error to a stable code
- [x] Stack traces and DB error messages NEVER reach the client
- [x] 404s return a clean `NOT_FOUND` envelope
- [x] All errors include `requestId` for support correlation

### Secrets
- [x] All secrets come from environment variables
- [x] `.env` is gitignored
- [x] `.keys/` (JWT signing keys) is gitignored
- [x] The desktop client (Phase 4) will contain ZERO DB credentials
- [x] No master API key in any client binary

### Logging
- [x] Pino structured JSON logging
- [x] Redaction on `password`, `token`, `authorization`, `cookie`, `*.password`, `*.refreshToken`, `*.accessToken`
- [x] Request-id propagated to all log entries

---

## Phase 1 — NOT yet implemented (deferred to later phases)

| Concern | Phase |
|---|---|
| 2FA / TOTP | Phase 2 |
| API key system (hashed storage, scopes, rotation) | Phase 2 (schema exists; routes Phase 2) |
| WebSocket auth (re-validate on every message) | Phase 3 |
| Desktop client binary integrity (Tauri signing) | Phase 4 |
| ERLC adapter sandboxing | Phase 6 |
| TLS termination at ALB + HSTS preload | Phase 8 |
| DB role grants (REVOKE UPDATE/DELETE on audit tables) | Phase 8 |
| Backups + PITR | Phase 8 |
| Pen-test + load test | Phase 8 |

---

## How to verify Phase 1 security

```bash
# 1. Verify Argon2id is used
grep -r "argon2id" apps/api/src/database/

# 2. Verify refresh-token hashing
grep -A2 "hashRefreshToken" apps/api/src/lib/token.ts

# 3. Verify RBAC enforcement
grep -r "requirePermission" apps/api/src/modules/

# 4. Run the test suite (50 tests)
pnpm test

# 5. Verify no secret in repo
git ls-files | xargs grep -lE "(DATABASE_URL|REDIS_URL)=" | grep -v .env.example
# Should return nothing.
```
