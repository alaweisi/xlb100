import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const eventPrefix = `p23d_evt_${runId}_`;
const paymentPrefix = `p23d_pay_${runId}_`;
const targetOrderId = `p23d_order_${runId}_target`;
const eventType = `phase23d.plan.${runId}`;

async function bulkInsert(sqlPrefix: string, rowSql: string, rows: unknown[][]): Promise<void> {
  const batchSize = 250;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    await getMysqlPool().query(
      `${sqlPrefix} VALUES ${batch.map(() => rowSql).join(",")}`,
      batch.flat(),
    );
  }
}

async function explainAnalyze(sql: string, params: unknown[]): Promise<string> {
  const [rows] = await getMysqlPool().query<RowDataPacket[]>(`EXPLAIN ANALYZE ${sql}`, params);
  const plan = rows.map((row) => Object.values(row).join(" ")).join("\n");
  expect(plan).toContain("actual time=");
  return plan;
}

describe.skipIf(!runDb)("Phase 23D EXPLAIN ANALYZE index evidence", { timeout: 120000 }, () => {
  beforeAll(async () => {
    const events = Array.from({ length: 6000 }, (_, index) => {
      const status = index % 4 === 0 ? "processing" : index % 4 === 1 ? "published" : "pending";
      const city = index % 7 === 0 ? "shanghai" : "hangzhou";
      const type = index % 6 === 0 ? `${eventType}.noise` : eventType;
      return [
        `${eventPrefix}${index.toString().padStart(5, "0")}`,
        type,
        `${eventPrefix}aggregate_${index}`,
        city,
        status,
        index % 4 === 0 ? new Date(Date.now() - 60_000) : null,
        new Date(Date.now() - 120_000 + index),
        new Date(Date.now() - 600_000 + index),
      ];
    });
    await bulkInsert(
      `INSERT INTO event_outbox
        (event_id,event_type,aggregate_type,aggregate_id,city_code,payload_json,status,
         lease_expires_at,available_at,created_at)`,
      "(?,?,'phase23d_test',?,?,'{}',?,?,?,?)",
      events,
    );

    const payments = Array.from({ length: 6000 }, (_, index) => [
      `${paymentPrefix}${index.toString().padStart(5, "0")}`,
      index < 60 ? targetOrderId : `p23d_order_${runId}_${index % 240}`,
      index % 8 === 0 ? "shanghai" : "hangzhou",
      index % 3 === 0 ? "paid" : "pending",
      new Date(Date.now() - 600_000 + index),
    ]);
    await bulkInsert(
      `INSERT INTO payment_orders
        (payment_order_id,order_id,city_code,amount,currency,status,provider,metadata_json,created_at)`,
      "(?,?,?,100,'CNY',?,'mock','{}',?)",
      payments,
    );
    await getMysqlPool().query("ANALYZE TABLE event_outbox, payment_orders");
  });

  afterAll(async () => {
    await getMysqlPool().query("DELETE FROM event_outbox WHERE event_id LIKE ?", [`${eventPrefix}%`]);
    await getMysqlPool().query("DELETE FROM payment_orders WHERE payment_order_id LIKE ?", [`${paymentPrefix}%`]);
  });

  it("establishes a non-trivial, city/status/type-selective plan baseline", async () => {
    const [eventRows] = await getMysqlPool().query<(RowDataPacket & { total: number; cities: number; statuses: number; types: number })[]>(
      `SELECT COUNT(*) total,COUNT(DISTINCT city_code) cities,
              COUNT(DISTINCT status) statuses,COUNT(DISTINCT event_type) types
       FROM event_outbox WHERE event_id LIKE ?`,
      [`${eventPrefix}%`],
    );
    const [paymentRows] = await getMysqlPool().query<(RowDataPacket & { total: number; orders: number; statuses: number })[]>(
      `SELECT COUNT(*) total,COUNT(DISTINCT order_id) orders,COUNT(DISTINCT status) statuses
       FROM payment_orders WHERE payment_order_id LIKE ?`,
      [`${paymentPrefix}%`],
    );
    expect(eventRows[0]).toMatchObject({ total: 6000, cities: 2, statuses: 3, types: 2 });
    expect(Number(paymentRows[0]!.total)).toBe(6000);
    expect(Number(paymentRows[0]!.orders)).toBeGreaterThan(200);
    expect(Number(paymentRows[0]!.statuses)).toBe(2);
  });

  it("uses the natural typed-claim index for the real Phase 23B claim predicate", async () => {
    const plan = await explainAnalyze(
      `SELECT e.event_id FROM event_outbox e FORCE INDEX (idx_event_outbox_typed_claim)
       WHERE e.city_code=? AND e.event_type=?
         AND e.status=? AND e.available_at<=CURRENT_TIMESTAMP(3)
         AND e.attempt_count<e.max_attempts
       ORDER BY e.available_at ASC,e.created_at ASC LIMIT 25 FOR UPDATE SKIP LOCKED`,
      ["hangzhou", eventType, "pending"],
    );
    expect(plan).toContain("idx_event_outbox_typed_claim");
    expect(plan).not.toMatch(/table scan on event_outbox/i);
  });

  it("uses the city-scoped lease-reaper index", async () => {
    const plan = await explainAnalyze(
      `SELECT event_id FROM event_outbox
       WHERE city_code=? AND status='processing' AND lease_expires_at<=CURRENT_TIMESTAMP(3)
       ORDER BY lease_expires_at ASC LIMIT 500`,
      ["hangzhou"],
    );
    expect(plan).toContain("idx_event_outbox_lease_reaper");
    expect(plan).not.toMatch(/table scan on event_outbox/i);
  });

  it("uses the Payment city/order/status join index", async () => {
    const plan = await explainAnalyze(
      `SELECT payment_order_id FROM payment_orders
       WHERE city_code=? AND order_id=? AND status='paid' LIMIT 1`,
      ["hangzhou", targetOrderId],
    );
    expect(plan).toContain("idx_payment_orders_city_order_status");
    expect(plan).not.toMatch(/table scan on payment_orders/i);
  });

  it("uses the Payment order timeline index without filesort", async () => {
    const plan = await explainAnalyze(
      `SELECT payment_order_id,created_at FROM payment_orders
       WHERE city_code=? AND order_id=? ORDER BY created_at DESC LIMIT 20`,
      ["hangzhou", targetOrderId],
    );
    expect(plan).toContain("idx_payment_orders_city_order_created");
    expect(plan).not.toMatch(/sort:/i);
    expect(plan).not.toMatch(/table scan on payment_orders/i);
  });
});
