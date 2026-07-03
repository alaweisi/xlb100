import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import {
  orderService,
  OrderNotFoundError,
  OrderSkuNotAllowedError,
  OrderValidationError,
} from "./orderService.js";

export async function registerOrderModule(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/orders",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }

      try {
        const order = await orderService.createOrder(context, request.body as never);
        return { ok: true, order };
      } catch (error) {
        if (error instanceof OrderValidationError || error instanceof OrderSkuNotAllowedError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.get(
    "/api/orders/:orderId",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }

      const { orderId } = request.params as { orderId: string };

      try {
        const order = await orderService.getOrder(context, orderId);
        return { ok: true, order };
      } catch (error) {
        if (error instanceof OrderNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );
}

export const orderRoutes = registerOrderModule;
