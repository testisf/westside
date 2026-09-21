/**
 * Token tests — JWT sign/verify, refresh-token hashing, family rotation.
 *
 * These tests do NOT touch the database; they verify the cryptographic
 * primitives used by the auth service.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  __clearKeyCache,
} from "../src/lib/token.ts";
import { loadConfig } from "../src/config/index.ts";

function loadTestConfig() {
  // We don't want loadConfig() to require env vars; build a minimal config inline.
  const keysDir = join(process.cwd(), "..", "..", ".keys");
  return {
    nodeEnv: "test",
    logLevel: "error",
    api: { port: 4000, baseUrl: "http://test", corsOrigins: ["http://test"] },
    web: { baseUrl: "http://test-web" },
    jwt: {
      privateKeyPem: readFileSync(join(keysDir, "jwt-private.pem"), "utf8"),
      publicKeyPem: readFileSync(join(keysDir, "jwt-public.pem"), "utf8"),
      issuer: "westside-test",
      audience: "westside-test-clients",
      accessTokenTtlSeconds: 60,
      refreshTokenTtlSeconds: 60,
    },
    argon2: { memoryKiB: 4096, timeCost: 1, parallelism: 1 },
    rateLimit: { perMinuteIp: 100, perMinuteUser: 100, loginPer15Min: 5 },
    accountLockout: { threshold: 5, durationMinutes: 15 },
    emailVerificationTtlHours: 24,
    passwordResetTtlMinutes: 15,
    mailFrom: "test",
    bootstrap: {
      ownerEmail: "owner@test",
      ownerUsername: "owner",
      ownerPassword: "x",
    },
    databaseUrl: "postgres://x",
    redisUrl: "redis://x",
  } as const;
}

const cfg = loadTestConfig();

beforeAll(() => {
  __clearKeyCache();
});

describe("access token", () => {
  it("signs and verifies a valid token", async () => {
    const { jwt, claims } = await signAccessToken(cfg, {
      userId: "user-1",
      sessionId: "sess-1",
      permissions: ["cad.view", "radio.use"],
    });

    expect(jwt.split(".").length).toBe(3); // header.payload.signature

    const verified = await verifyAccessToken(cfg, jwt);
    expect(verified.sub).toBe("user-1");
    expect(verified.sid).toBe("sess-1");
    expect(verified.iss).toBe("westside-test");
    expect(verified.aud).toBe("westside-test-clients");
    expect(verified.perms).toEqual(["cad.view", "radio.use"]);
    expect(verified.exp - verified.iat).toBe(60);
    expect(verified.jti).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects a token signed with a different key", async () => {
    // Tamper with the signature: flip last char.
    const { jwt } = await signAccessToken(cfg, {
      userId: "user-1",
      sessionId: "sess-1",
      permissions: [],
    });
    const parts = jwt.split(".");
    const tamperedSig = parts[2].slice(0, -1) + (parts[2].endsWith("A") ? "B" : "A");
    const tampered = `${parts[0]}.${parts[1]}.${tamperedSig}`;
    await expect(verifyAccessToken(cfg, tampered)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    // Sign with ttl=0 (already expired at iat+0).
    const expiredCfg = { ...cfg, jwt: { ...cfg.jwt, accessTokenTtlSeconds: -10 } };
    __clearKeyCache();
    const { jwt } = await signAccessToken(expiredCfg, {
      userId: "user-1",
      sessionId: "sess-1",
      permissions: [],
    });
    __clearKeyCache();
    await expect(verifyAccessToken(cfg, jwt)).rejects.toThrow();
  });
});

describe("refresh token", () => {
  it("generates a 32-byte random token and matching hash", () => {
    const t = generateRefreshToken();
    expect(t.raw.length).toBeGreaterThan(40); // base64url of 32 bytes
    expect(t.hash).toBe(hashRefreshToken(t.raw));
    // Same input → same hash (deterministic).
    expect(hashRefreshToken(t.raw)).toBe(hashRefreshToken(t.raw));
  });

  it("produces different tokens on each call", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });

  it("does NOT store the raw token in the hash", () => {
    const t = generateRefreshToken();
    expect(t.hash).not.toContain(t.raw);
    // SHA-256 hex is 64 chars; raw is ~43 chars base64url.
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
