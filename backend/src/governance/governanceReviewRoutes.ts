import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import {
  submitReviewRequestSchema,
  reviewDecisionRequestSchema,
} from "@xlb/validators";
import { governanceReviewService } from "./governanceReviewService.js";

const preHandler = createRequestContextMiddleware({ requireCityCode: true });

export async function registerGovernanceReviewRoutes(app: FastifyInstance): Promise<void> {
  // ── POST: Submit governance intent for review ──
  app.post(
    "/api/internal/settlement-action-governance/intents/:intentId/reviews",
    { preHandler },
    async (request: FastifyRequest, reply) => {
      const context = getRequestContext(request);
      const parsed = submitReviewRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "invalid submit review request" });
      }
      try {
        const review = await governanceReviewService.submitReview(context, parsed.data);
        return { ok: true, review };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ ok: false, error: msg });
      }
    },
  );

  // ── GET: List reviews for an intent ──
  app.get<{ Params: { intentId: string } }>(
    "/api/internal/settlement-action-governance/reviews",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const q = request.query as { intentId?: string };
      try {
        const reviews = await governanceReviewService.listReviews(context, q.intentId);
        return { ok: true, reviews };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ ok: false, error: msg });
      }
    },
  );

  // ── GET: Read review detail ──
  app.get<{ Params: { reviewId: string } }>(
    "/api/internal/settlement-action-governance/reviews/:reviewId",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      try {
        const review = await governanceReviewService.getReview(context, request.params.reviewId);
        if (review === null) {
          return reply.status(404).send({ ok: false, error: "governance review not found in city scope" });
        }
        return { ok: true, review };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ ok: false, error: msg });
      }
    },
  );

  // ── POST: Approve governance review ──
  app.post<{ Params: { reviewId: string } }>(
    "/api/internal/settlement-action-governance/reviews/:reviewId/approve-governance",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const parsed = reviewDecisionRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "invalid approve request" });
      }
      try {
        const review = await governanceReviewService.approveReview(context, request.params.reviewId, parsed.data);
        if (review === null) {
          return reply.status(404).send({ ok: false, error: "governance review not found or not in pending_review status" });
        }
        return { ok: true, review };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ ok: false, error: msg });
      }
    },
  );

  // ── POST: Reject governance review ──
  app.post<{ Params: { reviewId: string } }>(
    "/api/internal/settlement-action-governance/reviews/:reviewId/reject-governance",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const parsed = reviewDecisionRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "invalid reject request" });
      }
      try {
        const review = await governanceReviewService.rejectReview(context, request.params.reviewId, parsed.data);
        if (review === null) {
          return reply.status(404).send({ ok: false, error: "governance review not found or not in pending_review status" });
        }
        return { ok: true, review };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ ok: false, error: msg });
      }
    },
  );

  // ── POST: Request changes on governance review ──
  app.post<{ Params: { reviewId: string } }>(
    "/api/internal/settlement-action-governance/reviews/:reviewId/request-changes",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const parsed = reviewDecisionRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "invalid request-changes request" });
      }
      try {
        const review = await governanceReviewService.requestChanges(context, request.params.reviewId, parsed.data);
        if (review === null) {
          return reply.status(404).send({ ok: false, error: "governance review not found or not in pending_review status" });
        }
        return { ok: true, review };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return reply.status(500).send({ ok: false, error: msg });
      }
    },
  );
}
