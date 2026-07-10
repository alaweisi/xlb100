import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import {
  dispatchSimulationService,
  DispatchSimulationError,
} from "../dispatch/dispatchSimulationService.js";
import { workerService } from "./workerService.js";
import { workerLocationService, WorkerLocationError } from "../dispatch/workerLocationService.js";
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
  app.post("/api/worker/location",{preHandler:createRequestContextMiddleware({requireCityCode:true})},async(request,reply)=>{try{return {ok:true,location:await workerLocationService.upsert(getRequestContext(request),request.body)};}catch(error){if(error instanceof WorkerLocationError)return reply.status(error.statusCode).send({ok:false,error:error.message});throw error;}});
  app.get("/api/worker/location",{preHandler:createRequestContextMiddleware({requireCityCode:true})},async(request,reply)=>{try{return {ok:true,location:await workerLocationService.getOwn(getRequestContext(request))};}catch(error){if(error instanceof WorkerLocationError)return reply.status(error.statusCode).send({ok:false,error:error.message});throw error;}});
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
          error: "Missing authenticated worker identity",
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

  app.post(
    "/api/worker/tasks/:dispatchTaskId/reject",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      const { dispatchTaskId } = request.params as { dispatchTaskId: string };

      if (context.appType !== "worker" || context.role !== "worker") {
        return reply.status(403).send({
          ok: false,
          error: "Reject requires worker app with worker role",
        });
      }

      if (!context.userId) {
        return reply.status(403).send({
          ok: false,
          error: "Missing authenticated worker identity",
        });
      }

      const cityCode = assertCityScopedContext(context);
      const body = (request.body ?? {}) as { reason?: string };

      try {
        await workerService.assertWorkerBoundToCity(context.userId, cityCode);
        const task = await dispatchSimulationService.rejectOffer(
          context,
          dispatchTaskId,
          body.reason || "worker rejected offer",
        );
        return { ok: true, task };
      } catch (error) {
        if (error instanceof WorkerNotFoundError || error instanceof WorkerCityBindingError) {
          return reply.status(403).send({ ok: false, error: error.message });
        }
        if (error instanceof DispatchSimulationError) {
          return reply.status(error.statusCode).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/worker/tasks/:dispatchTaskId/simulate-timeout",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      const { dispatchTaskId } = request.params as { dispatchTaskId: string };

      if (context.appType !== "worker" || context.role !== "worker") {
        return reply.status(403).send({
          ok: false,
          error: "Simulate timeout requires worker app with worker role",
        });
      }

      if (!context.userId) {
        return reply.status(403).send({
          ok: false,
          error: "Missing authenticated worker identity",
        });
      }

      const cityCode = assertCityScopedContext(context);

      try {
        await workerService.assertWorkerBoundToCity(context.userId, cityCode);
        const task = await dispatchSimulationService.simulateWorkerTimeout(
          context,
          dispatchTaskId,
        );
        return { ok: true, task };
      } catch (error) {
        if (error instanceof WorkerNotFoundError || error instanceof WorkerCityBindingError) {
          return reply.status(403).send({ ok: false, error: error.message });
        }
        if (error instanceof DispatchSimulationError) {
          return reply.status(error.statusCode).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );
}
