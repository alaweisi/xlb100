import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { loginWorkerHeaders } from "./helpers/authTestHelper.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
let phoneSeq = 0;

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
});
