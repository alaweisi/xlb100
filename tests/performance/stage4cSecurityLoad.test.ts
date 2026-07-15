import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { createToken } from "../../backend/src/auth/tokenAuth.js";
import { runLoadScenario } from "../helpers/stage4cLoadHarness.js";

const requestCount = Number(process.env.XLB_STAGE4C_AUTH_REQUESTS ?? 240);
const concurrency = Number(process.env.XLB_STAGE4C_AUTH_CONCURRENCY ?? 24);
const p95BudgetMs = Number(process.env.XLB_STAGE4C_AUTH_P95_MAX_MS ?? 500);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Stage 4C API-edge security load baseline", { timeout: 120_000 }, () => {
  it("keeps JWT verification, RequestContext, authorization and rate limiting bounded", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const token = createToken("stage4c-load-customer", "customer", "customer");
    const headers = {
      authorization: `Bearer ${token}`,
      "x-xlb-city-code": "hangzhou",
    };
    const app = await buildApp({
      rateLimit: {
        rules: [{
          id: "stage4c-auth-edge",
          matches: path => path === "/api/debug/context",
          limit: requestCount + 10,
          windowMs: 60_000,
        }],
      },
    });
    try {
      const result = await runLoadScenario({
        name: "stage4c-auth-edge",
        total: requestCount,
        concurrency,
        operation: () => app.inject({
          method: "GET",
          url: "/api/debug/context",
          headers,
        }),
        isSuccess: response => response.statusCode === 200,
      });

      process.stdout.write(
        `[stage4c] auth-edge total=${result.total} concurrency=${result.concurrency} ` +
        `p50=${result.p50Ms.toFixed(1)}ms p95=${result.p95Ms.toFixed(1)}ms ` +
        `rps=${result.requestsPerSecond.toFixed(1)}\n`,
      );
      expect(result.failed).toBe(0);
      expect(Number.isFinite(p95BudgetMs) && p95BudgetMs > 0).toBe(true);
      expect(result.p95Ms).toBeLessThan(p95BudgetMs);
    } finally {
      await app.close();
    }
  });
});
