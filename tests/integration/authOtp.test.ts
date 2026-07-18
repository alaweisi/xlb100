import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { loginWorkerHeaders } from "./helpers/authTestHelper.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { getRedisClient } from "../../backend/src/dal/redisClient.js";
import { issueLoginOtp } from "../../backend/src/auth/otpService.js";
import { hashPhoneIdentity } from "../../backend/src/auth/phoneIdentity.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
let phoneSeq = 0;
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function phone(): string {
  phoneSeq += 1;
  const middle = Math.floor(Date.now() % 1_000_000).toString().padStart(6, "0");
  const suffix = phoneSeq.toString().padStart(2, "0");
  return `139${middle}${suffix}`;
}

describe.skipIf(!runDb)("auth OTP integration", { timeout: 20000 }, () => {
  it("locks a customer login code after max wrong attempts", async () => {
    const app = await buildApp();
    try {
      const loginPhone = phone();
      const requestCode = await app.inject({
        method: "POST",
        url: "/api/auth/customer/code",
        payload: { phone: loginPhone },
      });
      expect(requestCode.statusCode).toBe(200);

      for (let i = 0; i < 4; i++) {
        const wrong = await app.inject({
          method: "POST",
          url: "/api/auth/customer/login",
          payload: { phone: loginPhone, code: "000000" },
        });
        expect(wrong.statusCode).toBe(401);
      }

      const locked = await app.inject({
        method: "POST",
        url: "/api/auth/customer/login",
        payload: { phone: loginPhone, code: "000000" },
      });
      expect(locked.statusCode).toBe(429);
      expect(locked.json().ok).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("invalidates a customer login code immediately after successful use", async () => {
    const app = await buildApp();
    try {
      const loginPhone = phone();
      const requestCode = await app.inject({
        method: "POST",
        url: "/api/auth/customer/code",
        payload: { phone: loginPhone },
      });
      expect(requestCode.statusCode).toBe(200);

      const debug = await app.inject({
        method: "GET",
        url: `/api/auth/customer/debug-code?phone=${encodeURIComponent(loginPhone)}`,
      });
      expect(debug.statusCode).toBe(200);
      const code = debug.json().code as string;
      expect(code).toMatch(/^\d{6}$/);

      const first = await app.inject({
        method: "POST",
        url: "/api/auth/customer/login",
        payload: { phone: loginPhone, code },
      });
      expect(first.statusCode).toBe(200);
      expect(first.json().token).toBeTruthy();

      const replay = await app.inject({
        method: "POST",
        url: "/api/auth/customer/login",
        payload: { phone: loginPhone, code },
      });
      expect(replay.statusCode).toBe(401);
      expect(replay.json().ok).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("allows exactly one concurrent consumer for a valid login code", async () => {
    const app = await buildApp();
    try {
      const loginPhone = phone();
      expect((await app.inject({
        method: "POST",
        url: "/api/auth/customer/code",
        payload: { phone: loginPhone },
      })).statusCode).toBe(200);
      const debug = await app.inject({
        method: "GET",
        url: `/api/auth/customer/debug-code?phone=${encodeURIComponent(loginPhone)}`,
      });
      const code = debug.json().code as string;

      const responses = await Promise.all([1, 2].map(() => app.inject({
        method: "POST",
        url: "/api/auth/customer/login",
        payload: { phone: loginPhone, code },
      })));
      expect(responses.map(response => response.statusCode).sort()).toEqual([200, 401]);
    } finally {
      await app.close();
    }
  });

  it("enforces a per-identity resend cooldown", async () => {
    const app = await buildApp();
    try {
      const loginPhone = phone();
      expect((await app.inject({
        method: "POST",
        url: "/api/auth/customer/code",
        payload: { phone: loginPhone },
      })).statusCode).toBe(200);
      const repeated = await app.inject({
        method: "POST",
        url: "/api/auth/customer/code",
        payload: { phone: loginPhone },
      });
      expect(repeated.statusCode).toBe(429);
      expect(repeated.headers["retry-after"]).toBeTruthy();
      expect(repeated.json().error).toContain("too recently");
    } finally {
      await app.close();
    }
  });

  it("stores only a peppered OTP digest when debug readback is disabled", async () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_DEBUG_CODE_ENABLED = "false";
    process.env.JWT_SECRET = "stage2a-production-jwt-secret-at-least-32-characters";
    process.env.MYSQL_PASSWORD = "stage2a-production-mysql-password";
    process.env.AUTH_PHONE_HASH_SECRET = "stage2a-production-phone-hash-secret-0001";
    process.env.AUTH_OTP_PEPPER = "stage2a-production-otp-pepper-secret-0001";
    const loginPhone = phone();
    const issued = await issueLoginOtp("customer", loginPhone);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const identity = createHash("sha256").update(`customer:${loginPhone}`).digest("hex");
    const key = `xlb:auth:otp:customer:${identity}`;
    const client = getRedisClient();
    const raw = await client.get(key);
    try {
      expect(raw).not.toBeNull();
      expect(raw).not.toContain(issued.code);
      expect(JSON.parse(raw ?? "{}")).toMatchObject({ codeHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
      expect(JSON.parse(raw ?? "{}")).not.toHaveProperty("debugCode");
    } finally {
      await client.del(
        key,
        `xlb:auth:otp-cooldown:customer:${identity}`,
        `xlb:auth:otp-lock:customer:${identity}`,
      );
    }
  });

  it("issues a worker token from OTP and authenticates worker context", async () => {
    const app = await buildApp();
    try {
      const headers = await loginWorkerHeaders(app, {
        userId: "worker-auth-otp",
        phone: "13888885678",
        cityCode: "hangzhou",
      });

      const context = await app.inject({
        method: "GET",
        url: "/api/debug/context",
        headers,
      });

      expect(context.statusCode).toBe(200);
      expect(context.json()).toMatchObject({
        ok: true,
        appType: "worker",
        role: "worker",
        cityCode: "hangzhou",
        userId: "worker-auth-otp",
      });
    } finally {
      await app.close();
    }
  });

  it("does not authenticate a legacy worker from a masked-only phone identity", async () => {
    const app = await buildApp();
    const pool = getMysqlPool();
    const phoneValue = "13877771234";
    const id = "worker-phone-masked-only";
    try {
      await pool.query(
        `INSERT INTO worker_profiles (worker_id, display_name, phone_masked, phone_hash, status)
         VALUES (?, 'Masked Only', '138****1234', NULL, 'active')
         ON DUPLICATE KEY UPDATE phone_masked = VALUES(phone_masked), phone_hash = NULL, status = 'active'`,
        [id],
      );

      const response = await app.inject({
        method: "POST",
        url: "/api/auth/worker/code",
        payload: { phone: phoneValue },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        ok: false,
        error: "worker not found",
      });
    } finally {
      await pool.query("DELETE FROM worker_profiles WHERE worker_id = ?", [id]);
      await app.close();
    }
  });

  it.each([
    ["suspended", "WORKER_ACCESS_SUSPENDED"],
    ["disabled", "WORKER_ACCESS_DISABLED"],
  ] as const)("reveals a verified worker's %s access state only after OTP verification", async (status, code) => {
    const app = await buildApp();
    const pool = getMysqlPool();
    const phoneValue = phone();
    const id = `worker-access-${status}-${Date.now()}`;
    try {
      await pool.query(
        `INSERT INTO worker_profiles (worker_id, display_name, phone_masked, phone_hash, status)
         VALUES (?, ?, ?, ?, ?)`,
        [id, `Access ${status}`, `${phoneValue.slice(0, 3)}****${phoneValue.slice(-4)}`, hashPhoneIdentity(phoneValue), status],
      );

      const requestCode = await app.inject({ method: "POST", url: "/api/auth/worker/code", payload: { phone: phoneValue } });
      expect(requestCode.statusCode).toBe(200);
      const debug = await app.inject({ method: "GET", url: `/api/auth/worker/debug-code?phone=${encodeURIComponent(phoneValue)}` });
      const invalid = await app.inject({ method: "POST", url: "/api/auth/worker/login", payload: { phone: phoneValue, code: "000000" } });
      expect(invalid.statusCode).toBe(401);
      expect(invalid.json()).not.toHaveProperty("workerAccessStatus");

      const login = await app.inject({ method: "POST", url: "/api/auth/worker/login", payload: { phone: phoneValue, code: debug.json().code } });
      expect(login.statusCode).toBe(403);
      expect(login.json()).toMatchObject({ ok: false, code, workerAccessStatus: status });
    } finally {
      await pool.query("DELETE FROM worker_profiles WHERE worker_id = ?", [id]);
      await app.close();
    }
  });
});
