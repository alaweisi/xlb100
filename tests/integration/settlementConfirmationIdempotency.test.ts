import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { confirmSettlementBatch, createPreparedSettlement, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement confirmation idempotency", { timeout: 60000 }, () => {
  it("returns idempotent and writes exactly one confirmed event", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { batch } = await createPreparedSettlement(app);
      const first = (await confirmSettlementBatch(app, batch.settlementBatchId)).json();
      expect(first.idempotent).toBe(false);
      const second = (await confirmSettlementBatch(app, batch.settlementBatchId)).json();
      expect(second).toMatchObject({ idempotent: true, batch: { status: "confirmed" } });
      expect(second.batch.confirmedAt).toBe(first.batch.confirmedAt);
      expect(second.batch.confirmedBy).toBe(first.batch.confirmedBy);
      expect(new Date(first.batch.confirmedAt).getTime()).toBeGreaterThanOrEqual(new Date(first.batch.preparedAt).getTime());
      const [events] = await getMysqlPool().query<RowDataPacket[]>("SELECT event_id FROM event_outbox WHERE event_type = 'settlement.confirmed' AND aggregate_id = ? AND city_code = 'hangzhou'", [batch.settlementBatchId]);
      expect(events).toHaveLength(1);
      const [prepared] = await getMysqlPool().query<(RowDataPacket & { status: string })[]>("SELECT status FROM event_outbox WHERE event_type = 'settlement.prepared' AND aggregate_id = ?", [batch.settlementBatchId]);
      expect(prepared[0]!.status).toBe("pending");
    } finally { await app.close(); }
  }));
});
