import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { createLedgerAccrual, prepareSettlementOnce, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement idempotency", { timeout: 60000 }, () => {
  it("never creates a second item for the same accrual", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const source = await createLedgerAccrual(app);
      expect((await prepareSettlementOnce(app)).json().processed).toBeGreaterThanOrEqual(1);
      expect((await prepareSettlementOnce(app)).json()).toMatchObject({ processed: 0, batch: null });
      const [rows] = await getMysqlPool().query<RowDataPacket[]>("SELECT settlement_item_id FROM settlement_items WHERE accrual_id = ?", [source.accrualId]);
      expect(rows).toHaveLength(1);
    } finally { await app.close(); }
  }));
});
