/**
 * Westside — JWT access tokens + opaque refresh tokens.
 *
 * Access tokens are short-lived (60s by default), RS256-signed JWTs.
 * Refresh tokens are opaque 32-byte random values; only their SHA-256 hash
 * is persisted. Rotation is mandatory: every refresh issues a new refresh
 * token and revokes the previous one. If a revoked token is presented again,
 * the entire family is revoked (refresh-token-reuse detection).
 */

import { createHash, randomBytes } from "node:crypto";
import { SignJWT, importPKCS8, importSPKI, jwtVerify, type KeyLike } from "jose";
import { v4 as uuidv4 } from "uuid";
import type { AppConfig } from "../config/index.ts";
import type { AccessTokenClaims } from "@westside/shared";
import type { Permission } from "@westside/shared";

export interface SignedAccessToken {
  jwt: string;
  claims: AccessTokenClaims;
  expiresAt: Date;
}

export interface RawRefreshToken {
  /** The raw token to return to the client exactly once. */
  raw: string;
  /** The SHA-256 hash to persist. */
  hash: string;
}

export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateRefreshToken(): RawRefreshToken {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashRefreshToken(raw) };
}

export function generateFamilyId(): string {
  return uuidv4();
}

let cachedPrivateKey: KeyLike | null = null;
let cachedPublicKey: KeyLike | null = null;

async function getPrivateKey(cfg: AppConfig): Promise<KeyLike> {
  if (!cachedPrivateKey) {
    cachedPrivateKey = await importPKCS8(cfg.jwt.privateKeyPem, "RS256");
  }
  return cachedPrivateKey;
}

async function getPublicKey(cfg: AppConfig): Promise<KeyLike> {
  if (!cachedPublicKey) {
    cachedPublicKey = await importSPKI(cfg.jwt.publicKeyPem, "RS256");
  }
  return cachedPublicKey;
}

export async function signAccessToken(
  cfg: AppConfig,
  args: {
    userId: string;
    sessionId: string;
    permissions: readonly Permission[];
  },
): Promise<SignedAccessToken> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + cfg.jwt.accessTokenTtlSeconds;
  const jti = uuidv4();

  const claims: AccessTokenClaims = {
    sub: args.userId,
    sid: args.sessionId,
    jti,
    iat,
    exp,
    iss: cfg.jwt.issuer,
    aud: cfg.jwt.audience,
    perms: [...args.permissions],
  };

  const jwt = await new SignJWT({ perms: claims.perms, sid: claims.sid })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setJti(claims.jti)
    .setIssuedAt(claims.iat)
    .setExpirationTime(claims.exp)
    .setIssuer(claims.iss)
    .setAudience(claims.aud)
    .sign(await getPrivateKey(cfg));

  return { jwt, claims, expiresAt: new Date(exp * 1000) };
}

export async function verifyAccessToken(
  cfg: AppConfig,
  token: string,
): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, await getPublicKey(cfg), {
    issuer: cfg.jwt.issuer,
    audience: cfg.jwt.audience,
    algorithms: ["RS256"],
  });

  // Manual extraction so we can validate shape.
  if (typeof payload.sub !== "string") throw new Error("Token missing sub");
  if (typeof payload.jti !== "string") throw new Error("Token missing jti");
  if (typeof payload.sid !== "string") throw new Error("Token missing sid");
  if (typeof payload.exp !== "number") throw new Error("Token missing exp");
  if (typeof payload.iat !== "number") throw new Error("Token missing iat");

  const perms = Array.isArray(payload.perms) ? (payload.perms as Permission[]) : [];
  const aud = typeof payload.aud === "string" ? payload.aud : Array.isArray(payload.aud) ? payload.aud[0] ?? cfg.jwt.audience : cfg.jwt.audience;
  const iss = typeof payload.iss === "string" ? payload.iss : cfg.jwt.issuer;

  return {
    sub: payload.sub,
    sid: payload.sid,
    jti: payload.jti,
    iat: payload.iat,
    exp: payload.exp,
    iss,
    aud,
    perms,
  };
}

/** Test-only: clear cached keys so a new config takes effect. */
export function __clearKeyCache(): void {
  cachedPrivateKey = null;
  cachedPublicKey = null;
}
