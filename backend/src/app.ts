import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { XLB_HEADERS } from "@xlb/types";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "./context/requestContextMiddleware.js";
import { authorizeRequest } from "./gateway/authz.js";
import { cityRouter } from "./city/cityRouter.js";
import { checkDbHealth } from "./observability/health.js";
import { registerCityConfigModule } from "./cityConfig/cityConfigModule.js";
import { registerCatalogModule } from "./catalog/catalogModule.js";
import { registerPricingModule } from "./pricing/pricingModule.js";
import { registerOrderModule } from "./order/orderModule.js";
import { registerPaymentModule } from "./payment/paymentModule.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    status: "ok",
    service: "xlb-backend",
    phase: "4",
    brand: "喜乐帮 / XLB",
  }));

  app.get("/api/system/status", async () => ({
    ok: true,
    project: "XLB",
    phase: "4",
    apps: ["customer", "worker", "admin"],
    backend: "ready",
    foundation: "order-payment-outbox",
  }));

  app.get("/api/system/db-health", async (_request, reply) => {
    const health = await checkDbHealth();
    if (!health.ok) {
      return reply.status(503).send(health);
    }
    return { ...health, phase: "4" };
  });

  app.get(
    "/api/debug/context",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({
          ok: false,
          error: authz.message,
        });
      }

      const routeDecision = cityRouter(context);
      if (!routeDecision.allowed) {
        return reply.status(routeDecision.statusCode).send({
          ok: false,
          error: routeDecision.message,
        });
      }

      reply.header(XLB_HEADERS.traceId, context.traceId);

      return {
        ok: true,
        traceId: context.traceId,
        appType: context.appType,
        role: context.role,
        cityCode: context.cityCode,
        userId: context.userId,
        requestStartedAt: context.requestStartedAt,
        requestId: context.requestId,
        correlationId: context.correlationId,
      };
    },
  );

  await registerCityConfigModule(app);
  await registerCatalogModule(app);
  await registerPricingModule(app);
  await registerOrderModule(app);
  await registerPaymentModule(app);

  return app;
}
