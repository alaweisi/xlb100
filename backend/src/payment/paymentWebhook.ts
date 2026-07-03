import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import { InvalidOrderTransitionError } from "../order/orderStateMachine.js";
import { OrderNotFoundError } from "../order/orderService.js";
import {
  paymentOrderService,
  PaymentNotFoundError,
  PaymentValidationError,
} from "./paymentOrderService.js";

export async function registerPaymentModule(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/payments/orders",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }

      try {
        const paymentOrder = await paymentOrderService.createPaymentOrder(
          context,
          request.body as never,
        );
        return { ok: true, paymentOrder };
      } catch (error) {
        if (error instanceof PaymentValidationError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        if (error instanceof OrderNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/payments/mock-webhook",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }

      try {
        const result = await paymentOrderService.processMockWebhook(
          context,
          request.body as never,
        );
        return {
          ok: true,
          paymentOrder: result.paymentOrder,
          orderId: result.orderId,
          idempotent: result.idempotent,
        };
      } catch (error) {
        if (error instanceof PaymentValidationError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        if (error instanceof PaymentNotFoundError || error instanceof OrderNotFoundError) {
          return reply.status(404).send({ ok: false, error: (error as Error).message });
        }
        if (error instanceof InvalidOrderTransitionError) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );
}

export const paymentWebhook = registerPaymentModule;
