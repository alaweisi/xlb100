import type { RowDataPacket } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  buildStagingDemoOperations,
  executeStagingDemoOperations,
  STAGING_DEMO_IDS,
  type StagingDemoBootstrapTarget,
} from "../../backend/src/demo/stagingDemoBootstrap.js";
import { cleanupStagingDemoFixture } from "./helpers/stagingDemoFixtureHelper.js";

beforeEach(cleanupStagingDemoFixture);
afterEach(cleanupStagingDemoFixture);

describe("staging demo bootstrap database lifecycle", () => {
  it("applies twice and restores the exact fixed demo state", async () => {
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
    const operations = buildStagingDemoOperations(target);

    const firstConnection = await pool.getConnection();
    try {
      await executeStagingDemoOperations(firstConnection, target, operations);
    } finally {
      firstConnection.release();
    }

    await pool.query(
      "UPDATE worker_profiles SET status='inactive' WHERE worker_id=?",
      [STAGING_DEMO_IDS.workerId],
    );
    await pool.query(
      "UPDATE admin_users SET role='admin' WHERE id=?",
      [STAGING_DEMO_IDS.adminUserId],
    );
    await pool.query(
      "INSERT INTO admin_city_scopes (admin_user_id, city_code) VALUES (?, 'shanghai')",
      [STAGING_DEMO_IDS.adminUserId],
    );
    await pool.query(
      `INSERT INTO worker_city_bindings (worker_id, city_code, is_enabled)
       VALUES (?, 'shanghai', 1)
       ON DUPLICATE KEY UPDATE is_enabled=1`,
      [STAGING_DEMO_IDS.workerId],
    );
    await pool.query(
      "UPDATE notification_recipient_states SET read_at=CURRENT_TIMESTAMP, row_version=2 WHERE state_id=?",
      [STAGING_DEMO_IDS.notificationStateId],
    );
    await pool.query(
      "UPDATE coupon_grants SET status='revoked', available_at=NULL, version=2 WHERE coupon_grant_id=?",
      [STAGING_DEMO_IDS.couponGrantId],
    );
    await pool.query(
      "UPDATE order_reviews SET rating=1, comment='corrupted demo review' WHERE review_id=?",
      [STAGING_DEMO_IDS.historyReviewId],
    );

    const secondConnection = await pool.getConnection();
    try {
      await executeStagingDemoOperations(secondConnection, target, operations);
    } finally {
      secondConnection.release();
    }

    const [identityRows] = await pool.query<(RowDataPacket & {
      worker_status: string;
      admin_role: string;
      admin_scope_count: number;
      worker_scope_count: number;
    })[]>(
      `SELECT
         (SELECT status FROM worker_profiles WHERE worker_id=?) AS worker_status,
         (SELECT role FROM admin_users WHERE id=?) AS admin_role,
         (SELECT COUNT(*) FROM admin_city_scopes
           WHERE admin_user_id=?) AS admin_scope_count,
         (SELECT COUNT(*) FROM worker_city_bindings
           WHERE worker_id=? AND is_enabled=1) AS worker_scope_count`,
      [
        STAGING_DEMO_IDS.workerId,
        STAGING_DEMO_IDS.adminUserId,
        STAGING_DEMO_IDS.adminUserId,
        STAGING_DEMO_IDS.workerId,
      ],
    );
    expect(identityRows[0]).toMatchObject({
      worker_status: "active",
      admin_role: "operator",
      admin_scope_count: 1,
      worker_scope_count: 1,
    });

    const [stateRows] = await pool.query<(RowDataPacket & {
      order_count: number;
      dispatch_count: number;
      coupon_status: string;
      notification_read_at: Date | null;
      support_status: string;
      review_count: number;
      review_rating: number;
      review_comment: string;
      review_status: string;
      location_sharing_enabled: number;
      location_is_fresh: number;
    })[]>(
      `SELECT
         (SELECT COUNT(*) FROM orders
           WHERE order_id IN (?, ?)) AS order_count,
         (SELECT COUNT(*) FROM dispatch_tasks
           WHERE dispatch_task_id IN (?, ?)) AS dispatch_count,
         (SELECT status FROM coupon_grants
           WHERE coupon_grant_id=?) AS coupon_status,
         (SELECT read_at FROM notification_recipient_states
           WHERE state_id=?) AS notification_read_at,
         (SELECT status FROM support_tickets
           WHERE ticket_id=?) AS support_status,
         (SELECT COUNT(*) FROM order_reviews
           WHERE review_id=?) AS review_count,
         (SELECT rating FROM order_reviews
           WHERE review_id=?) AS review_rating,
          (SELECT comment FROM order_reviews
            WHERE review_id=?) AS review_comment,
          (SELECT status FROM order_reviews
            WHERE review_id=?) AS review_status,
          (SELECT location_sharing_enabled FROM worker_dispatch_preferences
            WHERE worker_id=? AND city_code='hangzhou') AS location_sharing_enabled,
          (SELECT expires_at > CURRENT_TIMESTAMP(3) FROM worker_locations
            WHERE location_id=? AND worker_id=? AND city_code='hangzhou') AS location_is_fresh`,
      [
        STAGING_DEMO_IDS.activeOrderId,
        STAGING_DEMO_IDS.historyOrderId,
        STAGING_DEMO_IDS.activeDispatchTaskId,
        STAGING_DEMO_IDS.historyDispatchTaskId,
        STAGING_DEMO_IDS.couponGrantId,
        STAGING_DEMO_IDS.notificationStateId,
        STAGING_DEMO_IDS.supportTicketId,
        STAGING_DEMO_IDS.historyReviewId,
        STAGING_DEMO_IDS.historyReviewId,
        STAGING_DEMO_IDS.historyReviewId,
        STAGING_DEMO_IDS.historyReviewId,
        STAGING_DEMO_IDS.workerId,
        STAGING_DEMO_IDS.workerLocationId,
        STAGING_DEMO_IDS.workerId,
      ],
    );
    expect(stateRows[0]).toMatchObject({
      order_count: 2,
      dispatch_count: 2,
      coupon_status: "available",
      notification_read_at: null,
      support_status: "open",
      review_count: 1,
      review_rating: 5,
      review_comment: "服务准时，流程清晰（演示评价）",
      review_status: "created",
      location_sharing_enabled: 1,
      location_is_fresh: 1,
    });
  });

  it("does not modify any row when a configured unique identity belongs to a non-demo ID", async () => {
    const pool = getMysqlPool();
    const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
    const ordinaryCustomerId = `collision-owner-${suffix}`;
    const collidingPhone = `139${suffix}`;
    const target: StagingDemoBootstrapTarget = {
      environment: "staging",
      mysqlHost: process.env.MYSQL_HOST ?? "127.0.0.1",
      mysqlDatabase: process.env.MYSQL_DATABASE ?? "xlb_test_missing",
      cityCode: "hangzhou",
      customerPhone: collidingPhone,
      workerPhone: "13800000011",
      workerId: STAGING_DEMO_IDS.workerId,
      adminUsername: "investor_demo_hz",
      adminUserId: STAGING_DEMO_IDS.adminUserId,
      authPhoneHashSecret: "integration-demo-phone-hash-secret-at-least-32",
    };
    await pool.query(
      `INSERT INTO customers (id,phone,name,avatar_url,default_city_code)
       VALUES (?,?,'普通同城客户',NULL,'hangzhou')`,
      [ordinaryCustomerId, collidingPhone],
    );
    const [before] = await pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT phone FROM customers WHERE id=?) AS demo_phone,
         (SELECT name FROM customers WHERE id=?) AS ordinary_name,
         (SELECT status FROM orders WHERE order_id=?) AS demo_order_status,
         (SELECT rating FROM order_reviews WHERE review_id=?) AS demo_review_rating`,
      [
        STAGING_DEMO_IDS.customerId,
        ordinaryCustomerId,
        STAGING_DEMO_IDS.activeOrderId,
        STAGING_DEMO_IDS.historyReviewId,
      ],
    );
    const connection = await pool.getConnection();
    try {
      await expect(executeStagingDemoOperations(
        connection,
        target,
        buildStagingDemoOperations(target),
      )).rejects.toThrow("customer.phone@customers:1");
    } finally {
      connection.release();
    }
    const [after] = await pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT phone FROM customers WHERE id=?) AS demo_phone,
         (SELECT name FROM customers WHERE id=?) AS ordinary_name,
         (SELECT status FROM orders WHERE order_id=?) AS demo_order_status,
         (SELECT rating FROM order_reviews WHERE review_id=?) AS demo_review_rating`,
      [
        STAGING_DEMO_IDS.customerId,
        ordinaryCustomerId,
        STAGING_DEMO_IDS.activeOrderId,
        STAGING_DEMO_IDS.historyReviewId,
      ],
    );
    expect(after[0]).toEqual(before[0]);
    await pool.query("DELETE FROM customers WHERE id=?", [ordinaryCustomerId]);
  });
});
