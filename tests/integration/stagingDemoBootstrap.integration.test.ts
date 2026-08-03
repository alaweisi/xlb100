import type { RowDataPacket } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INVESTOR_DEMO_IDENTITIES } from "@xlb/types";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  assertStagingDemoUniqueOwnership,
  buildStagingDemoOperations,
  buildStagingDemoUniqueOwnershipChecks,
  executeStagingDemoOperations,
  STAGING_DEMO_IDS,
  type StagingDemoBootstrapTarget,
} from "../../backend/src/demo/stagingDemoBootstrap.js";
import { cleanupStagingDemoFixture } from "./helpers/stagingDemoFixtureHelper.js";

beforeEach(cleanupStagingDemoFixture);
afterEach(cleanupStagingDemoFixture);

const legacyCustomerPhone = "13800000001";

function uniqueNumericSuffix(): string {
  return randomUUID().replace(/\D/gu, "").padEnd(8, "0").slice(0, 8);
}

function demoTarget(): StagingDemoBootstrapTarget {
  return {
    environment: "staging",
    mysqlHost: process.env.MYSQL_HOST ?? "127.0.0.1",
    mysqlDatabase: process.env.MYSQL_DATABASE ?? "xlb_test_missing",
    cityCode: "hangzhou",
    customerPhone: INVESTOR_DEMO_IDENTITIES.customer.phone,
    workerPhone: INVESTOR_DEMO_IDENTITIES.worker.phone,
    workerId: STAGING_DEMO_IDS.workerId,
    adminUsername: INVESTOR_DEMO_IDENTITIES.admin.username,
    adminUserId: STAGING_DEMO_IDS.adminUserId,
    authPhoneHashSecret: "integration-demo-phone-hash-secret-at-least-32",
  };
}

describe("staging demo bootstrap database lifecycle", () => {
  it("applies twice and restores the exact fixed demo state", async () => {
    const pool = getMysqlPool();
    const target = demoTarget();
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

  it("ignores the preserved legacy owner and updates only the fixed Customer ID", async () => {
    const pool = getMysqlPool();
    const suffix = uniqueNumericSuffix();
    const fixtureLegacyOwnerId = `legacy-phone-owner-${suffix}`;
    const transitionalPhone = `137${suffix}`;
    const target = demoTarget();
    let removeFixtureLegacyOwner = false;
    let legacyOwnerId = fixtureLegacyOwnerId;
    try {
      await pool.query(
        "UPDATE customers SET phone=? WHERE id=?",
        [transitionalPhone, STAGING_DEMO_IDS.customerId],
      );
      const [existingLegacyOwners] = await pool.query<(RowDataPacket & { id: string })[]>(
        "SELECT id FROM customers WHERE phone=?",
        [legacyCustomerPhone],
      );
      if (existingLegacyOwners[0]) {
        legacyOwnerId = existingLegacyOwners[0].id;
        expect(legacyOwnerId).not.toBe(STAGING_DEMO_IDS.customerId);
      } else {
        await pool.query(
          `INSERT INTO customers (id,phone,name,avatar_url,default_city_code)
           VALUES (?,?,'preserved legacy owner',NULL,'hangzhou')`,
          [legacyOwnerId, legacyCustomerPhone],
        );
        removeFixtureLegacyOwner = true;
      }
      const [legacyBefore] = await pool.query<(RowDataPacket & { fingerprint: string })[]>(
        `SELECT SHA2(CONCAT_WS('|', id, phone, COALESCE(name, ''),
           COALESCE(avatar_url, ''), COALESCE(default_city_code, ''),
           CAST(created_at AS CHAR), CAST(updated_at AS CHAR)), 256) AS fingerprint
         FROM customers WHERE id=?`,
        [legacyOwnerId],
      );
      const legacyFingerprint = legacyBefore[0]?.fingerprint;
      expect(typeof legacyFingerprint).toBe("string");

      const dryRunConnection = await pool.getConnection();
      try {
        await dryRunConnection.beginTransaction();
        try {
          await expect(assertStagingDemoUniqueOwnership(
            dryRunConnection,
            buildStagingDemoUniqueOwnershipChecks(target),
          )).resolves.toBeUndefined();
        } finally {
          await dryRunConnection.rollback();
        }
      } finally {
        dryRunConnection.release();
      }

      const applyConnection = await pool.getConnection();
      try {
        await executeStagingDemoOperations(
          applyConnection,
          target,
          buildStagingDemoOperations(target),
        );
      } finally {
        applyConnection.release();
      }

      const [rows] = await pool.query<(RowDataPacket & {
        demo_phone_matches: number;
        legacy_owner_unchanged: number;
        unexpected_owner_count: number;
      })[]>(
        `SELECT
           (SELECT COUNT(*) FROM customers WHERE id=? AND phone=?) AS demo_phone_matches,
           (SELECT COUNT(*) FROM customers WHERE id=? AND phone=?
             AND SHA2(CONCAT_WS('|', id, phone, COALESCE(name, ''),
               COALESCE(avatar_url, ''), COALESCE(default_city_code, ''),
               CAST(created_at AS CHAR), CAST(updated_at AS CHAR)), 256)=?)
             AS legacy_owner_unchanged,
           (SELECT COUNT(*) FROM customers WHERE phone=? AND id<>?) AS unexpected_owner_count`,
        [
          STAGING_DEMO_IDS.customerId,
          target.customerPhone,
          legacyOwnerId,
          legacyCustomerPhone,
          legacyFingerprint,
          target.customerPhone,
          STAGING_DEMO_IDS.customerId,
        ],
      );
      expect(rows[0]).toMatchObject({
        demo_phone_matches: 1,
        legacy_owner_unchanged: 1,
        unexpected_owner_count: 0,
      });
    } finally {
      if (removeFixtureLegacyOwner) {
        await pool.query("DELETE FROM customers WHERE id=?", [legacyOwnerId]);
      }
    }
  });

  it("fails closed with zero writes when the new fixed phone has a non-demo owner", async () => {
    const pool = getMysqlPool();
    const suffix = uniqueNumericSuffix();
    const ordinaryCustomerId = `new-phone-collision-${suffix}`;
    const transitionalPhone = `136${suffix}`;
    const target = demoTarget();
    await pool.query(
      "UPDATE customers SET phone=? WHERE id=?",
      [transitionalPhone, STAGING_DEMO_IDS.customerId],
    );
    try {
      await pool.query(
        `INSERT INTO customers (id,phone,name,avatar_url,default_city_code)
         VALUES (?,?,'new phone collision owner',NULL,'hangzhou')`,
        [ordinaryCustomerId, target.customerPhone],
      );
      const [before] = await pool.query<RowDataPacket[]>(
        `SELECT
           (SELECT name FROM customers WHERE id=?) AS ordinary_name,
           (SELECT COUNT(*) FROM customers WHERE id=?) AS demo_customer_count,
           (SELECT COUNT(*) FROM orders WHERE order_id IN (?, ?)) AS demo_order_count,
           (SELECT COUNT(*) FROM order_reviews WHERE review_id=?) AS demo_review_count`,
        [
          ordinaryCustomerId,
          STAGING_DEMO_IDS.customerId,
          STAGING_DEMO_IDS.activeOrderId,
          STAGING_DEMO_IDS.historyOrderId,
          STAGING_DEMO_IDS.historyReviewId,
        ],
      );
      const dryRunConnection = await pool.getConnection();
      try {
        await dryRunConnection.beginTransaction();
        try {
          await expect(assertStagingDemoUniqueOwnership(
            dryRunConnection,
            buildStagingDemoUniqueOwnershipChecks(target),
          )).rejects.toThrow("customer.phone@customers:1");
        } finally {
          await dryRunConnection.rollback();
        }
      } finally {
        dryRunConnection.release();
      }
      const applyConnection = await pool.getConnection();
      try {
        await expect(executeStagingDemoOperations(
          applyConnection,
          target,
          buildStagingDemoOperations(target),
        )).rejects.toThrow("customer.phone@customers:1");
      } finally {
        applyConnection.release();
      }
      const [after] = await pool.query<RowDataPacket[]>(
        `SELECT
           (SELECT name FROM customers WHERE id=?) AS ordinary_name,
           (SELECT COUNT(*) FROM customers WHERE id=?) AS demo_customer_count,
           (SELECT COUNT(*) FROM orders WHERE order_id IN (?, ?)) AS demo_order_count,
           (SELECT COUNT(*) FROM order_reviews WHERE review_id=?) AS demo_review_count`,
        [
          ordinaryCustomerId,
          STAGING_DEMO_IDS.customerId,
          STAGING_DEMO_IDS.activeOrderId,
          STAGING_DEMO_IDS.historyOrderId,
          STAGING_DEMO_IDS.historyReviewId,
        ],
      );
      expect(after[0]).toEqual(before[0]);
    } finally {
      await pool.query("DELETE FROM customers WHERE id=?", [ordinaryCustomerId]);
    }
  });
});
