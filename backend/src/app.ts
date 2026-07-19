import Fastify from "fastify";
import helmet from "@fastify/helmet";
import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "@xlb/config";
import { XLB_HEADERS } from "@xlb/types";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "./context/requestContextMiddleware.js";
import { authorizeRequest } from "./gateway/authz.js";
import { cityRouter } from "./city/cityRouter.js";
import {
  checkDbHealth,
  checkReadyHealth,
  getLiveHealthStatus,
} from "./observability/health.js";
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
import {
  hydrateSharedReliabilityMetrics,
  recordHttpRequest,
  renderPrometheusMetrics,
} from "./observability/metrics.js";
import { createRateLimitGuard, type RateLimitOptions } from "./security/rateLimit.js";
import { registerSupportModule } from "./support/supportModule.js";
import { registerNotificationModule } from "./notification/notificationModule.js";
import { registerMarketingModule } from "./marketing/marketingModule.js";
import { XLB_RUNTIME_STATUS } from "./projectStatus.js";
import { registerDashboardRoutes } from "./dashboard/dashboardRoutes.js";

export type BuildAppOptions = {
  rateLimit?: RateLimitOptions;
};

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = loadEnv();
  const app = Fastify({
    logger: env.nodeEnv === "test" ? false : {
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-xlb-api-key']",
          "res.headers['set-cookie']",
          "body.code",
          "body.password",
          "body.token",
          "body.apiKey",
          "body.secret",
        ],
        censor: "[REDACTED]",
      },
    },
    trustProxy: env.trustProxyHops > 0 ? env.trustProxyHops : false,
    bodyLimit: 1_048_576,
  });
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts: env.nodeEnv === "production"
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
      : false,
  });
  await app.register(websocket, { options: { maxPayload: 65_536, perMessageDeflate: false } });

  app.addHook("onRequest", createRateLimitGuard(options.rateLimit));
  app.addHook("onSend", async (request, reply, payload) => {
    const path = request.url.split("?", 1)[0] ?? request.url;
    if (path.startsWith("/api/auth/")) {
      reply.header("Cache-Control", "no-store");
      reply.header("Pragma", "no-cache");
    }
    return payload;
  });
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
    if (
      route.startsWith("/api/internal/") &&
      request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS"
    ) {
      request.log.info({
        securityEvent: "admin_mutation",
        traceId: request.xlbContext?.traceId ?? request.id,
        actorId: request.xlbContext?.userId,
        actorRole: request.xlbContext?.role,
        cityCode: request.xlbContext?.cityCode,
        method: request.method,
        route,
        statusCode: reply.statusCode,
        succeeded: reply.statusCode >= 200 && reply.statusCode < 400,
      }, "security audit event");
    } else if (route.startsWith("/api/auth/") && request.method === "POST") {
      request.log.info({
        securityEvent: "authentication_attempt",
        traceId: request.id,
        route,
        statusCode: reply.statusCode,
        succeeded: reply.statusCode >= 200 && reply.statusCode < 400,
      }, "security audit event");
    }
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "xlb-backend",
    phase: XLB_RUNTIME_STATUS.phase,
    brand: "喜乐帮 / XLB",
  }));

  // Kubernetes liveness must not restart healthy processes merely because a
  // downstream dependency is temporarily unavailable.
  app.get("/health/live", async () => getLiveHealthStatus());

  // Readiness removes the Pod from Service endpoints while MySQL or Redis is
  // unavailable, without creating a restart loop.
  app.get("/health/ready", async (_request, reply) => {
    const health = await checkReadyHealth();
    if (!health.ok) return reply.status(503).send(health);
    return health;
  });

  app.get("/api/system/status", async () => ({
    ok: true,
    project: "XLB",
    phase: XLB_RUNTIME_STATUS.phase,
    apps: ["customer", "worker", "admin", "oa", "dashboard"],
    backend: "ready",
    foundation: XLB_RUNTIME_STATUS.foundation,
  }));

  app.get("/api/system/db-health", async (_request, reply) => {
    const health = await checkDbHealth();
    if (!health.ok) {
      return reply.status(503).send(health);
    }
    return { ...health, phase: XLB_RUNTIME_STATUS.phase };
  });

  app.get("/metrics", async (_request, reply) => {
    if (process.env.NODE_ENV !== "test") {
      await hydrateSharedReliabilityMetrics();
    }
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
  await registerDashboardRoutes(app);

  return app;
}
