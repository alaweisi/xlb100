import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import {
  orderReviewService,
  OrderReviewConflictError,
  OrderReviewNotFoundError,
  OrderReviewValidationError,
} from "./orderReviewService.js";
import {
  reviewModerationService,
  ReviewForbiddenError,
  ReviewNotFoundError,
  ReviewStateConflictError,
  ReviewValidationError,
} from "./reviewModerationService.js";
import { reputationService } from "./reputationService.js";
import { ReviewQueueCursorValidationError } from "./reviewQueueCursorPolicy.js";

function authorize(request: FastifyRequest, reply: FastifyReply) {
  const context = getRequestContext(request);
  const decision = authorizeRequest(context);
  if (!decision.ok) {
    reply.status(decision.statusCode).send({ ok: false, error: decision.message });
    return null;
  }
  return context;
}

function mapReviewError(error: unknown, reply: FastifyReply) {
  if (error instanceof ReviewValidationError || error instanceof OrderReviewValidationError
    || error instanceof ReviewQueueCursorValidationError) {
    return reply.status(400).send({ ok: false, error: error.message });
  }
  if (error instanceof ReviewForbiddenError) {
    return reply.status(403).send({ ok: false, error: error.message });
  }
  if (error instanceof ReviewNotFoundError) {
    return reply.status(404).send({ ok: false, error: error.message });
  }
  if (error instanceof ReviewStateConflictError || error instanceof OrderReviewConflictError) {
    return reply.status(409).send({ ok: false, error: error.message });
  }
  throw error;
}

export async function registerOrderReviewRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = createRequestContextMiddleware({ requireCityCode: true });
  app.post(
    "/api/orders/:orderId/reviews",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }
      if (context.appType !== "customer" || context.role !== "customer") {
        return reply.status(403).send({
          ok: false,
          error: "order review requires customer app with customer role",
        });
      }

      const { orderId } = request.params as { orderId: string };
      try {
        return {
          ok: true,
          ...(await orderReviewService.createReview(context, orderId, request.body)),
        };
      } catch (error) {
        if (error instanceof OrderReviewValidationError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        if (error instanceof OrderReviewConflictError) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        if (error instanceof OrderReviewNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.get("/api/orders/:orderId/review", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try {
      const review = await reviewModerationService.getCustomerOrderReview(
        context, (request.params as { orderId: string }).orderId,
      );
      return { ok: true, review };
    } catch (error) { return mapReviewError(error, reply); }
  });

  app.post("/api/reviews/:reviewId/appeals", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try {
      return {
        ok: true,
        ...await reviewModerationService.createAppeal(
          context, (request.params as { reviewId: string }).reviewId, request.body,
        ),
      };
    } catch (error) { return mapReviewError(error, reply); }
  });

  app.post("/api/reviews/:reviewId/appeals/withdraw", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try {
      return {
        ok: true,
        ...await reviewModerationService.withdrawAppeal(
          context, (request.params as { reviewId: string }).reviewId, request.body,
        ),
      };
    } catch (error) { return mapReviewError(error, reply); }
  });

  app.get("/api/worker/reputation", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try {
      return { ok: true, reputation: await reputationService.getWorkerSelf(context) };
    } catch (error) { return mapReviewError(error, reply); }
  });

  app.get("/api/worker/review-appeal-targets", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try {
      return { ok: true, items: await reviewModerationService.listWorkerAppealTargets(context) };
    } catch (error) { return mapReviewError(error, reply); }
  });

  app.get("/api/admin/reviews/moderation", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try {
      return { ok: true, ...await reviewModerationService.listModeration(
        context, request.query as { visibility?: unknown; limit?: unknown; cursor?: unknown },
      ) };
    } catch (error) { return mapReviewError(error, reply); }
  });

  app.get("/api/admin/reviews/:reviewId/content", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try {
      return {
        ok: true,
        content: await reviewModerationService.getModerationContent(
          context, (request.params as { reviewId: string }).reviewId,
        ),
      };
    } catch (error) { return mapReviewError(error, reply); }
  });

  app.post("/api/admin/reviews/:reviewId/moderation", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try {
      return {
        ok: true,
        ...await reviewModerationService.moderate(
          context, (request.params as { reviewId: string }).reviewId, request.body,
        ),
      };
    } catch (error) { return mapReviewError(error, reply); }
  });

  app.get("/api/admin/review-appeals", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try {
      return { ok: true, ...await reviewModerationService.listAppeals(
        context, request.query as { status?: unknown; limit?: unknown; cursor?: unknown },
      ) };
    } catch (error) { return mapReviewError(error, reply); }
  });

  app.post("/api/admin/review-appeals/:appealId/resolve", { preHandler }, async (request, reply) => {
    const context = authorize(request, reply); if (!context) return;
    try {
      return {
        ok: true,
        ...await reviewModerationService.resolveAppeal(
          context, (request.params as { appealId: string }).appealId, request.body,
        ),
      };
    } catch (error) { return mapReviewError(error, reply); }
  });
}
