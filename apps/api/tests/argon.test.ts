/**
 * Password hashing tests — Argon2id hash/verify, rehash detection.
 */

import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  hashNeedsRehash,
  buildArgonOptions,
} from "../src/lib/argon.ts";
import argon2 from "argon2";

const cfg = {
  argon2: { memoryKiB: 4096, timeCost: 2, parallelism: 1 },
} as any;

describe("argon2 hashing", () => {
  it("hashes a password and verifies it", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-9!", cfg);
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "Correct-Horse-Battery-9!")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("produces a different hash for the same password (random salt)", async () => {
    const a = await hashPassword("Correct-Horse-Battery-9!", cfg);
    const b = await hashPassword("Correct-Horse-Battery-9!", cfg);
    expect(a).not.toBe(b);
  });

  it("returns true (does not throw) for a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
    expect(hashNeedsRehash("not-a-hash", cfg)).toBe(true);
  });

  it("does NOT flag a fresh hash with current parameters as needing rehash", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-9!", cfg);
    expect(hashNeedsRehash(hash, cfg)).toBe(false);
  });

  it("flags a hash created with weaker memoryCost as needing rehash", async () => {
    // Create a hash with explicitly weaker memoryCost but valid timeCost.
    const weakHash = await argon2.hash("Correct-Horse-Battery-9!", {
      type: argon2.argon2id,
      memoryCost: 1024,  // weaker than cfg.argon2.memoryKiB (4096)
      timeCost: 2,
      parallelism: 1,
    });
    // The hash string should encode the weaker m= value.
    expect(weakHash).toContain("m=1024");
    // Our wrapper should detect it.
    const result = hashNeedsRehash(weakHash, cfg);
    expect(result).toBe(true);
  });

  it("buildArgonOptions uses argon2id", () => {
    const opts = buildArgonOptions(cfg);
    expect(opts.type).toBe(argon2.argon2id);
    expect(opts.memoryCost).toBe(4096);
    expect(opts.timeCost).toBe(2);
    expect(opts.parallelism).toBe(1);
  });
});
