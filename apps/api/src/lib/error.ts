/**
 * Westside — HTTP error class.
 *
 * Throwing this from a route handler causes the error handler plugin to emit
 * the appropriate HTTP status + error envelope, without leaking internals.
 */

import { ErrorCode, ERROR_HTTP_STATUS, ERROR_PUBLIC_MESSAGE } from "@westside/shared";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly internalMessage?: string;

  constructor(
    code: ErrorCode,
    opts: {
      details?: Record<string, unknown>;
      internalMessage?: string;
    } = {},
  ) {
    super(ERROR_PUBLIC_MESSAGE[code]);
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_HTTP_STATUS[code];
    this.details = opts.details;
    this.internalMessage = opts.internalMessage;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
