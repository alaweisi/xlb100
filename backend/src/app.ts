import Fastify from "fastify";
import websocket from "@fastify/websocket";
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
import { registerDispatchModule } from "./dispatch/dispatchModule.js";
import { registerWorkerModule } from "./worker/workerModule.js";
import { registerWorkerCertificationModule } from "./compliance/complianceModule.js";
import { registerLedgerRoutes } from "./ledger/ledgerRoutes.js";
import { registerSettlementRoutes } from "./settlement/settlementRoutes.js";
import { registerGovernanceIntentRoutes } from "./governance/governanceIntentRoutes.js";
import { registerGovernanceReviewRoutes } from "./governance/governanceReviewRoutes.js";
import { registerGovernanceEvidenceRoutes } from "./governance/governanceEvidenceRoutes.js";
import { registerGovernanceReadinessRoutes } from "./governance/governanceReadinessRoutes.js";
import { registerPlannerRoutes } from "./planner/plannerRoutes.js";
import { registerPreparationRoutes } from "./preparation/envelopeRoutes.js";
import { registerAftersaleModule } from "./aftersale/aftersaleModule.js";
import { registerAuthRoutes } from "./auth/authRoutes.js";
import { registerOrderTraceRoutes } from "./order/orderTraceRoutes.js";
import { registerOrderReviewRoutes } from "./review/orderReviewRoutes.js";
import { registerEnterpriseRoutes } from "./enterprise/enterpriseRoutes.js";
import { registerCustomerOperationsRoutes } from "./customer/customerOperationsRoutes.js";
import { registerAdminOperationsRoutes } from "./adminOperations/adminOperationsRoutes.js";
import { recordHttpRequest, renderPrometheusMetrics } from "./observability/metrics.js";
import { createRateLimitGuard, type RateLimitOptions } from "./security/rateLimit.js";
import { registerSupportModule } from "./support/supportModule.js";
import { registerNotificationModule } from "./notification/notificationModule.js";
import { registerMarketingModule } from "./marketing/marketingModule.js";

export type BuildAppOptions = {
  rateLimit?: RateLimitOptions;
};

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV === "test" ? false : true });
  await app.register(websocket, { options: { maxPayload: 65_536, perMessageDeflate: false } });

  app.addHook("onRequest", createRateLimitGuard(options.rateLimit));
  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions.url ?? request.url.split("?", 1)[0] ?? "unknown";
    recordHttpRequest({
      method: request.method,
      routeTemplate: request.routeOptions.url,
      statusCode: reply.statusCode,
      durationMs: reply.elapsedTime,
    });
    request.log.info({
      traceId: request.xlbContext?.traceId ?? request.id,
      cityCode: request.xlbContext?.cityCode,
      appType: request.xlbContext?.appType,
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationMs: Number(reply.elapsedTime.toFixed(3)),
    }, "request completed");
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "xlb-backend",
    phase: "8C",
    brand: "喜乐帮 / XLB",
  }));

  app.get("/api/system/status", async () => ({
    ok: true,
    project: "XLB",
    phase: "8C",
    apps: ["customer", "worker", "admin"],
    backend: "ready",
    foundation: "settlement-confirmation-foundation",
  }));

  app.get("/api/system/db-health", async (_request, reply) => {
    const health = await checkDbHealth();
    if (!health.ok) {
      return reply.status(503).send(health);
    }
    return { ...health, phase: "8C" };
  });

  app.get("/metrics", async (_request, reply) => {
    return reply.type("text/plain; version=0.0.4; charset=utf-8").send(renderPrometheusMetrics());
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

  await registerAuthRoutes(app);
  await registerCustomerOperationsRoutes(app);
  await registerAdminOperationsRoutes(app);
  await registerCityConfigModule(app);
  await registerCatalogModule(app);
  await registerPricingModule(app);
  await registerOrderModule(app);
  await registerOrderReviewRoutes(app);
  await registerPaymentModule(app);
  await registerDispatchModule(app);
  await registerWorkerModule(app);
  await registerWorkerCertificationModule(app);
  await registerLedgerRoutes(app);
  await registerSettlementRoutes(app);
  await registerGovernanceIntentRoutes(app);
  await registerGovernanceReviewRoutes(app);
  await registerGovernanceEvidenceRoutes(app);
  await registerGovernanceReadinessRoutes(app);
  await registerPlannerRoutes(app);
  await registerPreparationRoutes(app);
  await registerAftersaleModule(app);
  await registerOrderTraceRoutes(app);
  await registerEnterpriseRoutes(app);
  await registerSupportModule(app);
  await registerNotificationModule(app);
  await registerMarketingModule(app);

  return app;
}
