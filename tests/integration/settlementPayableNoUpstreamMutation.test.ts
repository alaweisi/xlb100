import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { createConfirmedSettlement, markSettlementPayable, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement payable upstream immutability", { timeout: 60000 }, () => {
  it("does not mutate orders, payments, fulfillments, accruals, or ledger entries", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { source, batch } = await createConfirmedSettlement(app);
      const pool = getMysqlPool();
      const snapshot = async () => {
        const [rows] = await pool.query<(RowDataPacket & { order_status: string; payment_status: string; fulfillment_status: string; accrual_status: string; entry_count: number })[]>(
          `SELECT o.status order_status, p.status payment_status, f.status fulfillment_status, la.status accrual_status,
                  (SELECT COUNT(*) FROM ledger_entries le WHERE le.source_id=f.fulfillment_id AND le.city_code=f.city_code) entry_count
           FROM ledger_accruals la JOIN fulfillments f ON f.fulfillment_id=la.fulfillment_id AND f.city_code=la.city_code
           JOIN orders o ON o.order_id=la.order_id AND o.city_code=la.city_code
           JOIN payment_orders p ON p.payment_order_id=la.payment_order_id AND p.city_code=la.city_code WHERE la.accrual_id=?`,
          [source.accrualId],
        );
        return { ...rows[0], entry_count: Number(rows[0]!.entry_count) };
      };
      const [beforeItems] = await pool.query<(RowDataPacket & { gross_amount: string; platform_fee: string; worker_receivable: string })[]>(
        "SELECT gross_amount,platform_fee,worker_receivable FROM settlement_items WHERE settlement_batch_id=? ORDER BY settlement_item_id",
        [batch.settlementBatchId],
      );
      const before = await snapshot();
      expect(await markSettlementPayable(app, batch.settlementBatchId)).toMatchObject({ statusCode: 200 });
      const [afterItems] = await pool.query<(RowDataPacket & { gross_amount: string; platform_fee: string; worker_receivable: string })[]>(
        "SELECT gross_amount,platform_fee,worker_receivable FROM settlement_items WHERE settlement_batch_id=? ORDER BY settlement_item_id",
        [batch.settlementBatchId],
      );
      expect(afterItems).toEqual(beforeItems);
      expect(await snapshot()).toEqual(before);
      expect(before).toMatchObject({ order_status: "paid", payment_status: "paid", fulfillment_status: "completed", accrual_status: "accrued", entry_count: 3 });
    } finally { await app.close(); }
  }));
});
