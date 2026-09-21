/**
 * API key hashing tests.
 */

import { describe, it, expect } from "vitest";
import { createHash, randomBytes } from "node:crypto";

const KEY_PREFIX = "wsk_";

// Mirror the logic in modules/apikeys/routes.ts.
function generateApiKey(): { raw: string; hash: string; prefix: string } {
  const bytes = randomBytes(32);
  const raw = `${KEY_PREFIX}${bytes.toString("base64url")}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, KEY_PREFIX.length + 8);
  return { raw, hash, prefix };
}

describe("API key generation", () => {
  it("generates a key with the wsk_ prefix", () => {
    const k = generateApiKey();
    expect(k.raw.startsWith(KEY_PREFIX)).toBe(true);
    expect(k.raw.length).toBeGreaterThan(40);
  });

  it("produces a 64-char hex SHA-256 hash", () => {
    const k = generateApiKey();
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hash is deterministic for the same input", () => {
    const k = generateApiKey();
    const h = createHash("sha256").update(k.raw).digest("hex");
    expect(h).toBe(k.hash);
  });

  it("does NOT store the raw key in the hash", () => {
    const k = generateApiKey();
    expect(k.hash).not.toContain(k.raw);
    expect(k.hash).not.toContain(k.raw.slice(KEY_PREFIX.length));
  });

  it("prefix is shorter than the raw key (safe to display in UI)", () => {
    const k = generateApiKey();
    expect(k.prefix.length).toBeLessThan(k.raw.length);
    expect(k.prefix.startsWith(KEY_PREFIX)).toBe(true);
  });

  it("two consecutive calls produce different keys", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});
