import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import {
  workerService,
  WorkerCityBindingError,
  WorkerNotFoundError,
} from "./workerService.js";
import { taskPoolService } from "./taskPoolService.js";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";

export async function registerTaskPoolRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/worker/task-pool",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      if (context.appType !== "worker" || context.role !== "worker") {
        return reply.status(403).send({
          ok: false,
          error: "Task pool requires worker app with worker role",
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
        const tasks = await taskPoolService.listAvailableTasksForWorker(
          context,
          cityCode,
          context.userId,
        );
        return { ok: true, cityCode, tasks };
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
}

export const taskPoolModule = registerTaskPoolRoutes;
