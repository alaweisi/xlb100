import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { recordWebhookRun, resetMetricsForTests } from "../../backend/src/observability/metrics.js";
import {
  InMemoryRateLimitStore,
  RedisRateLimitStore,
  type RateLimitStore,
} from "../../backend/src/security/rateLimitStore.js";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";

const headers = bearerHeaders({ appType: "customer", role: "customer", userId: "phase22-observability", cityCode: "hangzhou" });

describe("Phase 22 observability and API-edge rate limit", () => {
  afterEach(() => {
    resetMetricsForTests();
    vi.unstubAllEnvs();
  });

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

  it("shares counters through an injected store without exposing the caller IP in Redis keys", async () => {
    const redisEval = vi.fn().mockResolvedValue([2, 59_000]);
    const store = new RedisRateLimitStore({ eval: redisEval } as never);
    const app = await buildApp({
      rateLimit: {
        store,
        rules: [{ id: "shared-test", matches: path => path === "/api/debug/context", limit: 1, windowMs: 60_000 }],
      },
    });
    try {
      const blocked = await app.inject({ method: "GET", url: "/api/debug/context", headers });
      expect(blocked.statusCode).toBe(429);
      const redisKey = String(redisEval.mock.calls[0]?.[2]);
      expect(redisKey).toMatch(/^xlb:rate-limit:v1:[a-f0-9]{64}$/u);
      expect(redisKey).not.toContain("phase22-observability");
      expect(redisKey).not.toContain("127.0.0.1");
    } finally {
      await app.close();
    }
  });

  it("fails closed and exposes a backend failure metric when the store is unavailable", async () => {
    const unavailableStore: RateLimitStore = {
      consume: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
    };
    const app = await buildApp({
      rateLimit: {
        store: unavailableStore,
        rules: [{ id: "failure-test", matches: path => path === "/api/debug/context", limit: 1, windowMs: 60_000 }],
      },
    });
    try {
      const failed = await app.inject({ method: "GET", url: "/api/debug/context", headers });
      expect(failed.statusCode).toBe(503);
      expect(failed.json()).toMatchObject({ ok: false, error: "rate limit unavailable", rule: "failure-test" });
      expect(failed.headers["retry-after"]).toBe("1");

      const metrics = await app.inject({ method: "GET", url: "/metrics" });
      expect(metrics.body).toContain("xlb_rate_limit_backend_failures_total 1");
    } finally {
      await app.close();
    }
  });

  it("bounds the in-memory store and fails closed when active capacity is exhausted", async () => {
    const store = new InMemoryRateLimitStore(() => 1_000, 1);
    await expect(store.consume("first", 60_000)).resolves.toMatchObject({ count: 1 });
    await expect(store.consume("second", 60_000)).rejects.toThrow("capacity exceeded");
  });

  it("separates client quotas behind the configured trusted proxy hop", async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    const app = await buildApp({
      rateLimit: {
        rules: [{ id: "proxy-test", matches: path => path === "/api/debug/context", limit: 1, windowMs: 60_000 }],
      },
    });
    try {
      const first = await app.inject({
        method: "GET",
        url: "/api/debug/context",
        headers: { ...headers, "x-forwarded-for": "198.51.100.10" },
      });
      const second = await app.inject({
        method: "GET",
        url: "/api/debug/context",
        headers: { ...headers, "x-forwarded-for": "198.51.100.11" },
      });
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
