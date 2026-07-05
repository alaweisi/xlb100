import type { FastifyInstance, FastifyRequest } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../context/requestContextMiddleware.js";
import { createGovernanceIntentRequestSchema, governanceIntentListQuerySchema } from "@xlb/validators";
import { governanceIntentService } from "./governanceIntentService.js";
import { requireGovernanceAdmin } from "./governanceGuard.js";

const preHandler = [createRequestContextMiddleware({ requireCityCode: true }), requireGovernanceAdmin];

export async function registerGovernanceIntentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/internal/settlement-action-governance/intents", { preHandler }, async (request: FastifyRequest, reply) => {
    const ctx = getRequestContext(request);
    const rawBody = (request.body as Record<string, unknown> ?? {});
    // B2 FIX: reject body cityCode mismatch instead of silently overriding
    if (rawBody.cityCode && rawBody.cityCode !== ctx.cityCode) {
      return reply.status(400).send({ ok: false, error: "cityCode mismatch with request context" });
    }
    const body = { ...rawBody, cityCode: ctx.cityCode };
    const p = createGovernanceIntentRequestSchema.safeParse(body);
    if (!p.success) return reply.status(400).send({ ok: false, error: "invalid governance intent request" });
    try { const intent = await governanceIntentService.createDraft(ctx, p.data); return { ok: true, intent }; }
    catch (e) { return reply.status(500).send({ ok: false, error: String(e) }); }
  });
  app.get("/api/internal/settlement-action-governance/intents", { preHandler }, async (request: FastifyRequest, reply) => {
    const ctx = getRequestContext(request);
    const rawQuery = (request.query ?? {}) as Record<string, unknown>;
    // B1 FIX: reject list query cityCode mismatch
    if (rawQuery.cityCode && rawQuery.cityCode !== ctx.cityCode) {
      return reply.status(400).send({ ok: false, error: "query cityCode cannot override request context city" });
    }
    const pq = governanceIntentListQuerySchema.safeParse(request.query ?? {});
    if (!pq.success) return reply.status(400).send({ ok: false, error: "invalid list query" });
    try { const intents = await governanceIntentService.listIntents(ctx, pq.data); return { ok: true, intents }; }
    catch (e) { return reply.status(500).send({ ok: false, error: String(e) }); }
  });
  app.get<{ Params: { id: string } }>("/api/internal/settlement-action-governance/intents/:id", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    try { const i = await governanceIntentService.getIntent(ctx, request.params.id); if (!i) return reply.status(404).send({ ok: false, error: "not found in city scope" }); return { ok: true, intent: i }; }
    catch (e) { return reply.status(500).send({ ok: false, error: String(e) }); }
  });
  app.post<{ Params: { id: string } }>("/api/internal/settlement-action-governance/intents/:id/cancel", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    try { const i = await governanceIntentService.cancelIntent(ctx, request.params.id); if (!i) return reply.status(404).send({ ok: false, error: "not found or cannot cancel" }); return { ok: true, intent: i }; }
    catch (e) { return reply.status(500).send({ ok: false, error: String(e) }); }
  });
  app.post<{ Params: { id: string } }>("/api/internal/settlement-action-governance/intents/:id/archive", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    try { const i = await governanceIntentService.archiveIntent(ctx, request.params.id); if (!i) return reply.status(404).send({ ok: false, error: "not found or cannot archive" }); return { ok: true, intent: i }; }
    catch (e) { return reply.status(500).send({ ok: false, error: String(e) }); }
  });
}
