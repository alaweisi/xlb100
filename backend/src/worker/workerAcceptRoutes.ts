import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import {
  workerAcceptService,
  AcceptValidationError,
  DispatchTaskNotFoundError,
  WorkerNotEligibleError,
  TaskAlreadyAcceptedError,
  InvalidDispatchTaskStatusError,
  WorkerNotFoundError,
  WorkerCityBindingError,
} from "./workerAcceptService.js";

export async function registerWorkerAcceptRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    "/api/worker/tasks/:dispatchTaskId/accept",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      const { dispatchTaskId } = request.params as { dispatchTaskId: string };

      if (context.appType !== "worker" || context.role !== "worker") {
        return reply.status(403).send({
          ok: false,
          error: "Accept requires worker app with worker role",
        });
      }

      if (!context.userId) {
        return reply.status(403).send({
          ok: false,
          error: "Missing required header: x-xlb-user-id",
        });
      }

      try {
        const result = await workerAcceptService.acceptTask(
          context,
          dispatchTaskId,
          request.body,
        );
        return {
          ok: true,
          acceptance: result.acceptance,
          fulfillment: result.fulfillment,
          idempotent: result.idempotent,
        };
      } catch (error) {
        if (error instanceof AcceptValidationError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        if (
          error instanceof WorkerNotFoundError ||
          error instanceof WorkerCityBindingError ||
          error instanceof WorkerNotEligibleError
        ) {
          return reply.status(403).send({ ok: false, error: error.message });
        }
        if (error instanceof DispatchTaskNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        if (
          error instanceof TaskAlreadyAcceptedError ||
          error instanceof InvalidDispatchTaskStatusError
        ) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );
}
