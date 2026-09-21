/**
 * Error envelope tests — verify ApiError maps to correct HTTP status and code.
 */

import { describe, it, expect } from "vitest";
import { ApiError } from "../src/lib/error.ts";
import {
  ErrorCode,
  ERROR_HTTP_STATUS,
  ERROR_PUBLIC_MESSAGE,
} from "@westside/shared";

describe("ApiError", () => {
  it("maps each error code to its expected HTTP status", () => {
    for (const code of Object.keys(ErrorCode) as (keyof typeof ErrorCode)[]) {
      const err = new ApiError(ErrorCode[code]);
      expect(err.status).toBe(ERROR_HTTP_STATUS[ErrorCode[code]]);
      expect(err.code).toBe(ErrorCode[code]);
    }
  });

  it("never exposes an internalMessage to the public message", () => {
    const err = new ApiError(ErrorCode.INTERNAL_ERROR, {
      internalMessage: "very-secret-stack-trace-line-42",
    });
    expect(err.message).toBe(ERROR_PUBLIC_MESSAGE[ErrorCode.INTERNAL_ERROR]);
    expect(err.message).not.toContain("very-secret");
  });

  it("preserves details for client debugging", () => {
    const err = new ApiError(ErrorCode.RBAC_FORBIDDEN, {
      details: { required: ["radio.use"] },
    });
    expect(err.details).toEqual({ required: ["radio.use"] });
  });

  it("isApiError narrows correctly", () => {
    const err = new ApiError(ErrorCode.AUTH_INVALID_CREDENTIALS);
    expect(err instanceof ApiError).toBe(true);
  });
});

describe("error code coverage", () => {
  it("every error code has an HTTP status and public message", () => {
    const codes = Object.keys(ErrorCode) as (keyof typeof ErrorCode)[];
    expect(codes.length).toBeGreaterThan(10);
    for (const k of codes) {
      const code = ErrorCode[k];
      expect(ERROR_HTTP_STATUS[code]).toBeDefined();
      expect(ERROR_PUBLIC_MESSAGE[code]).toBeDefined();
      expect(ERROR_PUBLIC_MESSAGE[code].length).toBeGreaterThan(0);
    }
  });

  it("AUTH_INVALID_CREDENTIALS returns 401", () => {
    expect(ERROR_HTTP_STATUS[ErrorCode.AUTH_INVALID_CREDENTIALS]).toBe(401);
  });

  it("AUTH_ACCOUNT_LOCKED returns 423", () => {
    expect(ERROR_HTTP_STATUS[ErrorCode.AUTH_ACCOUNT_LOCKED]).toBe(423);
  });

  it("RATE_LIMITED returns 429", () => {
    expect(ERROR_HTTP_STATUS[ErrorCode.RATE_LIMITED]).toBe(429);
  });

  it("VALIDATION_FAILED returns 422", () => {
    expect(ERROR_HTTP_STATUS[ErrorCode.VALIDATION_FAILED]).toBe(422);
  });

  it("RBAC_FORBIDDEN returns 403", () => {
    expect(ERROR_HTTP_STATUS[ErrorCode.RBAC_FORBIDDEN]).toBe(403);
  });
});
