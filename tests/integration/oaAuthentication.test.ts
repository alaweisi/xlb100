import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { verifyToken } from "../../backend/src/auth/tokenAuth.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";

const suffix = Date.now().toString(36);
const globalId = `oa-global-${suffix}`;
const globalUsername = `oa_global_${suffix}`;
const localId = `oa-local-${suffix}`;
const localUsername = `oa_local_${suffix}`;
const operatorId = `oa-operator-${suffix}`;
const operatorUsername = `oa_operator_${suffix}`;
const app = await buildApp();

describe("OA dedicated authentication", () => {
  beforeAll(async () => {
    const pool = getMysqlPool();
    await pool.query(
      "INSERT INTO admin_users(id,username,role,city_scopes_json) VALUES(?,?,'admin',JSON_ARRAY('__global__')),(?,?,'admin',JSON_ARRAY('hangzhou')),(?,?,'operator',JSON_ARRAY('__global__'))",
      [globalId, globalUsername, localId, localUsername, operatorId, operatorUsername],
    );
    await pool.query(
      "INSERT INTO admin_city_scopes(admin_user_id,city_code) VALUES(?,'__global__'),(?,'hangzhou'),(?,'__global__')",
      [globalId, localId, operatorId],
    );
    await app.ready();
  });

  afterAll(async () => {
    const pool = getMysqlPool();
    await pool.query("DELETE FROM admin_city_scopes WHERE admin_user_id IN (?,?,?)", [globalId, localId, operatorId]);
    await pool.query("DELETE FROM admin_users WHERE id IN (?,?,?)", [globalId, localId, operatorId]);
    await app.close();
  });

  it.each([localUsername, operatorUsername])("does not issue an OA OTP to non-headquarters identity %s", async username => {
    const response = await app.inject({ method: "POST", url: "/api/auth/oa/code", payload: { username } });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ ok: false, error: "OA headquarters account not found or unauthorized" });
  });

  it("issues an OA-bound token only after the dedicated OTP flow", async () => {
    expect((await app.inject({ method: "POST", url: "/api/auth/admin/code", payload: { username: globalUsername } })).statusCode).toBe(200);
    const adminDebug = await app.inject({ method: "GET", url: `/api/auth/admin/debug-code?username=${encodeURIComponent(globalUsername)}` });
    const adminCode = (adminDebug.json() as { code: string }).code;
    expect((await app.inject({ method: "POST", url: "/api/auth/oa/login", payload: { username: globalUsername, code: adminCode } })).statusCode).toBe(401);

    expect((await app.inject({ method: "POST", url: "/api/auth/oa/code", payload: { username: globalUsername } })).statusCode).toBe(200);
    const debug = await app.inject({ method: "GET", url: `/api/auth/oa/debug-code?username=${encodeURIComponent(globalUsername)}` });
    expect(debug.statusCode).toBe(200);
    const code = (debug.json() as { code: string }).code;
    expect((await app.inject({ method: "POST", url: "/api/auth/admin/login", payload: { username: globalUsername, code } })).statusCode).toBe(401);

    const login = await app.inject({ method: "POST", url: "/api/auth/oa/login", payload: { username: globalUsername, code } });
    expect(login.statusCode).toBe(200);
    const body = login.json() as { token: string; userId: string; role: string };
    expect(body).toMatchObject({ userId: globalId, role: "admin" });
    expect(verifyToken(body.token)).toMatchObject({ ok: true, payload: { appType: "oa", role: "admin", sub: globalId } });

    const missingCity = await app.inject({
      method: "GET",
      url: "/api/internal/dispatch/board",
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(missingCity.statusCode).toBe(400);

    const headquartersDispatch = await app.inject({
      method: "GET",
      url: "/api/internal/dispatch/board",
      headers: { Authorization: `Bearer ${body.token}`, "x-xlb-city-code": "hangzhou" },
    });
    expect(headquartersDispatch.statusCode).toBe(200);
    expect(headquartersDispatch.json()).toMatchObject({ ok: true });
  });

  it("issues an isolated read-only Dashboard token and returns real aggregate fields", async () => {
    expect((await app.inject({ method: "POST", url: "/api/auth/dashboard/code", payload: { username: globalUsername } })).statusCode).toBe(200);
    const debug = await app.inject({ method: "GET", url: `/api/auth/dashboard/debug-code?username=${encodeURIComponent(globalUsername)}` });
    expect(debug.statusCode).toBe(200);
    const code = (debug.json() as { code: string }).code;

    const login = await app.inject({ method: "POST", url: "/api/auth/dashboard/login", payload: { username: globalUsername, code } });
    expect(login.statusCode).toBe(200);
    const body = login.json() as { token: string };
    expect(verifyToken(body.token)).toMatchObject({ ok: true, payload: { appType: "dashboard", role: "admin", sub: globalId } });

    const operations = await app.inject({
      method: "GET",
      url: "/api/internal/dashboard/operations",
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(operations.statusCode).toBe(200);
    expect(operations.headers["cache-control"]).toBe("no-store");
    expect(operations.json()).toMatchObject({
      ok: true,
      snapshot: {
        source: "mysql-readonly-aggregate",
        refreshAfterSeconds: 15,
        totals: {
          todayOrders: expect.any(Number),
          activeOrders: expect.any(Number),
          completedToday: expect.any(Number),
          pendingDispatch: expect.any(Number),
          openSupportTickets: expect.any(Number),
          openAftersaleComplaints: expect.any(Number),
        },
        cities: expect.any(Array),
      },
    });

    const oaCodeRequest = await app.inject({ method: "POST", url: "/api/auth/oa/code", payload: { username: globalUsername } });
    expect(oaCodeRequest.statusCode).toBe(200);
    const oaDebug = await app.inject({ method: "GET", url: `/api/auth/oa/debug-code?username=${encodeURIComponent(globalUsername)}` });
    const oaCode = (oaDebug.json() as { code: string }).code;
    const oaLoginResponse = await app.inject({ method: "POST", url: "/api/auth/oa/login", payload: { username: globalUsername, code: oaCode } });
    const oaToken = (oaLoginResponse.json() as { token: string }).token;
    expect((await app.inject({ method: "GET", url: "/api/internal/dashboard/operations", headers: { Authorization: `Bearer ${oaToken}` } })).statusCode).toBe(403);
  });
});
