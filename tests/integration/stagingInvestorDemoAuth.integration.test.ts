import { afterEach, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { getRedisClient } from "../../backend/src/dal/redisClient.js";
import {
  buildStagingDemoOperations,
  executeStagingDemoOperations,
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
      await executeStagingDemoOperations(connection, target, buildStagingDemoOperations(target));
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
    const ordinaryCustomerId = "same-city-non-demo-customer";
    const queuedOrderId = "same-city-non-demo-order-queued";
    const queuedTaskId = "same-city-non-demo-task-queued";
    const fulfillmentOrderId = "same-city-non-demo-order-fulfillment";
    const fulfillmentTaskId = "same-city-non-demo-task-fulfillment";
    const acceptanceId = "same-city-non-demo-acceptance";
    const fulfillmentId = "same-city-non-demo-fulfillment";
    try {
      await pool.query(
        `INSERT INTO customers (id,phone,name,avatar_url,default_city_code)
         VALUES (?,'13900009991','同城非演示客户',NULL,'hangzhou')
         ON DUPLICATE KEY UPDATE name='同城非演示客户'`,
        [ordinaryCustomerId],
      );
      for (const orderId of [queuedOrderId, fulfillmentOrderId]) {
        await pool.query(
          `INSERT INTO orders (
             order_id,city_code,address_province,address_city,address_district,
             detail_address,contact_name,contact_phone,scheduled_at,
             scheduled_time_slot,customer_id,sku_id,sku_name,quantity,unit,
             price_rule_id,price_text,price_type,base_price,currency,total_amount,status
           ) VALUES (
             ?,'hangzhou','浙江省','杭州市','拱墅区','普通地址','普通客户',
             '13900009991','2030-01-15 09:00:00','morning',?,
             'sku_home_daily_2h','2小时日常保洁',1,'次',
             'price_hangzhou_sku_home_daily_2h','¥89/2小时','fixed',89,'CNY',89,
             'pending_dispatch'
           )
           ON DUPLICATE KEY UPDATE customer_id=VALUES(customer_id),status='pending_dispatch'`,
          [orderId, ordinaryCustomerId],
        );
      }
      await pool.query(
        `INSERT INTO dispatch_tasks (
           dispatch_task_id,city_code,order_id,customer_id,sku_id,amount,
           source_event_id,stream_name,status
         ) VALUES
           (?,'hangzhou',?,?,'sku_home_daily_2h',89,?,'same-city-test','queued'),
           (?,'hangzhou',?,?,'sku_home_daily_2h',89,?,'same-city-test','accepted')
         ON DUPLICATE KEY UPDATE customer_id=VALUES(customer_id),status=VALUES(status)`,
        [
          queuedTaskId,
          queuedOrderId,
          ordinaryCustomerId,
          "same-city-non-demo-event-queued",
          fulfillmentTaskId,
          fulfillmentOrderId,
          ordinaryCustomerId,
          "same-city-non-demo-event-fulfillment",
        ],
      );
      await pool.query(
        `INSERT INTO worker_task_acceptances (
           acceptance_id,dispatch_task_id,city_code,order_id,worker_id,sku_id,status,accepted_at
         ) VALUES (?,?,'hangzhou',?,?,'sku_home_daily_2h','accepted',CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE worker_id=VALUES(worker_id),status='accepted'`,
        [acceptanceId, fulfillmentTaskId, fulfillmentOrderId, STAGING_DEMO_IDS.workerId],
      );
      await pool.query(
        `INSERT INTO fulfillments (
           fulfillment_id,acceptance_id,dispatch_task_id,order_id,city_code,
           worker_id,sku_id,status
         ) VALUES (?,?,?,?,'hangzhou',?,'sku_home_daily_2h','accepted')
         ON DUPLICATE KEY UPDATE worker_id=VALUES(worker_id),status='accepted'`,
        [
          fulfillmentId,
          acceptanceId,
          fulfillmentTaskId,
          fulfillmentOrderId,
          STAGING_DEMO_IDS.workerId,
        ],
      );

      const customerCode = await app.inject({
        method: "POST",
        url: "/api/auth/customer/code",
        payload: { phone: "13800000001" },
      });
      const customerLogin = await app.inject({
        method: "POST",
        url: "/api/auth/customer/login",
        payload: {
          phone: "13800000001",
          code: customerCode.json().stagingDemoCode,
        },
      });
      expect(customerLogin.statusCode).toBe(200);
      const customerToken = customerLogin.json().token as string;
      const customerHeaders = { authorization: `Bearer ${customerToken}` };
      expect((await app.inject({
        method: "GET",
        url: `/api/orders/${queuedOrderId}`,
        headers: customerHeaders,
      })).statusCode).toBe(403);
      expect((await app.inject({
        method: "POST",
        url: `/api/orders/${fulfillmentOrderId}/confirm-service`,
        headers: customerHeaders,
      })).statusCode).toBe(403);
      expect((await app.inject({
        method: "POST",
        url: `/api/orders/${fulfillmentOrderId}/reviews`,
        headers: customerHeaders,
        payload: { rating: 5, comment: "不应写入" },
      })).statusCode).toBe(404);

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
      const workerHeaders = { authorization: `Bearer ${workerToken}` };
      const taskPool = await app.inject({
        method: "GET",
        url: "/api/worker/task-pool",
        headers: workerHeaders,
      });
      expect(taskPool.statusCode).toBe(200);
      expect(taskPool.json().tasks).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ dispatchTaskId: queuedTaskId }),
      ]));
      expect((await app.inject({
        method: "POST",
        url: `/api/worker/tasks/${queuedTaskId}/accept`,
        headers: workerHeaders,
        payload: {},
      })).statusCode).toBe(404);
      expect((await app.inject({
        method: "GET",
        url: `/api/worker/fulfillments/${fulfillmentId}`,
        headers: workerHeaders,
      })).statusCode).toBe(404);
      expect((await app.inject({
        method: "POST",
        url: `/api/worker/fulfillments/${fulfillmentId}/start`,
        headers: workerHeaders,
        payload: {},
      })).statusCode).toBe(404);
      expect((await app.inject({
        method: "POST",
        url: `/api/worker/fulfillments/${fulfillmentId}/complete`,
        headers: workerHeaders,
        payload: {},
      })).statusCode).toBe(404);
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
      const adminHeaders = { authorization: `Bearer ${adminToken}` };
      const adminOrders = await app.inject({
        method: "GET",
        url: "/api/internal/operations/orders",
        headers: adminHeaders,
      });
      expect(adminOrders.statusCode).toBe(200);
      expect(adminOrders.json().orders).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ orderId: queuedOrderId }),
      ]));
      const adminTasks = await app.inject({
        method: "GET",
        url: "/api/dispatch/tasks",
        headers: adminHeaders,
      });
      expect(adminTasks.statusCode).toBe(200);
      expect(adminTasks.json().tasks).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ dispatchTaskId: queuedTaskId }),
      ]));
      const adminBoard = await app.inject({
        method: "GET",
        url: "/api/internal/dispatch/board",
        headers: adminHeaders,
      });
      expect(adminBoard.statusCode).toBe(200);
      expect(adminBoard.json().rows).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ dispatchTaskId: queuedTaskId }),
      ]));
      expect((await app.inject({
        method: "GET",
        url: `/api/internal/admin/order-traces/${queuedOrderId}`,
        headers: adminHeaders,
      })).statusCode).toBe(404);
      expect((await app.inject({
        method: "POST",
        url: "/api/internal/dispatch/match-once",
        headers: adminHeaders,
        payload: { dispatchTaskId: queuedTaskId },
      })).statusCode).toBe(404);
      expect((await app.inject({
        method: "POST",
        url: "/api/internal/dispatch/match-once",
        headers: adminHeaders,
        payload: { limit: 50 },
      })).statusCode).toBe(200);
      const [nonDemoTaskRows] = await pool.query<Array<RowDataPacket & { status: string }>>(
        "SELECT status FROM dispatch_tasks WHERE dispatch_task_id=?",
        [queuedTaskId],
      );
      expect(nonDemoTaskRows[0]?.status).toBe("queued");
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
      await pool.query("DELETE FROM fulfillments WHERE fulfillment_id=?", [fulfillmentId]);
      await pool.query("DELETE FROM worker_task_acceptances WHERE acceptance_id=?", [acceptanceId]);
      await pool.query(
        "DELETE FROM dispatch_tasks WHERE dispatch_task_id IN (?,?)",
        [queuedTaskId, fulfillmentTaskId],
      );
      await pool.query(
        "DELETE FROM orders WHERE order_id IN (?,?)",
        [queuedOrderId, fulfillmentOrderId],
      );
      await pool.query("DELETE FROM customers WHERE id=?", [ordinaryCustomerId]);
    }
  });
});
