import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "@xlb/config";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import { InvalidOrderTransitionError } from "../order/orderStateMachine.js";
import {
  OrderNotFoundError,
  OrderOwnershipError,
} from "../order/orderService.js";
import {
  paymentOrderService,
  PaymentAuthorizationError,
  PaymentConflictError,
  PaymentNotFoundError,
  PaymentValidationError,
} from "./paymentOrderService.js";

const MOCK_PAYMENT_SECRET_HEADER = "x-xlb-mock-payment-secret";

function hasValidMockPaymentSecret(
  actual: string | string[] | undefined,
  expected: string,
): boolean {
  const presented = Array.isArray(actual) ? actual[0] : actual;
  if (!presented) return false;
  const presentedBytes = Buffer.from(presented);
  const expectedBytes = Buffer.from(expected);
  return presentedBytes.length === expectedBytes.length
    && timingSafeEqual(presentedBytes, expectedBytes);
}

export async function registerPaymentModule(app: FastifyInstance): Promise<void> {
  const env = loadEnv();

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
        if (
          error instanceof PaymentAuthorizationError
          || error instanceof OrderOwnershipError
        ) {
          return reply.status(403).send({ ok: false, error: error.message });
        }
        if (error instanceof PaymentConflictError) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  if (!env.paymentMockWebhookEnabled) return;

  app.post(
    "/api/payments/mock-webhook",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }
      if (!hasValidMockPaymentSecret(
        request.headers[MOCK_PAYMENT_SECRET_HEADER],
        env.paymentMockWebhookSecret,
      )) {
        return reply.status(403).send({
          ok: false,
          error: "Mock payment webhook secret is invalid",
        });
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
        if (error instanceof PaymentConflictError) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );
}

export const paymentWebhook = registerPaymentModule;
