import type { FastifyInstance, FastifyReply } from "fastify";
import { cityCodeSchema } from "@xlb/validators";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import {
  dashboardService,
  DashboardServiceError,
} from "./dashboardService.js";

function fail(error: unknown, reply: FastifyReply) {
  if (error instanceof DashboardServiceError) {
    return reply.status(error.statusCode).send({ ok: false, error: error.message });
  }
  throw error;
}

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = createRequestContextMiddleware();
  app.get("/api/dashboard/realtime", { preHandler }, async (request, reply) => {
    const query = request.query as { cityCode?: unknown };
    let cityCode: string | undefined;
    if (query.cityCode !== undefined) {
      const parsed = cityCodeSchema.safeParse(query.cityCode);
      if (!parsed.success || parsed.data === "__global__") {
        return reply.status(400).send({ ok: false, error: "invalid dashboard city scope" });
      }
      cityCode = parsed.data;
    }
    try {
      const snapshot = await dashboardService.realtime(
        getRequestContext(request),
        cityCode,
      );
      reply.header("Cache-Control", "private, no-store, max-age=0");
      reply.header("X-XLB-Dashboard-Observed-At", snapshot.observedAt);
      return { ok: true, snapshot };
    } catch (error) {
      return fail(error, reply);
    }
  });
}
