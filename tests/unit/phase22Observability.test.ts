import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { recordWebhookRun, resetMetricsForTests } from "../../backend/src/observability/metrics.js";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";

const headers = bearerHeaders({ appType: "customer", role: "customer", userId: "phase22-observability", cityCode: "hangzhou" });

describe("Phase 22 observability and API-edge rate limit", () => {
  afterEach(resetMetricsForTests);

  it("propagates a caller trace ID and exports route/status/duration metrics", async () => {
    const app = await buildApp();
    try {
      const traceId = "phase22-trace-001";
      const response = await app.inject({ method: "GET", url: "/api/debug/context", headers: { ...headers, "x-xlb-trace-id": traceId } });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.headers["x-xlb-trace-id"]).toBe(traceId);
      expect(response.json()).toMatchObject({ traceId, requestId: traceId, correlationId: traceId });

      const metrics = await app.inject({ method: "GET", url: "/metrics" });
      expect(metrics.statusCode).toBe(200);
      expect(metrics.headers["content-type"]).toContain("text/plain");
      expect(metrics.body).toContain('xlb_http_requests_total{method="GET",route="/api/debug/context",status="2xx"} 1');
      expect(metrics.body).toContain("xlb_http_request_duration_ms_sum");
    } finally {
      await app.close();
    }
  });

  it("fails closed with 429 and exposes rejection metrics when a sensitive edge exceeds its window", async () => {
    const app = await buildApp({ rateLimit: { rules: [{ id: "debug-test", matches: path => path === "/api/debug/context", limit: 1, windowMs: 60_000 }] } });
    try {
      expect((await app.inject({ method: "GET", url: "/api/debug/context", headers })).statusCode).toBe(200);
      const blocked = await app.inject({ method: "GET", url: "/api/debug/context", headers });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toMatchObject({ ok: false, error: "rate limit exceeded", rule: "debug-test" });
      expect(blocked.headers["retry-after"]).toBeDefined();

      const metrics = await app.inject({ method: "GET", url: "/metrics" });
      expect(metrics.body).toContain("xlb_rate_limit_rejections_total 1");
      recordWebhookRun({ delivered: 2, retry: 1 });
      recordWebhookRun({ delivered: 0, retry: 0, busy: true });
      const webhookMetrics = await app.inject({ method: "GET", url: "/metrics" });
      expect(webhookMetrics.body).toContain('xlb_webhook_delivery_attempts_total{outcome="delivered"} 2');
      expect(webhookMetrics.body).toContain('xlb_webhook_delivery_attempts_total{outcome="retry"} 1');
      expect(webhookMetrics.body).toContain("xlb_webhook_run_busy_total 1");
    } finally {
      await app.close();
    }
  });
});
