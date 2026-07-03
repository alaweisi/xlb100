import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import {
  cityConfigService,
  CityConfigNotFoundError,
} from "./cityConfigService.js";

export async function registerCityConfigModule(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/city-config/current",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }

      try {
        const config = await cityConfigService.getCurrentConfig(context);
        return { ok: true, config };
      } catch (error) {
        if (error instanceof CityConfigNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );
}
