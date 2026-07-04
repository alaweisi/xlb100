import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { ensureHangzhouWorkerEligible } from "./helpers/acceptTestHelper.js";
import { createCompletedFulfillment, runLedgerOnce, withLedgerTestLock } from "./helpers/ledgerTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("ledger idempotency", { timeout: 60000 }, () => {
  it("does not duplicate accruals or entries on retry", () => withLedgerTestLock(async () => {
    await ensureHangzhouWorkerEligible(); const app = await buildApp();
    try {
      const { fulfillmentId } = await createCompletedFulfillment(app); await runLedgerOnce(app); await runLedgerOnce(app);
      const [accruals] = await getMysqlPool().query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) AS count FROM ledger_accruals WHERE fulfillment_id=?", [fulfillmentId]);
      const [entries] = await getMysqlPool().query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) AS count FROM ledger_entries WHERE source_id=?", [fulfillmentId]);
      expect(Number(accruals[0]!.count)).toBe(1); expect(Number(entries[0]!.count)).toBe(3);
    } finally { await app.close(); }
  }));
});
