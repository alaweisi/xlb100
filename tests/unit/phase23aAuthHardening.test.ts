import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { hashPhoneIdentity, validateMainlandPhone } from "../../backend/src/auth/phoneIdentity.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Phase 23A authentication hardening", () => {
  it("derives a deterministic, secret-keyed worker phone identity", () => {
    process.env.AUTH_PHONE_HASH_SECRET = "test-phone-identity-secret-with-at-least-32-characters";
    const phone = "13812345678";
    const digest = hashPhoneIdentity(phone);

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(hashPhoneIdentity(phone));
    expect(digest).not.toContain(phone);
    expect(hashPhoneIdentity("13812345679")).not.toBe(digest);
  });

  it("uses one mainland mobile validation rule for customer and worker auth", () => {
    expect(validateMainlandPhone("13812345678")).toBe(true);
    expect(validateMainlandPhone("12812345678")).toBe(false);
    expect(validateMainlandPhone("1381234567x")).toBe(false);
  });

  it("does not register debug-code routes when debug readback is disabled", async () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_DEBUG_CODE_ENABLED = "false";
    const app = await buildApp();
    try {
      for (const url of [
        "/api/auth/customer/debug-code?phone=13812345678",
        "/api/auth/admin/debug-code?username=operator_hz",
        "/api/auth/worker/debug-code?phone=13812345678",
      ]) {
        expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
      }
    } finally {
      await app.close();
    }
  });

  it("does not register debug-code routes in production even when the flag is true", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_DEBUG_CODE_ENABLED = "true";
    process.env.JWT_SECRET = "production-jwt-secret-for-auth-route-test-123456";
    process.env.MYSQL_HOST = "mysql.prod.internal";
    process.env.MYSQL_DATABASE = "xlb_prod";
    process.env.MYSQL_USER = "xlb_prod_app";
    process.env.MYSQL_PASSWORD = "production-mysql-password-for-route-test";
    process.env.MYSQL_TLS_ENABLED = "true";
    process.env.MYSQL_TLS_CA = "test-mysql-ca";
    process.env.REDIS_HOST = "redis.prod.internal";
    process.env.REDIS_PASSWORD = "production-redis-password-for-route-test";
    process.env.REDIS_TLS_ENABLED = "true";
    process.env.REDIS_TLS_CA = "test-redis-ca";
    process.env.AUTH_PHONE_HASH_SECRET = "production-phone-hash-secret-for-route-test";
    process.env.AUTH_OTP_PEPPER = "production-otp-pepper-for-route-test-123456";
    const app = await buildApp();
    try {
      expect((await app.inject({
        method: "GET",
        url: "/api/auth/worker/debug-code?phone=13812345678",
      })).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it.each([
    ["customer", { phone: "invalid" }],
    ["admin", { username: "x" }],
    ["worker", { phone: "invalid" }],
  ])("rate limits the real %s OTP issuance route", async (scope, payload) => {
    process.env.NODE_ENV = "test";
    const app = await buildApp();
    try {
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        expect((await app.inject({
          method: "POST",
          url: `/api/auth/${scope}/code`,
          payload,
        })).statusCode).toBe(400);
      }
      const blocked = await app.inject({
        method: "POST",
        url: `/api/auth/${scope}/code`,
        payload,
      });
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toMatchObject({ ok: false, rule: "otp" });
    } finally {
      await app.close();
    }
  });
});
