/**
 * Westside API — centralised configuration.
 *
 * Reads from environment variables once at startup. The resulting object is
 * frozen and shared across the process. No file reads the .env at runtime —
 * only here.
 *
 * If a required value is missing, we fail fast — better at boot than mid-request.
 */

import { readFileSync } from "node:fs";
import { env } from "node:process";

function required(name: string): string {
  const v = env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, def: string): string {
  const v = env[name];
  return v && v.trim() !== "" ? v : def;
}

function int(name: string, def: number): number {
  const v = env[name];
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be an integer; got: ${v}`);
  return n;
}

function list(name: string, def: string[]): string[] {
  const v = env[name];
  if (!v || v.trim() === "") return def;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function readFileOrThrow(path: string, label: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`Failed to read ${label} at ${path}: ${(err as Error).message}`);
  }
}

export interface AppConfig {
  nodeEnv: string;
  logLevel: string;
  api: {
    port: number;
    baseUrl: string;
    corsOrigins: string[];
  };
  web: {
    baseUrl: string;
  };
  jwt: {
    privateKeyPem: string;
    publicKeyPem: string;
    issuer: string;
    audience: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlSeconds: number;
  };
  argon2: {
    memoryKiB: number;
    timeCost: number;
    parallelism: number;
  };
  rateLimit: {
    perMinuteIp: number;
    perMinuteUser: number;
    loginPer15Min: number;
  };
  accountLockout: {
    threshold: number;
    durationMinutes: number;
  };
  emailVerificationTtlHours: number;
  passwordResetTtlMinutes: number;
  mailFrom: string;
  bootstrap: {
    ownerEmail: string;
    ownerUsername: string;
    ownerPassword: string;
  };
  databaseUrl: string;
  redisUrl: string;
}

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  // JWT keys can come from either a file path (local dev) OR an env var
  // with the PEM content directly (Render / Fly / cloud deploys).
  const privateKeyPath = optional("JWT_PRIVATE_KEY_PATH", "");
  const publicKeyPath = optional("JWT_PUBLIC_KEY_PATH", "");
  const privateKeyInline = optional("JWT_PRIVATE_KEY", "");
  const publicKeyInline = optional("JWT_PUBLIC_KEY", "");

  const privateKeyPem = privateKeyInline
    ? privateKeyInline.replace(/\\n/g, "\n")
    : privateKeyPath
      ? readFileOrThrow(privateKeyPath, "JWT private key")
      : (() => { throw new Error("Either JWT_PRIVATE_KEY or JWT_PRIVATE_KEY_PATH must be set"); })();

  const publicKeyPem = publicKeyInline
    ? publicKeyInline.replace(/\\n/g, "\n")
    : publicKeyPath
      ? readFileOrThrow(publicKeyPath, "JWT public key")
      : (() => { throw new Error("Either JWT_PUBLIC_KEY or JWT_PUBLIC_KEY_PATH must be set"); })();

  cached = Object.freeze({
    nodeEnv: optional("NODE_ENV", "development"),
    logLevel: optional("LOG_LEVEL", "info"),
    api: {
      port: int("API_PORT", 4000),
      baseUrl: required("API_BASE_URL"),
      corsOrigins: list("CORS_ORIGINS", ["http://localhost:3000"]),
    },
    web: {
      baseUrl: required("WEB_BASE_URL"),
    },
    jwt: {
      privateKeyPem,
      publicKeyPem,
      issuer: required("JWT_ISSUER"),
      audience: required("JWT_AUDIENCE"),
      accessTokenTtlSeconds: int("ACCESS_TOKEN_TTL", 60),
      refreshTokenTtlSeconds: int("REFRESH_TOKEN_TTL", 30 * 24 * 60 * 60),
    },
    argon2: {
      memoryKiB: int("ARGON2_MEMORY_KIB", 65536),
      timeCost: int("ARGON2_TIME_COST", 3),
      parallelism: int("ARGON2_PARALLELISM", 4),
    },
    rateLimit: {
      perMinuteIp: int("RATE_LIMIT_PER_MINUTE_IP", 120),
      perMinuteUser: int("RATE_LIMIT_PER_MINUTE_USER", 600),
      loginPer15Min: int("LOGIN_RATE_LIMIT_PER_15MIN", 5),
    },
    accountLockout: {
      threshold: int("ACCOUNT_LOCKOUT_THRESHOLD", 5),
      durationMinutes: int("ACCOUNT_LOCKOUT_DURATION_MINUTES", 15),
    },
    emailVerificationTtlHours: int("EMAIL_VERIFICATION_TTL_HOURS", 24),
    passwordResetTtlMinutes: int("PASSWORD_RESET_TTL_MINUTES", 15),
    mailFrom: optional("MAIL_FROM", "Westside <no-reply@westside.local>"),
    bootstrap: {
      ownerEmail: optional("BOOTSTRAP_OWNER_EMAIL", "owner@westside.local"),
      ownerUsername: optional("BOOTSTRAP_OWNER_USERNAME", "owner"),
      ownerPassword: optional("BOOTSTRAP_OWNER_PASSWORD", "ChangeMe!Strong-Password-2026"),
    },
    databaseUrl: required("DATABASE_URL"),
    redisUrl: required("REDIS_URL"),
  });

  return cached;
}

/** Test-only: override config without env. */
export function __setTestConfig(c: AppConfig): void {
  cached = c;
}
