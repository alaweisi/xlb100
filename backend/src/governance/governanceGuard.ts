import type { FastifyRequest, FastifyReply } from "fastify";
import { getRequestContext } from "../context/requestContextMiddleware.js";

export async function requireGovernanceAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = getRequestContext(request);
  if (ctx.appType !== "admin" || !["admin", "operator"].includes(ctx.role)) {
    await reply.status(403).send({ ok: false, error: "governance actions require admin operator" });
  }
}
