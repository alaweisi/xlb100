import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../../context/requestContextMiddleware.js";
import { authorizeRequest } from "../../gateway/authz.js";
import {
  supportSlaPolicyService, SupportSlaPolicyConflictError, SupportSlaPolicyForbiddenError,
  SupportSlaPolicyNotFoundError, SupportSlaPolicyValidationError,
} from "./supportSlaPolicyService.js";

function authorize(request: FastifyRequest, reply: FastifyReply) {
  const context = getRequestContext(request);
  const decision = authorizeRequest(context);
  if (!decision.ok) {
    reply.status(decision.statusCode).send({ ok: false, error: decision.message });
    return null;
  }
  return context;
}

function mapError(error: unknown, reply: FastifyReply) {
  if (error instanceof SupportSlaPolicyValidationError) return reply.status(400).send({ ok: false, error: error.message });
  if (error instanceof SupportSlaPolicyForbiddenError) return reply.status(403).send({ ok: false, error: error.message });
  if (error instanceof SupportSlaPolicyNotFoundError) return reply.status(404).send({ ok: false, error: error.message });
  if (error instanceof SupportSlaPolicyConflictError) return reply.status(409).send({ ok: false, error: error.message });
  throw error;
}

function normalizedQuery(query: unknown): unknown {
  if (!query || typeof query !== "object" || Array.isArray(query)) return query;
  const result = { ...(query as Record<string, unknown>) };
  if (typeof result.limit === "string" && /^\d+$/.test(result.limit)) result.limit = Number(result.limit);
  if (result.isActive === "true") result.isActive = true;
  if (result.isActive === "false") result.isActive = false;
  return result;
}

export async function registerSupportSlaPolicyRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = createRequestContextMiddleware({ requireCityCode: true });

  app.get("/api/internal/support/sla-policies", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportSlaPolicyService.list(context, normalizedQuery(request.query)) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.post("/api/internal/support/sla-policies", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportSlaPolicyService.create(context, request.body) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.get("/api/internal/support/sla-policies/:policyId", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportSlaPolicyService.get(context, (request.params as { policyId: string }).policyId) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.patch("/api/internal/support/sla-policies/:policyId", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportSlaPolicyService.update(context, (request.params as { policyId: string }).policyId, request.body) }; }
    catch (error) { return mapError(error, reply); }
  });
}
