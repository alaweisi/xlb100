import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  createQueuedSettlement,
  generateWorkerReceivableStatements,
  withSettlementTestLock,
} from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement no upstream mutation", { timeout: 60000 }, () => {
  it("does not mutate upstream or settlement snapshot tables", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { source, payable, batch } = await createQueuedSettlement(app);
      await generateWorkerReceivableStatements(app, payable.settlementPayableId);

      const pool = getMysqlPool();
      const [orders] = await pool.query<(RowDataPacket & { status: string })[]>(
        "SELECT status FROM orders WHERE order_id = ?", [source.orderId],
      );
      expect(orders[0]!.status).toBe("paid");
      const [payments] = await pool.query<(RowDataPacket & { status: string })[]>(
        "SELECT status FROM payment_orders WHERE payment_order_id = ?", [source.paymentOrderId],
      );
      expect(payments[0]!.status).toBe("paid");
      const [fulfillments] = await pool.query<(RowDataPacket & { status: string })[]>(
        "SELECT status FROM fulfillments WHERE fulfillment_id = ?", [source.fulfillmentId],
      );
      expect(fulfillments[0]!.status).toBe("completed");
      const [accruals] = await pool.query<(RowDataPacket & { status: string })[]>(
        "SELECT status FROM ledger_accruals WHERE accrual_id = ?", [source.accrualId],
      );
      expect(accruals[0]!.status).toBe("accrued");
      const [entries] = await pool.query<RowDataPacket[]>(
        "SELECT entry_id FROM ledger_entries WHERE source_type = 'fulfillment.completed' AND source_id = ?",
        [source.fulfillmentId],
      );
      expect(entries).toHaveLength(3);
      const [items] = await pool.query<(RowDataPacket & { gross_amount: string; platform_fee: string; worker_receivable: string })[]>(
        "SELECT gross_amount, platform_fee, worker_receivable FROM settlement_items WHERE settlement_batch_id = ?",
        [batch.settlementBatchId],
      );
      expect(Number(items[0]!.gross_amount)).toBe(89);
      expect(Number(items[0]!.platform_fee)).toBe(8.9);
      expect(Number(items[0]!.worker_receivable)).toBe(80.1);
    } finally { await app.close(); }
  }));
});
