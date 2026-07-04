import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { createPayableSettlement, enqueueSettlementPayable, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement payable queue idempotency", { timeout: 60000 }, () => {
  it("returns idempotent and writes exactly one queued event", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { payable } = await createPayableSettlement(app);
      const first = (await enqueueSettlementPayable(app, payable.settlementPayableId)).json();
      expect(first.idempotent).toBe(false);
      const second = (await enqueueSettlementPayable(app, payable.settlementPayableId)).json();
      expect(second).toMatchObject({ idempotent: true, queue: { status: "queued" } });
      expect(second.queue.enqueuedAt).toBe(first.queue.enqueuedAt);
      expect(second.queue.enqueuedBy).toBe(first.queue.enqueuedBy);
      const [events] = await getMysqlPool().query<RowDataPacket[]>(
        "SELECT event_id FROM event_outbox WHERE event_type = 'settlement.payable.queued' AND aggregate_id = ? AND city_code = 'hangzhou'",
        [first.queue.queueId],
      );
      expect(events).toHaveLength(1);
      const [queues] = await getMysqlPool().query<RowDataPacket[]>(
        "SELECT queue_id FROM settlement_payable_queue WHERE settlement_payable_id = ?",
        [payable.settlementPayableId],
      );
      expect(queues).toHaveLength(1);
    } finally { await app.close(); }
  }));
});
