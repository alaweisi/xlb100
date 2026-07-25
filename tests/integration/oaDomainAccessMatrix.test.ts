import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { closeMysqlPool } from "../../backend/src/dal/mysqlPool.js";

async function login(app: FastifyInstance, username: string): Promise<string> {
  const issued = await app.inject({
    method: "POST",
    url: "/api/auth/oa/code",
    payload: { username },
  });
  expect(issued.statusCode, issued.body).toBe(200);
  const debug = await app.inject({
    method: "GET",
    url: `/api/auth/oa/debug-code?username=${encodeURIComponent(username)}`,
  });
  expect(debug.statusCode, debug.body).toBe(200);
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/oa/login",
    payload: { username, code: debug.json().code },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().token as string;
}

describe("OA to Admin domain access matrix", { timeout: 30_000 }, () => {
  let app: FastifyInstance;
  let branchToken: string;

  beforeAll(async () => {
    app = await buildApp();
    branchToken = await login(app, "admin_hz");
  });

  afterAll(async () => {
    await app.close();
    await closeMysqlPool();
  });

  function headers(cityCode = "hangzhou") {
    return {
      authorization: `Bearer ${branchToken}`,
      "x-xlb-city-code": cityCode,
    };
  }

  it("allows a registered read action through the existing Admin service", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/oa/domains/api/internal/operations/skus",
      headers: headers(),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, skus: expect.any(Array) });
  });

  it("does not let a read permission invoke the corresponding write action", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/oa/domains/api/internal/operations/skus/nonexistent/status",
      headers: headers(),
      payload: { enabled: false },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ reasonCode: "permission_missing" });
  });

  it("rejects cross-city and unregistered routes before reaching Admin", async () => {
    const crossCity = await app.inject({
      method: "GET",
      url: "/api/oa/domains/api/internal/operations/skus",
      headers: headers("shanghai"),
    });
    expect(crossCity.statusCode).toBe(403);
    expect(crossCity.json()).toMatchObject({ reasonCode: "city_scope_denied" });

    const unregistered = await app.inject({
      method: "GET",
      url: "/api/oa/domains/api/system/status",
      headers: headers(),
    });
    expect(unregistered.statusCode).toBe(403);
    expect(unregistered.json()).toMatchObject({
      reasonCode: "oa_domain_action_unregistered",
    });
  });

  it("hands an OA identity to Admin with a short-lived single-use ticket", async () => {
    const issued = await app.inject({
      method: "POST",
      url: "/api/oa/admin-handoffs",
      headers: headers(),
      payload: {
        targetPath: "/admin/#/platform-operations",
        permissionKey: "operations.orders.read",
        cityCode: "hangzhou",
      },
    });
    expect(issued.statusCode, issued.body).toBe(200);
    expect(issued.json()).toMatchObject({
      ok: true,
      targetPath: "/admin/#/platform-operations",
      cityCode: "hangzhou",
      ticket: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
    });

    const exchanged = await app.inject({
      method: "POST",
      url: "/api/auth/oa/admin-handoffs/exchange",
      payload: { ticket: issued.json().ticket },
    });
    expect(exchanged.statusCode, exchanged.body).toBe(200);
    expect(exchanged.json()).toMatchObject({
      ok: true,
      username: "admin_hz",
      targetPath: "/admin/#/platform-operations",
      cityCode: "hangzhou",
    });

    const principal = await app.inject({
      method: "GET",
      url: "/api/oa/me",
      headers: { authorization: `Bearer ${exchanged.json().token}` },
    });
    expect(principal.statusCode, principal.body).toBe(200);

    const replay = await app.inject({
      method: "POST",
      url: "/api/auth/oa/admin-handoffs/exchange",
      payload: { ticket: issued.json().ticket },
    });
    expect(replay.statusCode).toBe(401);
  });

  it("rejects a handoff target that does not match its exact permission", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/oa/admin-handoffs",
      headers: headers(),
      payload: {
        targetPath: "/admin/#/marketing",
        permissionKey: "operations.orders.read",
        cityCode: "hangzhou",
      },
    });
    expect(response.statusCode).toBe(400);
  });
});
