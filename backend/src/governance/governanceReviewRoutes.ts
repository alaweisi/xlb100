import type { FastifyInstance } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../context/requestContextMiddleware.js";
import { submitReviewRequestSchema, reviewDecisionRequestSchema } from "@xlb/validators";
import { governanceReviewService } from "./governanceReviewService.js";
import { requireGovernanceAdmin } from "./governanceGuard.js";

const preHandler = [createRequestContextMiddleware({ requireCityCode: true }), requireGovernanceAdmin];

export async function registerGovernanceReviewRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { intentId: string } }>("/api/internal/settlement-action-governance/intents/:intentId/reviews", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    const rawBody = (request.body as Record<string, unknown> ?? {});
    const pathIntentId = request.params.intentId;
    if (!ctx.userId) {
      return reply.status(401).send({ ok: false, error: "authenticated admin identity required for governance review" });
    }
    // B3 FIX: reject body intentId mismatch with path
    if (rawBody.intentId && rawBody.intentId !== pathIntentId) {
      return reply.status(400).send({ ok: false, error: "intentId mismatch: path and body must agree" });
    }
    // B2: reject body cityCode mismatch
    if (rawBody.cityCode && rawBody.cityCode !== ctx.cityCode) {
      return reply.status(400).send({ ok: false, error: "cityCode mismatch with request context" });
    }
    const body = { ...rawBody, intentId: pathIntentId, cityCode: ctx.cityCode, submittedByAdminId: ctx.userId };
    const p = submitReviewRequestSchema.safeParse(body);
    if (!p.success) return reply.status(400).send({ ok: false, error: "invalid submit review request" });
    try { const r = await governanceReviewService.submitReview(ctx, p.data); return { ok: true, review: r }; }
    catch (e) { return reply.status(500).send({ ok: false, error: String(e) }); }
  });
  app.get("/api/internal/settlement-action-governance/reviews", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request); const q = request.query as { intentId?: string };
    try { const reviews = await governanceReviewService.listReviews(ctx, q.intentId); return { ok: true, reviews }; }
    catch (e) { return reply.status(500).send({ ok: false, error: String(e) }); }
  });
  app.get<{ Params: { reviewId: string } }>("/api/internal/settlement-action-governance/reviews/:reviewId", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    try { const r = await governanceReviewService.getReview(ctx, request.params.reviewId); if (!r) return reply.status(404).send({ ok: false, error: "not found in city scope" }); return { ok: true, review: r }; }
    catch (e) { return reply.status(500).send({ ok: false, error: String(e) }); }
  });
  app.post<{ Params: { reviewId: string } }>("/api/internal/settlement-action-governance/reviews/:reviewId/approve-governance", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    if (!ctx.userId) return reply.status(401).send({ ok: false, error: "authenticated admin identity required for governance review decision" });
    const p = reviewDecisionRequestSchema.safeParse({ ...(request.body as Record<string, unknown> ?? {}), reviewedByAdminId: ctx.userId }); if (!p.success) return reply.status(400).send({ ok: false, error: "invalid approve request" });
    try { const r = await governanceReviewService.approveReview(ctx, request.params.reviewId, p.data); if (!r) return reply.status(404).send({ ok: false, error: "not found or not pending_review" }); return { ok: true, review: r }; }
    catch (e) { return reply.status(500).send({ ok: false, error: String(e) }); }
  });
  app.post<{ Params: { reviewId: string } }>("/api/internal/settlement-action-governance/reviews/:reviewId/reject-governance", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    if (!ctx.userId) return reply.status(401).send({ ok: false, error: "authenticated admin identity required for governance review decision" });
    const p = reviewDecisionRequestSchema.safeParse({ ...(request.body as Record<string, unknown> ?? {}), reviewedByAdminId: ctx.userId }); if (!p.success) return reply.status(400).send({ ok: false, error: "invalid reject request" });
    try { const r = await governanceReviewService.rejectReview(ctx, request.params.reviewId, p.data); if (!r) return reply.status(404).send({ ok: false, error: "not found or not pending_review" }); return { ok: true, review: r }; }
    catch (e) { return reply.status(500).send({ ok: false, error: String(e) }); }
  });
  app.post<{ Params: { reviewId: string } }>("/api/internal/settlement-action-governance/reviews/:reviewId/request-changes", { preHandler }, async (request, reply) => {
    const ctx = getRequestContext(request);
    if (!ctx.userId) return reply.status(401).send({ ok: false, error: "authenticated admin identity required for governance review decision" });
    const p = reviewDecisionRequestSchema.safeParse({ ...(request.body as Record<string, unknown> ?? {}), reviewedByAdminId: ctx.userId }); if (!p.success) return reply.status(400).send({ ok: false, error: "invalid request-changes" });
    try { const r = await governanceReviewService.requestChanges(ctx, request.params.reviewId, p.data); if (!r) return reply.status(404).send({ ok: false, error: "not found or not pending_review" }); return { ok: true, review: r }; }
    catch (e) { return reply.status(500).send({ ok: false, error: String(e) }); }
  });
}
