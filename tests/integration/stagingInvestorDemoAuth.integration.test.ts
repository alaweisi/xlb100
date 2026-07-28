import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { getRedisClient } from "../../backend/src/dal/redisClient.js";
import {
  applyStagingDemoOperations,
  buildStagingDemoOperations,
  STAGING_DEMO_IDS,
  type StagingDemoBootstrapTarget,
} from "../../backend/src/demo/stagingDemoBootstrap.js";

const originalEnv = { ...process.env };

function configureStagingRuntime(): void {
  process.env.NODE_ENV = "staging";
  process.env.JWT_SECRET = "investor-demo-jwt-secret-at-least-32-characters";
  process.env.MYSQL_PASSWORD = "investor-demo-mysql-password";
  process.env.REDIS_PASSWORD = "investor-demo-redis-password";
  process.env.AUTH_PHONE_HASH_SECRET = "integration-demo-phone-hash-secret-at-least-32";
  process.env.AUTH_OTP_PEPPER = "investor-demo-otp-pepper-at-least-32-chars";
  process.env.AUTH_DEBUG_CODE_ENABLED = "false";
  process.env.RATE_LIMIT_BACKEND = "redis";
  process.env.TRUST_PROXY_HOPS = "1";
  process.env.PAYMENT_MOCK_WEBHOOK_ENABLED = "false";
  process.env.STAGING_DEMO_CUSTOMER_AUTH_ENABLED = "true";
  process.env.STAGING_DEMO_CUSTOMER_PHONE = "13800000001";
  process.env.STAGING_INVESTOR_DEMO_AUTH_ENABLED = "true";
  process.env.STAGING_DEMO_WORKER_ID = STAGING_DEMO_IDS.workerId;
  process.env.STAGING_DEMO_WORKER_PHONE = "13800000011";
  process.env.STAGING_DEMO_ADMIN_USER_ID = STAGING_DEMO_IDS.adminUserId;
  process.env.STAGING_DEMO_ADMIN_USERNAME = "investor_demo_hz";
  process.env.STAGING_DEMO_CITY_CODE = "hangzhou";
  process.env.STAGING_DEMO_TOKEN_TTL_SECONDS = "900";
}

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("staging investor demo authentication lifecycle", () => {
  it("logs in Worker/Admin without debug routes and enforces city/revocation/policy", async () => {
    const pool = getMysqlPool();
    const target: StagingDemoBootstrapTarget = {
      environment: "staging",
      mysqlHost: process.env.MYSQL_HOST ?? "127.0.0.1",
      mysqlDatabase: process.env.MYSQL_DATABASE ?? "xlb_test_missing",
      cityCode: "hangzhou",
      customerPhone: "13800000001",
      workerPhone: "13800000011",
      workerId: STAGING_DEMO_IDS.workerId,
      adminUsername: "investor_demo_hz",
      adminUserId: STAGING_DEMO_IDS.adminUserId,
      authPhoneHashSecret: "integration-demo-phone-hash-secret-at-least-32",
    };
    const connection = await pool.getConnection();
    try {
      await applyStagingDemoOperations(connection, buildStagingDemoOperations(target));
    } finally {
      connection.release();
    }

    // Bind the shared test Redis client before switching config validation to
    // staging. The test runner owns this isolated runtime and clears OTPs by
    // consuming them below.
    const redis = getRedisClient();
    if (redis.status === "wait") await redis.connect();
    configureStagingRuntime();

    const app = await buildApp();
    try {
      const workerCode = await app.inject({
        method: "POST",
        url: "/api/auth/worker/code",
        payload: { phone: "13800000011" },
      });
      expect(workerCode.statusCode).toBe(200);
      expect(workerCode.json()).toMatchObject({
        ok: true,
        stagingDemoCode: expect.stringMatching(/^\d{6}$/u),
      });
      expect((await app.inject({
        method: "GET",
        url: "/api/auth/worker/debug-code?phone=13800000011",
      })).statusCode).toBe(404);
      const workerLogin = await app.inject({
        method: "POST",
        url: "/api/auth/worker/login",
        payload: {
          phone: "13800000011",
          code: workerCode.json().stagingDemoCode,
        },
      });
      expect(workerLogin.statusCode).toBe(200);
      const workerToken = workerLogin.json().token as string;
      expect((await app.inject({
        method: "GET",
        url: "/api/debug/context",
        headers: { authorization: `Bearer ${workerToken}` },
      })).json()).toMatchObject({
        ok: true,
        appType: "worker",
        cityCode: "hangzhou",
        userId: STAGING_DEMO_IDS.workerId,
      });
      expect((await app.inject({
        method: "GET",
        url: "/api/debug/context",
        headers: {
          authorization: `Bearer ${workerToken}`,
          "x-xlb-city-code": "shanghai",
        },
      })).statusCode).toBe(401);

      const adminCode = await app.inject({
        method: "POST",
        url: "/api/auth/admin/code",
        payload: { username: "investor_demo_hz" },
      });
      expect(adminCode.statusCode).toBe(200);
      expect(adminCode.json()).toMatchObject({
        ok: true,
        stagingDemoCode: expect.stringMatching(/^\d{6}$/u),
      });
      expect((await app.inject({
        method: "GET",
        url: "/api/auth/admin/debug-code?username=investor_demo_hz",
      })).statusCode).toBe(404);
      const adminLogin = await app.inject({
        method: "POST",
        url: "/api/auth/admin/login",
        payload: {
          username: "investor_demo_hz",
          code: adminCode.json().stagingDemoCode,
        },
      });
      expect(adminLogin.statusCode).toBe(200);
      const adminToken = adminLogin.json().token as string;
      expect((await app.inject({
        method: "GET",
        url: "/api/internal/operations/orders",
        headers: { authorization: `Bearer ${adminToken}` },
      })).statusCode).toBe(200);
      expect((await app.inject({
        method: "POST",
        url: "/api/internal/operations/skus/sku_home_daily_2h/status",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { enabled: false },
      })).statusCode).toBe(403);

      await pool.query(
        "UPDATE admin_users SET role='admin' WHERE id=?",
        [STAGING_DEMO_IDS.adminUserId],
      );
      expect((await app.inject({
        method: "GET",
        url: "/api/internal/operations/orders",
        headers: { authorization: `Bearer ${adminToken}` },
      })).statusCode).toBe(401);
      await pool.query(
        "UPDATE admin_users SET role='operator' WHERE id=?",
        [STAGING_DEMO_IDS.adminUserId],
      );

      process.env.STAGING_INVESTOR_DEMO_AUTH_ENABLED = "false";
      expect((await app.inject({
        method: "GET",
        url: "/api/internal/operations/orders",
        headers: { authorization: `Bearer ${adminToken}` },
      })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
