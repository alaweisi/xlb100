import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { createLedgerAccrual, prepareSettlementOnce, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement prepare-once", { timeout: 60000 }, () => {
  it("creates a prepared batch and one item from a ledger accrual", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const source = await createLedgerAccrual(app);
      const response = await prepareSettlementOnce(app);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ok: true, processed: expect.any(Number), batch: { cityCode: "hangzhou", status: "prepared" } });
      const [items] = await getMysqlPool().query<RowDataPacket[]>("SELECT * FROM settlement_items WHERE accrual_id = ?", [source.accrualId]);
      expect(items).toHaveLength(1);
      expect(Number(items[0]!.gross_amount)).toBe(89);
    } finally { await app.close(); }
  }));
});
