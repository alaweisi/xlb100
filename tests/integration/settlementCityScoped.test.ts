import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { createLedgerAccrual, prepareSettlementOnce, settlementHeaders, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement city scope", { timeout: 60000 }, () => {
  it("does not consume another city's accrual or expose its batch", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const source = await createLedgerAccrual(app);
      const shanghai = await prepareSettlementOnce(app, "shanghai");
      expect(shanghai.statusCode).toBe(200);
      const [before] = await getMysqlPool().query<RowDataPacket[]>("SELECT settlement_item_id FROM settlement_items WHERE accrual_id = ?", [source.accrualId]);
      expect(before).toHaveLength(0);
      const hangzhou = await prepareSettlementOnce(app);
      const batchId = hangzhou.json().batch.settlementBatchId;
      const crossCity = await app.inject({ method: "GET", url: `/api/internal/settlement/batches/${batchId}/items`, headers: settlementHeaders("shanghai") });
      expect(crossCity.statusCode).toBe(404);
    } finally { await app.close(); }
  }));
});
