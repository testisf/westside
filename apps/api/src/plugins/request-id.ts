/**
 * Westside — request-id plugin.
 *
 * Adds an `X-Request-Id` header to every request (using the inbound header
 * if provided by a trusted proxy, otherwise generating a UUID v4). The id is
 * attached to `req.id`, propagated to all logs, audit entries, and the
 * response envelope so a user can quote it to support.
 */

import fp from "fastify-plugin";
import { v4 as uuidv4 } from "uuid";

export default fp(async function requestIdPlugin(app) {
  app.addHook("onRequest", async (req, reply) => {
    const inbound = req.headers["x-request-id"];
    const id =
      typeof inbound === "string" && inbound.length > 0 && inbound.length <= 64
        ? inbound
        : uuidv4();
    req.id = id;
    reply.header("x-request-id", id);
  });
}, { name: "request-id" });
