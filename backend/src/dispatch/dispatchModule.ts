import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import {
  dispatchService,
  DispatchValidationError,
} from "./dispatchService.js";

export async function registerDispatchModule(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/internal/dispatch/run-once",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }

      if (context.appType !== "admin" || context.role !== "operator") {
        return reply.status(403).send({
          ok: false,
          error: "dispatch run-once requires admin app with operator role",
        });
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
