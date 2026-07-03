import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import {
  fulfillmentService,
  FulfillmentNotFoundError,
} from "./fulfillmentService.js";
import {
  workerService,
  WorkerCityBindingError,
  WorkerNotFoundError,
} from "../worker/workerService.js";

export async function registerFulfillmentRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/worker/fulfillments",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      if (context.appType !== "worker" || context.role !== "worker") {
        return reply.status(403).send({
          ok: false,
          error: "Fulfillment list requires worker app with worker role",
        });
      }

      if (!context.userId) {
        return reply.status(403).send({
          ok: false,
          error: "Missing required header: x-xlb-user-id",
        });
      }

      const cityCode = assertCityScopedContext(context);

      try {
        await workerService.assertWorkerBoundToCity(context.userId, cityCode);
        const fulfillments = await fulfillmentService.listFulfillmentsForWorker(
          context.userId,
          cityCode,
        );
        return { ok: true, cityCode, fulfillments };
      } catch (error) {
        if (
          error instanceof WorkerNotFoundError ||
          error instanceof WorkerCityBindingError
        ) {
          return reply.status(403).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.get(
    "/api/worker/fulfillments/:fulfillmentId",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      const { fulfillmentId } = request.params as { fulfillmentId: string };

      if (context.appType !== "worker" || context.role !== "worker") {
        return reply.status(403).send({
          ok: false,
          error: "Fulfillment detail requires worker app with worker role",
        });
      }

      if (!context.userId) {
        return reply.status(403).send({
          ok: false,
          error: "Missing required header: x-xlb-user-id",
        });
      }

      const cityCode = assertCityScopedContext(context);

      try {
        await workerService.assertWorkerBoundToCity(context.userId, cityCode);
        const fulfillment = await fulfillmentService.getFulfillmentForWorker(
          fulfillmentId,
          cityCode,
          context.userId,
        );
        return { ok: true, fulfillment };
      } catch (error) {
        if (
          error instanceof WorkerNotFoundError ||
          error instanceof WorkerCityBindingError
        ) {
          return reply.status(403).send({ ok: false, error: error.message });
        }
        if (error instanceof FulfillmentNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );
}

export const fulfillmentModule = registerFulfillmentRoutes;
