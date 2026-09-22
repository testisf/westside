/**
 * Westside — Redis client.
 *
 * Single shared client for the API process. Used for:
 *   - Rate-limit counters (sliding window)
 *   - Session/refresh-token revocation cache (fast denial of revoked tokens)
 *   - WS presence (Phase 3+)
 *
 * NOTE: Redis never holds security-of-record. Postgres is the source of truth.
 * If Redis is wiped, the API keeps working (rate limits reset, presence
 * resets); authorization is always re-checked against Postgres.
 */

import Redis from "ioredis";
import type { AppConfig } from "../config/index.ts";

let client: Redis | null = null;

export function getRedis(cfg: AppConfig): Redis {
  if (client) return client;
  client = new Redis(cfg.redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    // TLS is required for managed Redis; in dev with plain redis:// it's off.
    tls: cfg.redisUrl.startsWith("rediss://") ? {} : undefined,
  });
  client.on("error", (err: Error) => {
    // Don't crash on redis errors; degrade gracefully.
    // eslint-disable-next-line no-console
    console.error("[redis] error:", err.message);
  });
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

/**
 * Sliding-window rate-limit using ZSET + ZREMRANGEBYSCORE.
 *
 * Returns `{ limited: true, retryAfter: seconds }` when over limit,
 * `{ limited: false }` otherwise.
 */
export async function slidingWindowRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ limited: boolean; retryAfter?: number; remaining?: number }> {
  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const windowStart = now - windowSeconds * 1000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, member);
  pipeline.zcard(key);
  pipeline.pexpire(key, windowSeconds * 1000);
  const results = await pipeline.exec();

  if (!results) return { limited: false };

  const card = results[2]?.[1] as number;
  if (card > limit) {
    // Remove the entry we just added so the limit doesn't keep growing.
    await redis.zrem(key, member);
    return { limited: true, retryAfter: windowSeconds, remaining: 0 };
  }
  return { limited: false, remaining: Math.max(0, limit - card) };
}

/**
 * Check the current rate limit count WITHOUT incrementing.
 * Use this to peek at the counter before deciding whether to increment.
 */
export async function checkRateLimitOnly(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ limited: boolean; remaining?: number; currentCount: number }> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zcard(key);
  pipeline.pexpire(key, windowSeconds * 1000);
  const results = await pipeline.exec();

  if (!results) return { limited: false, currentCount: 0 };

  const card = results[1]?.[1] as number;
  if (card >= limit) {
    return { limited: true, remaining: 0, currentCount: card };
  }
  return { limited: false, remaining: Math.max(0, limit - card), currentCount: card };
}
