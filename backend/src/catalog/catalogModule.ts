import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import { catalogService } from "./catalogService.js";

export async function registerCatalogModule(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/catalog",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }

      const catalog = await catalogService.getCatalog(context);
      return { ok: true, catalog };
    },
  );
}
