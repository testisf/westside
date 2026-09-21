/**
 * Westside — Argon2id password hashing.
 *
 * Hashes use OWASP-recommended Argon2id parameters. The serialized hash string
 * embeds the parameters used (m, t, p, salt) so we can detect old hashes and
 * transparently re-hash on the next login when we bump parameters.
 */

import argon2 from "argon2";
import type { AppConfig } from "../config/index.ts";

export interface ArgonOptions {
  memoryKiB: number;
  timeCost: number;
  parallelism: number;
}

export function buildArgonOptions(cfg: AppConfig): argon2.Options {
  return {
    type: argon2.argon2id,
    memoryCost: cfg.argon2.memoryKiB,
    timeCost: cfg.argon2.timeCost,
    parallelism: cfg.argon2.parallelism,
  };
}

export async function hashPassword(plain: string, cfg: AppConfig): Promise<string> {
  return argon2.hash(plain, buildArgonOptions(cfg));
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed hash — treat as wrong password. Never throw to the caller;
    // a thrown error would leak whether the user exists.
    return false;
  }
}

export function serializeParams(cfg: AppConfig): string {
  return JSON.stringify({
    type: "argon2id",
    m: cfg.argon2.memoryKiB,
    t: cfg.argon2.timeCost,
    p: cfg.argon2.parallelism,
  });
}

/** Returns true if the hash was created with weaker params than current policy. */
export function hashNeedsRehash(hash: string, cfg: AppConfig): boolean {
  try {
    return argon2.needsRehash(hash, buildArgonOptions(cfg));
  } catch {
    return true;
  }
}
