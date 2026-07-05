import type { FastifyInstance, FastifyRequest } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../context/requestContextMiddleware.js";
import { requireGovernanceAdmin } from "../governance/governanceGuard.js";
import { plannerService } from "./plannerService.js";

const preHandler = [
  createRequestContextMiddleware({ requireCityCode: true }),
  requireGovernanceAdmin,
];

export async function registerPlannerRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/internal/settlement-action-governance/plans — generate dry-run plan
  app.post<{ Body: { readinessPacketId: string } }>(
    "/api/internal/settlement-action-governance/plans",
    { preHandler },
    async (request: FastifyRequest, reply) => {
      const ctx = getRequestContext(request);
      const body = request.body as { readinessPacketId?: string };
      if (!body?.readinessPacketId) {
        return reply.status(400).send({ ok: false, error: "readinessPacketId required" });
      }
      try {
        const result = await plannerService.generateDryRunPlan(ctx, body.readinessPacketId);
        return { ok: true, plan: result.plan, items: result.items };
      } catch (e) {
        return reply.status(500).send({ ok: false, error: String(e) });
      }
    },
  );

  // GET /api/internal/settlement-action-governance/plans — list plans
  app.get(
    "/api/internal/settlement-action-governance/plans",
    { preHandler },
    async (request: FastifyRequest, reply) => {
      const ctx = getRequestContext(request);
      const q = request.query as { intentId?: string };
      try {
        const plans = await plannerService.listPlans(ctx, q.intentId);
        return { ok: true, plans };
      } catch (e) {
        return reply.status(500).send({ ok: false, error: String(e) });
      }
    },
  );

  // GET /api/internal/settlement-action-governance/plans/:planId — get plan
  app.get<{ Params: { planId: string } }>(
    "/api/internal/settlement-action-governance/plans/:planId",
    { preHandler },
    async (request, reply) => {
      const ctx = getRequestContext(request);
      try {
        const plan = await plannerService.getPlan(ctx, request.params.planId);
        if (!plan) {
          return reply.status(404).send({ ok: false, error: "plan not found" });
        }
        return { ok: true, plan };
      } catch (e) {
        return reply.status(500).send({ ok: false, error: String(e) });
      }
    },
  );

  // GET /api/internal/settlement-action-governance/plans/:planId/items — get plan items
  app.get<{ Params: { planId: string } }>(
    "/api/internal/settlement-action-governance/plans/:planId/items",
    { preHandler },
    async (request, reply) => {
      const ctx = getRequestContext(request);
      try {
        const items = await plannerService.getPlanItems(ctx, request.params.planId);
        return { ok: true, items };
      } catch (e) {
        return reply.status(500).send({ ok: false, error: String(e) });
      }
    },
  );

  // GET /api/internal/settlement-action-governance/plans/:planId/audit — get plan audit
  app.get<{ Params: { planId: string } }>(
    "/api/internal/settlement-action-governance/plans/:planId/audit",
    { preHandler },
    async (request, reply) => {
      const ctx = getRequestContext(request);
      try {
        const audit = await plannerService.getPlanAudit(ctx, request.params.planId);
        return { ok: true, audit };
      } catch (e) {
        return reply.status(500).send({ ok: false, error: String(e) });
      }
    },
  );
}
