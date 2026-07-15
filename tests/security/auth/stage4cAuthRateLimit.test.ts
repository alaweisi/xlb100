import type { AppType, RequestContext, Role } from "@xlb/types";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../../backend/src/app.js";
import { createToken } from "../../../backend/src/auth/tokenAuth.js";
import { buildRequestContext } from "../../../backend/src/context/requestContext.js";
import { authorizeRequest } from "../../../backend/src/gateway/authz.js";
import type { RateLimitStore } from "../../../backend/src/security/rateLimitStore.js";
import { DeterministicFaultPlan } from "../../helpers/stage4cFaultInjection.js";

function context(appType: AppType, role: Role, cityCode: "hangzhou" | null = "hangzhou"): RequestContext {
  return {
    traceId: "stage4c-authz",
    requestId: "stage4c-authz",
    correlationId: "stage4c-authz",
    requestStartedAt: "2026-07-16T00:00:00.000Z",
    userId: `stage4c-${role}`,
    appType,
    role,
    cityCode: cityCode ?? undefined,
  };
}

describe("Stage 4C authentication and authorization matrix", () => {
  it.each([
    ["customer", "customer"],
    ["worker", "worker"],
    ["admin", "admin"],
    ["admin", "operator"],
    ["admin", "auditor"],
    ["oa", "admin"],
    ["oa", "operator"],
    ["dashboard", "admin"],
    ["dashboard", "operator"],
    ["dashboard", "auditor"],
  ] as const)("allows the %s app with %s role inside a city", (appType, role) => {
    expect(authorizeRequest(context(appType, role))).toMatchObject({ ok: true });
  });

  it.each([
    ["customer", "worker"],
    ["customer", "admin"],
    ["worker", "customer"],
    ["worker", "operator"],
    ["admin", "customer"],
    ["oa", "auditor"],
    ["dashboard", "customer"],
  ] as const)("rejects the %s app with forged %s role", (appType, role) => {
    expect(authorizeRequest(context(appType, role))).toMatchObject({
      ok: false,
      statusCode: 401,
    });
  });

  it("rejects city-scoped admin roles without an explicit city", () => {
    expect(authorizeRequest(context("admin", "operator", null))).toEqual({
      ok: false,
      statusCode: 403,
      message: "Admin scope missing: city_code required",
    });
  });

  it("uses verified token identity instead of spoofable legacy headers", () => {
    const token = createToken("stage4c-customer", "customer", "customer");
    const result = buildRequestContext({
      requireAuth: true,
      requireCityCode: true,
      headers: {
        authorization: `Bearer ${token}`,
        "x-xlb-city-code": "hangzhou",
        "x-xlb-user-id": "forged-admin",
        "x-xlb-role": "admin",
        "x-xlb-app-type": "admin",
      },
    });

    expect(result).toMatchObject({
      ok: true,
      context: {
        userId: "stage4c-customer",
        role: "customer",
        appType: "customer",
        cityCode: "hangzhou",
      },
    });
  });
});

describe("Stage 4C rate limit fault and concurrency matrix", () => {
  it("fails closed during an injected Redis outage and recovers on the next attempt", async () => {
    const plan = new DeterministicFaultPlan({
      name: "rate-limit-redis-outage",
      target: "redis",
      steps: [{ attempt: 1, effect: "error", message: "simulated Redis outage" }],
    });
    const store: RateLimitStore = {
      consume: () => plan.execute(() => ({ count: 1, resetInMs: 60_000 })),
    };
    const app = await buildApp({
      rateLimit: {
        store,
        rules: [{ id: "stage4c", matches: path => path === "/health", limit: 10, windowMs: 60_000 }],
      },
    });
    try {
      const failed = await app.inject({ method: "GET", url: "/health" });
      expect(failed.statusCode).toBe(503);
      expect(failed.json()).toMatchObject({ error: "rate limit unavailable", rule: "stage4c" });

      const recovered = await app.inject({ method: "GET", url: "/health" });
      expect(recovered.statusCode).toBe(200);
      expect(plan.snapshot()).toMatchObject({ attempts: 2, injected: 1 });
    } finally {
      await app.close();
    }
  });

  it("keeps the exact quota under a concurrent local burst", async () => {
    const app = await buildApp({
      rateLimit: {
        rules: [{ id: "stage4c-burst", matches: path => path === "/health", limit: 40, windowMs: 60_000 }],
      },
    });
    try {
      const responses = await Promise.all(Array.from(
        { length: 64 },
        () => app.inject({ method: "GET", url: "/health" }),
      ));
      expect(responses.filter(response => response.statusCode === 200)).toHaveLength(40);
      expect(responses.filter(response => response.statusCode === 429)).toHaveLength(24);
      expect(responses.every(response => response.statusCode === 200 || response.statusCode === 429)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
