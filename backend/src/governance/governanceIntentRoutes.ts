import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import {
  createGovernanceIntentRequestSchema,
  governanceIntentListQuerySchema,
} from "@xlb/validators";
import { governanceIntentService } from "./governanceIntentService.js";

const preHandler = createRequestContextMiddleware({ requireCityCode: true });

export async function registerGovernanceIntentRoutes(app: FastifyInstance): Promise<void> {
  // ── POST: Create governance intent draft ──
  app.post(
    "/api/internal/settlement-action-governance/intents",
    { preHandler },
    async (request: FastifyRequest, reply) => {
      const context = getRequestContext(request);
      const parsed = createGovernanceIntentRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "invalid governance intent request" });
      }
      try {
        const intent = await governanceIntentService.createDraft(context, parsed.data);
        return { ok: true, intent };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ ok: false, error: msg });
      }
    },
  );

  // ── GET: List governance intents ──
  app.get(
    "/api/internal/settlement-action-governance/intents",
    { preHandler },
    async (request: FastifyRequest, reply) => {
      const context = getRequestContext(request);
      const parsed = governanceIntentListQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "invalid list query parameters" });
      }
      try {
        const intents = await governanceIntentService.listIntents(context, parsed.data);
        return { ok: true, intents };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ ok: false, error: msg });
      }
    },
  );

  // ── GET: Read governance intent by ID ──
  app.get<{ Params: { id: string } }>(
    "/api/internal/settlement-action-governance/intents/:id",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      try {
        const intent = await governanceIntentService.getIntent(context, request.params.id);
        if (intent === null) {
          return reply.status(404).send({ ok: false, error: "governance intent not found in city scope" });
        }
        return { ok: true, intent };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ ok: false, error: msg });
      }
    },
  );

  // ── POST: Cancel governance intent ──
  app.post<{ Params: { id: string } }>(
    "/api/internal/settlement-action-governance/intents/:id/cancel",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      try {
        const intent = await governanceIntentService.cancelIntent(context, request.params.id);
        if (intent === null) {
          return reply.status(404).send({ ok: false, error: "governance intent not found in city scope" });
        }
        return { ok: true, intent };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ ok: false, error: msg });
      }
    },
  );

  // ── POST: Archive governance intent ──
  app.post<{ Params: { id: string } }>(
    "/api/internal/settlement-action-governance/intents/:id/archive",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      try {
        const intent = await governanceIntentService.archiveIntent(context, request.params.id);
        if (intent === null) {
          return reply.status(404).send({ ok: false, error: "governance intent not found in city scope" });
        }
        return { ok: true, intent };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ ok: false, error: msg });
      }
    },
  );
}
