import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import {
  orderReviewService,
  OrderReviewConflictError,
  OrderReviewValidationError,
} from "./orderReviewService.js";

export async function registerOrderReviewRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/orders/:orderId/reviews",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
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
        throw error;
      }
    },
  );
}
