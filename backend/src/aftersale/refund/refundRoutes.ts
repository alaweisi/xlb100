import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../../context/requestContextMiddleware.js";
import { authorizeRequest } from "../../gateway/authz.js";
import { canAccessAdminOperation } from "../../auth/operationsAuthorization.js";
import {
  refundService,
  RefundConflictError,
  RefundNotFoundError,
  RefundValidationError,
} from "./refundService.js";

export async function registerRefundRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/aftersale/refunds",
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
          error: "refund request requires customer app with customer role",
        });
      }

      try {
        return {
          ok: true,
          ...(await refundService.createRefundRequest(context, request.body)),
        };
      } catch (error) {
        if (error instanceof RefundValidationError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        if (error instanceof RefundConflictError) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/internal/aftersale/refunds/:refundId/approve",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }
      if (!canAccessAdminOperation(context, ["operator"])) {
        return reply.status(403).send({
          ok: false,
          error: "refund approval requires admin operator",
        });
      }

      const { refundId } = request.params as { refundId: string };
      try {
        return {
          ok: true,
          ...(await refundService.approveRefund(context, refundId, request.body)),
        };
      } catch (error) {
        if (error instanceof RefundValidationError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        if (error instanceof RefundNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );
}
