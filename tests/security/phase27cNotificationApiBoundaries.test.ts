import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";

describe("Phase27C notification API boundaries", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ rateLimit: { max: 10_000, windowMs: 60_000 } });
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires exact customer/worker app-role pairing and a concrete city", async () => {
    const cases = [
      { url: "/api/customer/notifications", appType: "worker" as const, role: "worker" as const },
      { url: "/api/worker/notifications", appType: "customer" as const, role: "customer" as const },
      { url: "/api/customer/notifications", appType: "admin" as const, role: "operator" as const },
    ];
    for (const item of cases) {
      const response = await app.inject({
        method: "GET",
        url: item.url,
        headers: bearerHeaders({ appType: item.appType, role: item.role, userId: "phase27c-boundary", cityCode: "hangzhou" }),
      });
      expect(response.statusCode).toBe(403);
    }
    const missingCity = await app.inject({
      method: "GET",
      url: "/api/customer/notifications",
      headers: bearerHeaders({ appType: "customer", role: "customer", userId: "phase27c-boundary" }),
    });
    expect(missingCity.statusCode).toBe(400);
  });

  it("rejects malformed list and mutation inputs before repository access", async () => {
    const headers = bearerHeaders({ appType: "customer", role: "customer", userId: "phase27c-boundary", cityCode: "hangzhou" });
    expect((await app.inject({ method: "GET", url: "/api/customer/notifications?limit=0", headers })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/customer/notifications?view=deleted", headers })).statusCode).toBe(400);
    expect((await app.inject({
      method: "POST",
      url: "/api/customer/notifications/id/read",
      headers,
      payload: { expectedRowVersion: 0, idempotencyKey: "too-short" },
    })).statusCode).toBe(400);
    expect((await app.inject({
      method: "POST",
      url: "/api/customer/notifications/id/archive",
      headers,
      payload: { expectedRowVersion: 1, idempotencyKey: "boundary-key-001", archived: true, cityCode: "beijing" },
    })).statusCode).toBe(400);
  });
});
