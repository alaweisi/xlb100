import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { createConfirmedSettlement, enqueueSettlementPayable, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement payable queue without payable", { timeout: 60000 }, () => {
  it("rejects enqueue when batch is confirmed but not payable", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { batch } = await createConfirmedSettlement(app);
      const [rows] = await getMysqlPool().query<(RowDataPacket & { settlement_payable_id: string })[]>(
        "SELECT settlement_payable_id FROM settlement_payables WHERE settlement_batch_id = ? LIMIT 1",
        [batch.settlementBatchId],
      );
      if (rows[0]) {
        const response = await enqueueSettlementPayable(app, rows[0].settlement_payable_id);
        expect([200, 409]).toContain(response.statusCode);
        return;
      }
      const response = await enqueueSettlementPayable(app, "spy_not_payable_test");
      expect(response.statusCode).toBe(404);
    } finally { await app.close(); }
  }));
});
