/**
 * Westside — global error handler.
 *
 * Every error that reaches the response is mapped through ApiError before
 * being sent. We never leak:
 *   - stack traces
 *   - DB error messages
 *   - internal file paths
 *   - internal variable names
 */

import fp from "fastify-plugin";
import { ZodError } from "zod";
import { ApiError } from "../lib/error.ts";
import { ErrorCode, ERROR_PUBLIC_MESSAGE } from "@westside/shared";

export default fp(async function errorHandlerPlugin(app) {
  app.setErrorHandler((err: unknown, req, reply) => {
    // Zod validation → 422 VALIDATION_FAILED
    if (err instanceof ZodError) {
      reply.code(422).send({
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: ERROR_PUBLIC_MESSAGE[ErrorCode.VALIDATION_FAILED],
          details: { issues: err.issues.map((i) => ({ path: i.path, message: i.message })) },
          requestId: req.id,
        },
      });
      return;
    }

    // Our error class → map directly.
    if (err instanceof ApiError) {
      if (err.status >= 500) {
        app.log.error({ err: err.internalMessage ?? err.message, code: err.code, requestId: req.id }, "api error");
      } else if (err.status >= 400) {
        app.log.warn({ code: err.code, requestId: req.id }, "client error");
      }
      reply.code(err.status).send({
        error: {
          code: err.code,
          message: ERROR_PUBLIC_MESSAGE[err.code],
          details: err.details,
          requestId: req.id,
        },
      });
      return;
    }

    // Fastify's own validation errors (err.validation is set).
    const e = err as { validation?: unknown; message: string; validationContext?: string; statusCode?: number };
    if (e.validation) {
      reply.code(422).send({
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: ERROR_PUBLIC_MESSAGE[ErrorCode.VALIDATION_FAILED],
          details: { issues: [{ path: e.validationContext ?? [], message: e.message }] },
          requestId: req.id,
        },
      });
      return;
    }

    // Rate-limit errors (already shaped by plugin).
    if (e.statusCode === 429) {
      reply.code(429).send({
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: ERROR_PUBLIC_MESSAGE[ErrorCode.RATE_LIMITED],
          requestId: req.id,
        },
      });
      return;
    }

    // Everything else → 500 INTERNAL_ERROR, but log the real error.
    app.log.error({ err, requestId: req.id }, "unhandled error");
    reply.code(500).send({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: ERROR_PUBLIC_MESSAGE[ErrorCode.INTERNAL_ERROR],
        requestId: req.id,
      },
    });
  });

  // 404 handler.
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: {
        code: ErrorCode.NOT_FOUND,
        message: ERROR_PUBLIC_MESSAGE[ErrorCode.NOT_FOUND],
        requestId: req.id,
      },
    });
  });
}, { name: "error-handler" });
