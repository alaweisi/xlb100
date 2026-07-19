import type { FastifyInstance } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../context/requestContextMiddleware.js";
import { readDashboardOperations } from "./dashboardOperationsService.js";

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/internal/dashboard/operations",
    { preHandler: createRequestContextMiddleware({ requireAuth: true, requireCityCode: false }) },
    async (request, reply) => {
      const context = getRequestContext(request);
      if (context.appType !== "dashboard" || context.role !== "admin") {
        return reply.status(403).send({ ok: false, error: "dashboard headquarters read authority required" });
      }
      reply.header("Cache-Control", "no-store");
      return { ok: true, snapshot: await readDashboardOperations() };
    },
  );
}
