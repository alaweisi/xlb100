import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import { canAccessAdminOperation } from "../auth/operationsAuthorization.js";
import {
  dispatchService,
  DispatchValidationError,
} from "./dispatchService.js";
import {
  dispatchSimulationService,
  DispatchSimulationError,
} from "./dispatchSimulationService.js";
import { workerLocationService, WorkerLocationError } from "./workerLocationService.js";

function authorizeDispatchOperator(context: ReturnType<typeof getRequestContext>) {
  const authz = authorizeRequest(context);
  if (!authz.ok) {
    return { ok: false as const, statusCode: authz.statusCode, error: authz.message };
  }

  if (!canAccessAdminOperation(context, ["operator"])) {
    return {
      ok: false as const,
      statusCode: 403,
      error: "dispatch run-once requires admin app with operator role",
    };
  }

  return { ok: true as const };
}

export async function registerDispatchModule(app: FastifyInstance): Promise<void> {
  app.get("/api/internal/dispatch/board",{preHandler:createRequestContextMiddleware({requireCityCode:true})},async(request,reply)=>{try{return {ok:true,rows:await workerLocationService.adminBoard(getRequestContext(request))};}catch(error){if(error instanceof WorkerLocationError)return reply.status(error.statusCode).send({ok:false,error:error.message});throw error;}});
  app.post(
    "/api/internal/dispatch/run-once",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      const authz = authorizeDispatchOperator(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.error });
      }

      try {
        const result = await dispatchService.runDispatchOutboxOnce(context);
        return { ok: true, processed: result.processed, tasks: result.tasks };
      } catch (error) {
        if (error instanceof DispatchValidationError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/internal/dispatch/match-once",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      const authz = authorizeDispatchOperator(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.error });
      }

      try {
        const body = (request.body ?? {}) as { dispatchTaskId?: string; limit?: number };
        const result = body.dispatchTaskId
          ? await dispatchSimulationService.matchDispatchTaskOnce(
              context,
              body.dispatchTaskId,
            )
          : await dispatchSimulationService.matchOpenTasksOnce(
              context,
              Number.isFinite(body.limit) && body.limit ? body.limit : undefined,
            );
        return { ok: true, processed: result.processed, tasks: result.tasks };
      } catch (error) {
        if (error instanceof DispatchSimulationError) {
          return reply.status(error.statusCode).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/internal/dispatch/retry-once",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      const authz = authorizeDispatchOperator(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.error });
      }

      try {
        const body = (request.body ?? {}) as { dispatchTaskId?: string; limit?: number };
        const result = body.dispatchTaskId
          ? await dispatchSimulationService.matchDispatchTaskOnce(
              context,
              body.dispatchTaskId,
            )
          : await dispatchSimulationService.matchOpenTasksOnce(
              context,
              Number.isFinite(body.limit) && body.limit ? body.limit : undefined,
            );
        return { ok: true, processed: result.processed, tasks: result.tasks };
      } catch (error) {
        if (error instanceof DispatchSimulationError) {
          return reply.status(error.statusCode).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/internal/dispatch/timeout-once",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      const authz = authorizeDispatchOperator(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.error });
      }

      const body = (request.body ?? {}) as { timeoutMinutes?: number };
      try {
        const result = await dispatchSimulationService.runTimeoutOnce(
          context,
          Number.isFinite(body.timeoutMinutes) && body.timeoutMinutes
            ? body.timeoutMinutes
            : undefined,
        );
        return { ok: true, processed: result.processed, tasks: result.tasks };
      } catch (error) {
        if (error instanceof DispatchSimulationError) {
          return reply.status(error.statusCode).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.get(
    "/api/dispatch/tasks",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }

      const tasks = await dispatchService.listTasks(context);
      return { ok: true, tasks };
    },
  );
}

export const dispatchModule = registerDispatchModule;
