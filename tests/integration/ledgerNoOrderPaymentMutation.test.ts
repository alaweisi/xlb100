import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { ensureHangzhouWorkerEligible } from "./helpers/acceptTestHelper.js";
import { createCompletedFulfillment, runLedgerOnce, withLedgerTestLock } from "./helpers/ledgerTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("ledger upstream immutability", { timeout: 60000 }, () => {
  it("leaves order, payment, and fulfillment states unchanged", () => withLedgerTestLock(async () => {
    await ensureHangzhouWorkerEligible(); const app = await buildApp();
    try {
      const ids = await createCompletedFulfillment(app); await runLedgerOnce(app);
      const [rows] = await getMysqlPool().query<(RowDataPacket & { order_status: string; payment_status: string; fulfillment_status: string })[]>("SELECT o.status AS order_status,p.status AS payment_status,f.status AS fulfillment_status FROM orders o JOIN payment_orders p ON p.payment_order_id=? JOIN fulfillments f ON f.fulfillment_id=? WHERE o.order_id=?", [ids.paymentOrderId, ids.fulfillmentId, ids.orderId]);
      expect(rows[0]).toMatchObject({ order_status: "paid", payment_status: "paid", fulfillment_status: "completed" });
    } finally { await app.close(); }
  }));
});
