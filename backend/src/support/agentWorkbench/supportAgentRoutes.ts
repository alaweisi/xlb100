import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../../context/requestContextMiddleware.js";
import { authorizeRequest } from "../../gateway/authz.js";
import {
  supportAgentService, SupportAgentConflictError, SupportAgentForbiddenError,
  SupportAgentNotFoundError, SupportAgentValidationError,
} from "./supportAgentService.js";

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
  if (error instanceof SupportAgentValidationError) return reply.status(400).send({ ok: false, error: error.message });
  if (error instanceof SupportAgentForbiddenError) return reply.status(403).send({ ok: false, error: error.message });
  if (error instanceof SupportAgentNotFoundError) return reply.status(404).send({ ok: false, error: error.message });
  if (error instanceof SupportAgentConflictError) return reply.status(409).send({ ok: false, error: error.message });
  throw error;
}

function normalizedQuery(query: unknown): unknown {
  if (!query || typeof query !== "object" || Array.isArray(query)) return query;
  const result = { ...(query as Record<string, unknown>) };
  if (typeof result.limit === "string" && /^\d+$/.test(result.limit)) result.limit = Number(result.limit);
  for (const key of ["isActive", "isDefault"]) {
    if (result[key] === "true") result[key] = true;
    if (result[key] === "false") result[key] = false;
  }
  return result;
}

export async function registerSupportAgentRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = createRequestContextMiddleware({ requireCityCode: true });

  app.get("/api/internal/support/agents", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportAgentService.listAgents(context, normalizedQuery(request.query)) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.post("/api/internal/support/agents", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportAgentService.createAgent(context, request.body) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.get("/api/internal/support/agents/:agentId", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportAgentService.getAgent(context, (request.params as { agentId: string }).agentId) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.patch("/api/internal/support/agents/:agentId", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportAgentService.updateAgent(context, (request.params as { agentId: string }).agentId, request.body) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.delete("/api/internal/support/agents/:agentId", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportAgentService.deleteAgent(context, (request.params as { agentId: string }).agentId, request.body) }; }
    catch (error) { return mapError(error, reply); }
  });

  app.get("/api/internal/support/skill-groups", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportAgentService.listSkillGroups(context, normalizedQuery(request.query)) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.post("/api/internal/support/skill-groups", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportAgentService.createSkillGroup(context, request.body) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.get("/api/internal/support/skill-groups/:skillGroupId", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportAgentService.getSkillGroup(context, (request.params as { skillGroupId: string }).skillGroupId) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.patch("/api/internal/support/skill-groups/:skillGroupId", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportAgentService.updateSkillGroup(context, (request.params as { skillGroupId: string }).skillGroupId, request.body) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.delete("/api/internal/support/skill-groups/:skillGroupId", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportAgentService.deleteSkillGroup(context, (request.params as { skillGroupId: string }).skillGroupId, request.body) }; }
    catch (error) { return mapError(error, reply); }
  });

  app.get("/api/internal/support/agents/:agentId/skill-groups", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportAgentService.listMemberships(context, (request.params as { agentId: string }).agentId) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.post("/api/internal/support/agents/:agentId/skill-groups", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportAgentService.addMembership(context, (request.params as { agentId: string }).agentId, request.body) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.delete("/api/internal/support/agents/:agentId/skill-groups/:skillGroupId", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    const params = request.params as { agentId: string; skillGroupId: string };
    try { return { ok: true, ...await supportAgentService.removeMembership(context, params.agentId, params.skillGroupId, request.body) }; }
    catch (error) { return mapError(error, reply); }
  });
}
