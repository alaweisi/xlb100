import type { FastifyInstance } from "fastify";
import { XLB_HEADERS } from "@xlb/types";
import { getMysqlPool } from "../../../backend/src/dal/mysqlPool.js";
import { createToken } from "../../../backend/src/auth/tokenAuth.js";
import { assertResponseJson } from "./httpResponseTestHelper.js";

export type TestHeaders = Record<string, string>;

export function bearerHeaders(options: {
  appType: "customer" | "worker" | "admin";
  role: "customer" | "worker" | "admin" | "operator" | "auditor";
  userId: string;
  cityCode?: string;
}): TestHeaders {
  const headers: TestHeaders = {
    Authorization: `Bearer ${createToken(options.userId, options.role, options.appType)}`,
  };
  if (options.cityCode) {
    headers[XLB_HEADERS.cityCode] = options.cityCode;
  }
  return headers;
}

export const workerAuthHeaders = (userId = "worker-demo-hangzhou", cityCode = "hangzhou") =>
  bearerHeaders({ appType: "worker", role: "worker", userId, cityCode });

export const adminAuthHeaders = (userId = "operator-hangzhou", cityCode = "hangzhou", role: "operator" | "admin" | "auditor" = "operator") =>
  bearerHeaders({ appType: "admin", role, userId, cityCode });

async function ensureCustomer(userId: string, phone: string): Promise<void> {
  await getMysqlPool().query(
    `INSERT INTO customers (id, phone, name)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE phone = VALUES(phone), name = VALUES(name)`,
    [userId, phone, `Test ${userId}`],
  );
}

async function ensureAdmin(userId: string, username: string, role: "admin" | "operator" | "auditor"): Promise<void> {
  await getMysqlPool().query(
    `INSERT INTO admin_users (id, username, role, city_scopes_json)
     VALUES (?, ?, ?, '["hangzhou","shanghai","beijing"]')
     ON DUPLICATE KEY UPDATE username = VALUES(username), role = VALUES(role), city_scopes_json = VALUES(city_scopes_json)`,
    [userId, username, role],
  );
}

function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

async function ensureWorker(userId: string, phone: string, cityCode: string): Promise<void> {
  const pool = getMysqlPool();
  await pool.query(
    `INSERT INTO worker_profiles (worker_id, display_name, phone_masked, status)
     VALUES (?, ?, ?, 'active')
     ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), phone_masked = VALUES(phone_masked), status = VALUES(status)`,
    [userId, `Test ${userId}`, maskPhone(phone)],
  );
  await pool.query(
    `INSERT INTO worker_city_bindings (worker_id, city_code, is_enabled)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled)`,
    [userId, cityCode],
  );
}

export async function loginCustomerHeaders(
  app: FastifyInstance,
  options: { userId?: string; phone?: string; cityCode?: string } = {},
): Promise<TestHeaders> {
  const userId = options.userId ?? "customer-demo-001";
  const phone = options.phone ?? "13800000001";
  const cityCode = options.cityCode ?? "hangzhou";
  await ensureCustomer(userId, phone);

  assertResponseJson(await app.inject({
    method: "POST",
    url: "/api/auth/customer/code",
    payload: { phone },
  }), "POST /api/auth/customer/code", [200]);

  const debug = assertResponseJson<{ code: string }>(await app.inject({
    method: "GET",
    url: `/api/auth/customer/debug-code?phone=${encodeURIComponent(phone)}`,
  }), "GET /api/auth/customer/debug-code", [200]);

  const login = assertResponseJson<{ token: string; userId: string }>(await app.inject({
    method: "POST",
    url: "/api/auth/customer/login",
    payload: { phone, code: debug.code },
  }), "POST /api/auth/customer/login", [200]);

  return {
    Authorization: `Bearer ${login.token}`,
    [XLB_HEADERS.cityCode]: cityCode,
  };
}

export async function loginWorkerHeaders(
  app: FastifyInstance,
  options: { userId?: string; phone?: string; cityCode?: string } = {},
): Promise<TestHeaders> {
  const userId = options.userId ?? "worker-auth-test";
  const phone = options.phone ?? "13888881234";
  const cityCode = options.cityCode ?? "hangzhou";
  await ensureWorker(userId, phone, cityCode);

  assertResponseJson(await app.inject({
    method: "POST",
    url: "/api/auth/worker/code",
    payload: { phone },
  }), "POST /api/auth/worker/code", [200]);

  const debug = assertResponseJson<{ code: string }>(await app.inject({
    method: "GET",
    url: `/api/auth/worker/debug-code?phone=${encodeURIComponent(phone)}`,
  }), "GET /api/auth/worker/debug-code", [200]);

  const login = assertResponseJson<{ token: string; userId: string; role: string }>(await app.inject({
    method: "POST",
    url: "/api/auth/worker/login",
    payload: { phone, code: debug.code },
  }), "POST /api/auth/worker/login", [200]);

  if (login.userId !== userId || login.role !== "worker") {
    throw new Error(`Worker login returned unexpected identity: ${JSON.stringify(login)}`);
  }

  return {
    Authorization: `Bearer ${login.token}`,
    [XLB_HEADERS.cityCode]: cityCode,
  };
}

export async function loginAdminHeaders(
  app: FastifyInstance,
  options: { userId?: string; username?: string; role?: "admin" | "operator" | "auditor"; cityCode?: string } = {},
): Promise<TestHeaders> {
  const userId = options.userId ?? "operator-hangzhou";
  const username = options.username ?? "operator_hz";
  const role = options.role ?? "operator";
  const cityCode = options.cityCode ?? "hangzhou";
  await ensureAdmin(userId, username, role);

  assertResponseJson(await app.inject({
    method: "POST",
    url: "/api/auth/admin/code",
    payload: { username },
  }), "POST /api/auth/admin/code", [200]);

  const debug = assertResponseJson<{ code: string }>(await app.inject({
    method: "GET",
    url: `/api/auth/admin/debug-code?username=${encodeURIComponent(username)}`,
  }), "GET /api/auth/admin/debug-code", [200]);

  const login = assertResponseJson<{ token: string }>(await app.inject({
    method: "POST",
    url: "/api/auth/admin/login",
    payload: { username, code: debug.code },
  }), "POST /api/auth/admin/login", [200]);

  return {
    Authorization: `Bearer ${login.token}`,
    [XLB_HEADERS.cityCode]: cityCode,
  };
}
