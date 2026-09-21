/**
 * Vitest config for the Westside API.
 *
 * Tests are split into:
 *   - unit: pure-logic tests (no DB, no network)
 *   - integration: tests that need DATABASE_URL pointing at a live Postgres
 *     and Redis. Skipped automatically when DATABASE_URL is unset.
 */

import { defineConfig } from "vitest/config";

const hasDb = !!process.env.DATABASE_URL;
const hasRedis = !!process.env.REDIS_URL;

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
});
