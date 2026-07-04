import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { ensureHangzhouWorkerEligible } from "./helpers/acceptTestHelper.js";
import { createCompletedFulfillment, runLedgerOnce, withLedgerTestLock } from "./helpers/ledgerTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("fulfillment.completed to ledger", { timeout: 60000 }, () => {
  it("creates the accrual, three entries, and publishes the event", () => withLedgerTestLock(async () => {
    await ensureHangzhouWorkerEligible(); const app = await buildApp();
    try {
      const { fulfillmentId } = await createCompletedFulfillment(app); await runLedgerOnce(app);
      const [accruals] = await getMysqlPool().query<(RowDataPacket & { gross_amount: string; platform_fee: string; worker_receivable: string; currency: string; status: string; source_event_id: string })[]>("SELECT gross_amount,platform_fee,worker_receivable,currency,status,source_event_id FROM ledger_accruals WHERE fulfillment_id = ?", [fulfillmentId]);
      expect(accruals[0]).toMatchObject({ gross_amount: "89.00", platform_fee: "8.90", worker_receivable: "80.10", currency: "CNY", status: "accrued" });
      const [entries] = await getMysqlPool().query<RowDataPacket[]>("SELECT account_type,direction,amount FROM ledger_entries WHERE source_type='fulfillment.completed' AND source_id=?", [fulfillmentId]);
      expect(entries).toHaveLength(3);
      const [events] = await getMysqlPool().query<(RowDataPacket & { status: string; published_at: Date | null })[]>("SELECT status,published_at FROM event_outbox WHERE event_id=?", [accruals[0]!.source_event_id]);
      expect(events[0]!.status).toBe("published"); expect(events[0]!.published_at).toBeTruthy();
    } finally { await app.close(); }
  }));
});
