import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../../context/requestContextMiddleware.js";
import { authorizeRequest } from "../../gateway/authz.js";
import {
  supportTicketService, SupportTicketConflictError, SupportTicketForbiddenError,
  SupportTicketNotFoundError, SupportTicketValidationError,
} from "./supportTicketService.js";
import { InvalidSupportTicketTransitionError } from "./supportTicketStateMachine.js";

function mapError(error: unknown, reply: FastifyReply) {
  if (error instanceof SupportTicketValidationError) return reply.status(400).send({ ok: false, error: error.message });
  if (error instanceof SupportTicketForbiddenError) return reply.status(403).send({ ok: false, error: error.message });
  if (error instanceof SupportTicketNotFoundError) return reply.status(404).send({ ok: false, error: error.message });
  if (error instanceof SupportTicketConflictError || error instanceof InvalidSupportTicketTransitionError) {
    return reply.status(409).send({ ok: false, error: error.message });
  }
  throw error;
}

function authorize(request: FastifyRequest, reply: FastifyReply) {
  const context = getRequestContext(request);
  const decision = authorizeRequest(context);
  if (!decision.ok) {
    reply.status(decision.statusCode).send({ ok: false, error: decision.message });
    return null;
  }
  return context;
}

function normalizedQuery(query: unknown): unknown {
  if (!query || typeof query !== "object" || Array.isArray(query)) return query;
  const result = { ...(query as Record<string, unknown>) };
  if (typeof result.limit === "string" && /^\d+$/.test(result.limit)) result.limit = Number(result.limit);
  return result;
}

export async function registerSupportTicketRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = createRequestContextMiddleware({ requireCityCode: true });

  app.post("/api/support/tickets", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportTicketService.create(context, request.body) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.get("/api/support/tickets", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportTicketService.listRequester(context, normalizedQuery(request.query)) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.get("/api/support/tickets/:ticketId", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try {
      return { ok: true, detail: await supportTicketService.getRequester(
        context, (request.params as { ticketId: string }).ticketId,
      ) };
    } catch (error) { return mapError(error, reply); }
  });
  app.post("/api/support/tickets/:ticketId/events", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return await supportTicketService.commentRequester(context, (request.params as { ticketId: string }).ticketId, request.body); }
    catch (error) { return mapError(error, reply); }
  });
  app.post("/api/support/tickets/:ticketId/reopen", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return await supportTicketService.reopen(context, (request.params as { ticketId: string }).ticketId, request.body); }
    catch (error) { return mapError(error, reply); }
  });

  app.get("/api/internal/support/tickets", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return { ok: true, ...await supportTicketService.listAdmin(context, normalizedQuery(request.query)) }; }
    catch (error) { return mapError(error, reply); }
  });
  app.get("/api/internal/support/tickets/:ticketId", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try {
      return { ok: true, detail: await supportTicketService.getAdmin(
        context, (request.params as { ticketId: string }).ticketId,
      ) };
    } catch (error) { return mapError(error, reply); }
  });
  app.post("/api/internal/support/tickets/:ticketId/events", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return await supportTicketService.commentAdmin(context, (request.params as { ticketId: string }).ticketId, request.body); }
    catch (error) { return mapError(error, reply); }
  });
  app.post("/api/internal/support/tickets/:ticketId/claim", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try { return await supportTicketService.claim(context,
      (request.params as { ticketId: string }).ticketId, request.body); }
    catch (error) { return mapError(error, reply); }
  });

  for (const action of ["assign", "escalate", "resolve", "close"] as const) {
    app.post(`/api/internal/support/tickets/:ticketId/${action}`, { preHandler }, async (request, reply) => {
      const context = authorize(request, reply); if (!context) return;
      try {
        const ticketId = (request.params as { ticketId: string }).ticketId;
        return await supportTicketService[action](context, ticketId, request.body);
      } catch (error) { return mapError(error, reply); }
    });
  }
}
