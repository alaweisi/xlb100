import type { FastifyInstance, FastifyRequest } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../context/requestContextMiddleware.js";
import { requireGovernanceAdmin } from "../governance/governanceGuard.js";
import { envelopeService } from "./envelopeService.js";

const preHandler = [
  createRequestContextMiddleware({ requireCityCode: true }),
  requireGovernanceAdmin,
];

export async function registerPreparationRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/internal/settlement-action-governance/preparation-envelopes — create envelope
  app.post<{ Body: { sourcePacketId: string } }>(
    "/api/internal/settlement-action-governance/preparation-envelopes",
    { preHandler },
    async (request: FastifyRequest, reply) => {
      const ctx = getRequestContext(request);
      const body = request.body as { sourcePacketId?: string };
      if (!body?.sourcePacketId) {
        return reply.status(400).send({ ok: false, error: "sourcePacketId required" });
      }
      try {
        const envelope = await envelopeService.createEnvelope(ctx, body.sourcePacketId);
        return { ok: true, envelope };
      } catch (e) {
        return reply.status(500).send({ ok: false, error: String(e) });
      }
    },
  );

  // POST /api/internal/settlement-action-governance/preparation-envelopes/:envelopeId/freeze
  app.post<{ Params: { envelopeId: string } }>(
    "/api/internal/settlement-action-governance/preparation-envelopes/:envelopeId/freeze",
    { preHandler },
    async (request, reply) => {
      const ctx = getRequestContext(request);
      try {
        const envelope = await envelopeService.freezeEnvelope(ctx, request.params.envelopeId);
        return { ok: true, envelope };
      } catch (e) {
        return reply.status(500).send({ ok: false, error: String(e) });
      }
    },
  );

  // POST /api/internal/settlement-action-governance/preparation-envelopes/:envelopeId/approve
  app.post<{ Params: { envelopeId: string } }>(
    "/api/internal/settlement-action-governance/preparation-envelopes/:envelopeId/approve",
    { preHandler },
    async (request, reply) => {
      const ctx = getRequestContext(request);
      try {
        const envelope = await envelopeService.approveEnvelope(ctx, request.params.envelopeId);
        return { ok: true, envelope };
      } catch (e) {
        return reply.status(500).send({ ok: false, error: String(e) });
      }
    },
  );

  // GET /api/internal/settlement-action-governance/preparation-envelopes — list envelopes
  app.get(
    "/api/internal/settlement-action-governance/preparation-envelopes",
    { preHandler },
    async (request: FastifyRequest, reply) => {
      const ctx = getRequestContext(request);
      const q = request.query as { sourcePacketId?: string };
      try {
        const envelopes = await envelopeService.listEnvelopes(ctx, q.sourcePacketId);
        return { ok: true, envelopes };
      } catch (e) {
        return reply.status(500).send({ ok: false, error: String(e) });
      }
    },
  );

  // GET /api/internal/settlement-action-governance/preparation-envelopes/:envelopeId
  app.get<{ Params: { envelopeId: string } }>(
    "/api/internal/settlement-action-governance/preparation-envelopes/:envelopeId",
    { preHandler },
    async (request, reply) => {
      const ctx = getRequestContext(request);
      try {
        const envelope = await envelopeService.getEnvelope(ctx, request.params.envelopeId);
        if (!envelope) {
          return reply.status(404).send({ ok: false, error: "envelope not found" });
        }
        return { ok: true, envelope };
      } catch (e) {
        return reply.status(500).send({ ok: false, error: String(e) });
      }
    },
  );

  // GET /api/internal/settlement-action-governance/preparation-envelopes/:envelopeId/items
  app.get<{ Params: { envelopeId: string } }>(
    "/api/internal/settlement-action-governance/preparation-envelopes/:envelopeId/items",
    { preHandler },
    async (request, reply) => {
      const ctx = getRequestContext(request);
      try {
        const items = await envelopeService.getEnvelopeItems(ctx, request.params.envelopeId);
        return { ok: true, items };
      } catch (e) {
        return reply.status(500).send({ ok: false, error: String(e) });
      }
    },
  );

  // GET /api/internal/settlement-action-governance/preparation-envelopes/:envelopeId/audit
  app.get<{ Params: { envelopeId: string } }>(
    "/api/internal/settlement-action-governance/preparation-envelopes/:envelopeId/audit",
    { preHandler },
    async (request, reply) => {
      const ctx = getRequestContext(request);
      try {
        const audit = await envelopeService.getEnvelopeAudit(ctx, request.params.envelopeId);
        return { ok: true, audit };
      } catch (e) {
        return reply.status(500).send({ ok: false, error: String(e) });
      }
    },
  );
}
