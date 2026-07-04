import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { createConfirmedSettlement, markSettlementPayable, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement payable idempotency", { timeout: 60000 }, () => {
  it("returns idempotent and writes exactly one payable event", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { batch } = await createConfirmedSettlement(app);
      const first = (await markSettlementPayable(app, batch.settlementBatchId)).json();
      expect(first.idempotent).toBe(false);
      const second = (await markSettlementPayable(app, batch.settlementBatchId)).json();
      expect(second).toMatchObject({ idempotent: true, payable: { status: "payable" } });
      expect(second.payable.markedAt).toBe(first.payable.markedAt);
      expect(second.payable.markedBy).toBe(first.payable.markedBy);
      const [events] = await getMysqlPool().query<RowDataPacket[]>(
        "SELECT event_id FROM event_outbox WHERE event_type = 'settlement.payable' AND aggregate_id = ? AND city_code = 'hangzhou'",
        [first.payable.settlementPayableId],
      );
      expect(events).toHaveLength(1);
      const [payables] = await getMysqlPool().query<RowDataPacket[]>(
        "SELECT settlement_payable_id FROM settlement_payables WHERE settlement_batch_id = ?",
        [batch.settlementBatchId],
      );
      expect(payables).toHaveLength(1);
    } finally { await app.close(); }
  }));
});
