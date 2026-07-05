import type { FastifyInstance, FastifyRequest } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../context/requestContextMiddleware.js";
import { createEvidenceBundleRequestSchema, attachEvidenceRefRequestSchema } from "@xlb/validators";
import { governanceEvidenceService } from "./governanceEvidenceService.js";
import { requireGovernanceAdmin } from "./governanceGuard.js";

const preHandler = [createRequestContextMiddleware({ requireCityCode: true }), requireGovernanceAdmin];

export async function registerGovernanceEvidenceRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/internal/settlement-action-governance/evidence-bundles", { preHandler }, async (request: FastifyRequest, reply) => {
    const ctx = getRequestContext(request); const body = { ...(request.body as Record<string,unknown>??{}), cityCode: ctx.cityCode };
    const p = createEvidenceBundleRequestSchema.safeParse(body); if (!p.success) return reply.status(400).send({ ok:false,error:"invalid" });
    try { const b = await governanceEvidenceService.createBundle(ctx, p.data); return { ok:true, bundle:b }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
  app.get("/api/internal/settlement-action-governance/evidence-bundles", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request); const q = request.query as { intentId?: string };
    try { const bundles = await governanceEvidenceService.listBundles(ctx, q.intentId); return { ok:true, bundles }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
  app.get<{ Params: { bundleId: string } }>("/api/internal/settlement-action-governance/evidence-bundles/:bundleId", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    try { const b = await governanceEvidenceService.getBundle(ctx, request.params.bundleId); if (!b) return reply.status(404).send({ ok:false,error:"not found" }); return { ok:true, bundle:b }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
  app.post<{ Params: { bundleId: string } }>("/api/internal/settlement-action-governance/evidence-bundles/:bundleId/refs", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request); const body = { ...(request.body as Record<string,unknown>??{}), cityCode: ctx.cityCode };
    const p = attachEvidenceRefRequestSchema.safeParse(body); if (!p.success) return reply.status(400).send({ ok:false,error:"invalid ref" });
    try { const b = await governanceEvidenceService.attachRef(ctx, request.params.bundleId, p.data); if (!b) return reply.status(404).send({ ok:false,error:"not found or not draft" }); return { ok:true, bundle:b }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
  app.delete<{ Params: { bundleId: string; refId: string } }>("/api/internal/settlement-action-governance/evidence-bundles/:bundleId/refs/:refId", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    try { const b = await governanceEvidenceService.removeRef(ctx, request.params.bundleId, request.params.refId); if (!b) return reply.status(404).send({ ok:false,error:"not found or not draft" }); return { ok:true, bundle:b }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
  app.post<{ Params: { bundleId: string } }>("/api/internal/settlement-action-governance/evidence-bundles/:bundleId/archive", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    try { const b = await governanceEvidenceService.archiveBundle(ctx, request.params.bundleId); if (!b) return reply.status(404).send({ ok:false,error:"not found" }); return { ok:true, bundle:b }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
  app.get<{ Params: { intentId: string } }>("/api/internal/settlement-action-governance/audit-trail/:intentId", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    try { const entries = await governanceEvidenceService.getAuditTrail(ctx, request.params.intentId); return { ok:true, entries }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
}
