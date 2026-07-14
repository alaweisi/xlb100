import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../../../backend/src/dal/mysqlPool.js";
import { runMigrations } from "../../../backend/src/dal/migrationRunner.js";

const nonce = `${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;

export const phase29Fixture = {
  nonce,
  cityCode: "hangzhou",
  creator: { id: `p29e_creator_${nonce}`, username: `p29e_creator_${nonce}` },
  reviewer: { id: `p29e_reviewer_${nonce}`, username: `p29e_reviewer_${nonce}` },
  publisher: { id: `p29e_publisher_${nonce}`, username: `p29e_publisher_${nonce}` },
  traceOperator: { id: `p29e_trace_${nonce}`, username: `p29e_trace_${nonce}` },
  customerPhone: `139${String(Date.now()).slice(-8)}`,
  customerId: "",
  campaignId: "",
  ruleRevisionId: "",
  definitionId: "",
  grantId: "",
  decisionId: "",
  reservationId: "",
  redemptionId: "",
  orderId: "",
};

let workerStateBefore = "";
let subscriptionStateBefore = "";

async function rowsJson(sql: string, params: unknown[] = []): Promise<string> {
  const [rows] = await getMysqlPool().query<RowDataPacket[]>(sql, params);
  return JSON.stringify(rows);
}

async function snapshotWorkerState(): Promise<string> {
  const snapshots = await Promise.all([
    rowsJson("SELECT * FROM worker_profiles WHERE worker_id='worker-demo-hangzhou'"),
    rowsJson("SELECT * FROM worker_city_bindings WHERE worker_id='worker-demo-hangzhou' ORDER BY city_code"),
    rowsJson("SELECT * FROM worker_online_status WHERE worker_id='worker-demo-hangzhou' ORDER BY city_code"),
    rowsJson("SELECT * FROM worker_locations WHERE worker_id='worker-demo-hangzhou' ORDER BY city_code,location_id"),
    rowsJson("SELECT * FROM worker_dispatch_preferences WHERE worker_id='worker-demo-hangzhou' ORDER BY city_code"),
    rowsJson("SELECT * FROM worker_qualifications WHERE worker_id='worker-demo-hangzhou' ORDER BY city_code,sku_id"),
  ]);
  return JSON.stringify(snapshots);
}

async function snapshotSubscriptions(): Promise<string> {
  return rowsJson(
    `SELECT subscription_id,city_code,subscriber_id,event_type,event_major_version,status,
            live_start_created_at,live_start_event_id
       FROM platform_event_subscriptions
      ORDER BY subscription_id`,
  );
}

export async function setupPhase29MarketingFixture(): Promise<void> {
  await runMigrations();
  const pool = getMysqlPool();
  const [markers] = await pool.query<(RowDataPacket & { count: number | string })[]>(
    "SELECT COUNT(*) count FROM schema_migrations WHERE version='057_phase29_marketing_coupon'",
  );
  if (Number(markers[0]?.count ?? 0) !== 1) {
    throw new Error("Phase29 browser acceptance requires migration 057 exactly once");
  }

  workerStateBefore = await snapshotWorkerState();
  subscriptionStateBefore = await snapshotSubscriptions();
  for (const actor of [phase29Fixture.creator, phase29Fixture.reviewer, phase29Fixture.publisher, phase29Fixture.traceOperator]) {
    await pool.query(
      "INSERT INTO admin_users(id,username,role,city_scopes_json) VALUES(?,?,?,JSON_ARRAY('hangzhou'))",
      [actor.id, actor.username, actor === phase29Fixture.traceOperator ? "operator" : "admin"],
    );
    await pool.query(
      "INSERT INTO admin_city_scopes(admin_user_id,city_code) VALUES(?,'hangzhou')",
      [actor.id],
    );
  }
}

async function deleteByIds(table: string, column: string, ids: string[]): Promise<void> {
  const values = ids.filter(Boolean);
  if (values.length === 0) return;
  await getMysqlPool().query(
    `DELETE FROM ${table} WHERE ${column} IN (${values.map(() => "?").join(",")})`,
    values,
  );
}

export async function cleanupPhase29MarketingFixture(): Promise<void> {
  const pool = getMysqlPool();
  const businessIds = [
    phase29Fixture.orderId,
    phase29Fixture.decisionId,
    phase29Fixture.reservationId,
    phase29Fixture.redemptionId,
    phase29Fixture.grantId,
    phase29Fixture.definitionId,
    phase29Fixture.ruleRevisionId,
    phase29Fixture.campaignId,
  ];

  await deleteByIds("event_outbox", "aggregate_id", businessIds);
  await pool.query(
    "DELETE FROM marketing_audit_records WHERE actor_id IN (?,?,?,?,?)",
    [
      phase29Fixture.creator.id,
      phase29Fixture.reviewer.id,
      phase29Fixture.publisher.id,
      phase29Fixture.traceOperator.id,
      phase29Fixture.customerId || "__phase29_missing_customer__",
    ],
  );
  if (phase29Fixture.customerId) {
    await pool.query("DELETE FROM marketing_compensations WHERE customer_id=?", [phase29Fixture.customerId]);
    await pool.query("DELETE FROM coupon_redemptions WHERE customer_id=?", [phase29Fixture.customerId]);
    await pool.query("DELETE FROM coupon_reservations WHERE customer_id=?", [phase29Fixture.customerId]);
    await deleteByIds("order_price_snapshots", "order_id", [phase29Fixture.orderId]);
    await pool.query("DELETE FROM orders WHERE customer_id=?", [phase29Fixture.customerId]);
    await pool.query("DELETE FROM marketing_discount_decisions WHERE customer_id=?", [phase29Fixture.customerId]);
    await pool.query("DELETE FROM coupon_grants WHERE customer_id=?", [phase29Fixture.customerId]);
  }
  await deleteByIds("coupon_definitions", "coupon_definition_id", [phase29Fixture.definitionId]);
  if (phase29Fixture.campaignId) {
    await pool.query(
      "UPDATE marketing_campaigns SET active_rule_revision_id=NULL WHERE marketing_campaign_id=?",
      [phase29Fixture.campaignId],
    );
  }
  await deleteByIds("marketing_rule_revisions", "rule_revision_id", [phase29Fixture.ruleRevisionId]);
  await deleteByIds("marketing_campaigns", "marketing_campaign_id", [phase29Fixture.campaignId]);

  const actorIds = [
    phase29Fixture.creator.id,
    phase29Fixture.reviewer.id,
    phase29Fixture.publisher.id,
    phase29Fixture.traceOperator.id,
  ];
  await pool.query(
    `DELETE FROM admin_city_scopes WHERE admin_user_id IN (${actorIds.map(() => "?").join(",")})`,
    actorIds,
  );
  await pool.query(
    `DELETE FROM admin_users WHERE id IN (${actorIds.map(() => "?").join(",")})`,
    actorIds,
  );
  if (phase29Fixture.customerId) {
    await pool.query("DELETE FROM customers WHERE id=?", [phase29Fixture.customerId]);
  }

  const workerStateAfter = await snapshotWorkerState();
  if (workerStateAfter !== workerStateBefore) {
    throw new Error("Phase29 browser acceptance mutated Worker domain state");
  }
  const subscriptionStateAfter = await snapshotSubscriptions();
  if (subscriptionStateAfter !== subscriptionStateBefore) {
    throw new Error("Phase29 browser acceptance activated or changed Platform subscriptions");
  }
}

export async function findPhase29BrowserSku(): Promise<{ skuId: string; grossAmountMinor: number }> {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { sku_id: string; base_price: string | number })[]>(
    `SELECT s.sku_id,p.base_price
       FROM service_skus s
       INNER JOIN price_rules p ON p.city_code=s.city_code AND p.sku_id=s.sku_id
      WHERE s.city_code='hangzhou' AND s.is_enabled=1 AND p.is_enabled=1
        AND s.sku_id NOT LIKE 'demo%' AND p.base_price > 10.01
      ORDER BY s.sku_id LIMIT 1`,
  );
  const row = rows[0];
  if (!row) throw new Error("Phase29 browser acceptance requires one public Hangzhou SKU above CNY 10.01");
  const raw = String(row.base_price);
  const [yuan, fraction = ""] = raw.split(".");
  return { skuId: row.sku_id, grossAmountMinor: Number(yuan) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2)) };
}
