import type { FastifyInstance, FastifyRequest } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../context/requestContextMiddleware.js";
import { createReadinessPacketRequestSchema } from "@xlb/validators";
import { governanceReadinessService } from "./governanceReadinessService.js";
import { requireGovernanceAdmin } from "./governanceGuard.js";

const preHandler = [createRequestContextMiddleware({ requireCityCode: true }), requireGovernanceAdmin];

export async function registerGovernanceReadinessRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/internal/settlement-action-governance/readiness-packets", { preHandler }, async (request: FastifyRequest, reply) => {
    const ctx = getRequestContext(request); if (!ctx.userId) return reply.status(401).send({ ok:false,error:"authenticated admin identity required for readiness packet" }); const body = { ...(request.body as Record<string,unknown>??{}), cityCode: ctx.cityCode, createdByAdminId: ctx.userId };
    const p = createReadinessPacketRequestSchema.safeParse(body); if (!p.success) return reply.status(400).send({ ok:false,error:"invalid" });
    try { const packet = await governanceReadinessService.create(ctx, p.data); return { ok:true, packet }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
  app.get("/api/internal/settlement-action-governance/readiness-packets", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request); const q = request.query as { intentId?: string };
    try { const packets = await governanceReadinessService.list(ctx, q.intentId); return { ok:true, packets }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
  app.get<{ Params: { packetId: string } }>("/api/internal/settlement-action-governance/readiness-packets/:packetId", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    try { const p = await governanceReadinessService.get(ctx, request.params.packetId); if (!p) return reply.status(404).send({ ok:false,error:"not found" }); return { ok:true, packet:p }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
  app.post<{ Params: { packetId: string } }>("/api/internal/settlement-action-governance/readiness-packets/:packetId/recompute-checks", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    try { const p = await governanceReadinessService.recomputeChecks(ctx, request.params.packetId); if (!p) return reply.status(404).send({ ok:false,error:"not found" }); return { ok:true, packet:p }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
  app.post<{ Params: { packetId: string } }>("/api/internal/settlement-action-governance/readiness-packets/:packetId/mark-blocked", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    try { const p = await governanceReadinessService.markBlocked(ctx, request.params.packetId); if (!p) return reply.status(404).send({ ok:false,error:"not found" }); return { ok:true, packet:p }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
  app.post<{ Params: { packetId: string } }>("/api/internal/settlement-action-governance/readiness-packets/:packetId/archive", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    try { const p = await governanceReadinessService.archive(ctx, request.params.packetId); if (!p) return reply.status(404).send({ ok:false,error:"not found" }); return { ok:true, packet:p }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
  app.post<{ Params: { packetId: string } }>("/api/internal/settlement-action-governance/readiness-packets/:packetId/mark-ready-for-review", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    try { const p = await governanceReadinessService.markReadyForFuturePhaseReview(ctx, request.params.packetId); if (!p) return reply.status(404).send({ ok:false,error:"not found" }); return { ok:true, packet:p }; } catch(e) { return reply.status(500).send({ ok:false,error:String(e) }); }
  });
}
