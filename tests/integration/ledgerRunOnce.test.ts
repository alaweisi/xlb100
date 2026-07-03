import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { ensureHangzhouWorkerEligible } from "./helpers/acceptTestHelper.js";
import { createCompletedFulfillment, runLedgerOnce, withLedgerTestLock } from "./helpers/ledgerTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("ledger run-once", { timeout: 60000 }, () => {
  it("processes a pending completed fulfillment", () => withLedgerTestLock(async () => {
    await ensureHangzhouWorkerEligible(); const app = await buildApp();
    try {
      const { fulfillmentId } = await createCompletedFulfillment(app);
      const response = await runLedgerOnce(app);
      expect(response.statusCode).toBe(200); expect(response.json().processed).toBeGreaterThanOrEqual(1);
      const [rows] = await getMysqlPool().query<RowDataPacket[]>("SELECT accrual_id FROM ledger_accruals WHERE fulfillment_id = ?", [fulfillmentId]);
      expect(rows).toHaveLength(1);
    } finally { await app.close(); }
  }));
});
