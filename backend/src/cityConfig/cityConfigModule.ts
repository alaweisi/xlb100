import type { FastifyInstance } from "fastify";
import { cityConfigUpdateSchema } from "@xlb/validators";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import {
  cityConfigService,
  CityConfigNotFoundError,
  CityConfigVersionConflictError,
  CityConfigWriteForbiddenError,
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

  app.post(
    "/api/admin/city-config/update",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }

      const parsed = cityConfigUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          ok: false,
          error: "Invalid city config update",
          issues: parsed.error.issues,
        });
      }
      if (parsed.data.cityCode !== context.cityCode) {
        return reply.status(400).send({
          ok: false,
          error: "city_code in body must match request context",
        });
      }

      const { cityCode: _cityCode, ...patch } = parsed.data;
      try {
        const config = await cityConfigService.updateConfig(context, patch);
        return { ok: true, config };
      } catch (error) {
        if (error instanceof CityConfigVersionConflictError) {
          return reply.status(409).send({
            ok: false,
            code: error.code,
            error: error.message,
            expectedVersion: error.expectedVersion,
            currentVersion: error.currentVersion,
          });
        }
        if (error instanceof CityConfigWriteForbiddenError) {
          return reply.status(403).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );
}
