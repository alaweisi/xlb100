import type { FastifyRequest, FastifyReply } from "fastify";
import { getRequestContext } from "../context/requestContextMiddleware.js";
import { canAccessAdminOperation } from "../auth/operationsAuthorization.js";

export async function requireGovernanceAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const ctx = getRequestContext(request);
  if (!canAccessAdminOperation(ctx, ["admin", "operator"])) {
    await reply.status(403).send({ ok: false, error: "governance actions require admin operator" });
  }
}
