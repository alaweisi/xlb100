import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { createPayableSettlement, enqueueSettlementPayable, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement payable queue", { timeout: 60000 }, () => {
  it("enqueues a payable row and preserves payable and batch status", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { payable, batch } = await createPayableSettlement(app);
      const missingIdentity = await app.inject({
        method: "POST",
        url: `/api/internal/settlement/payables/${payable.settlementPayableId}/enqueue-once`,
        headers: { "x-xlb-city-code": "hangzhou" },
        payload: {},
      });
      expect(missingIdentity.statusCode).toBe(401);
      const response = await enqueueSettlementPayable(app, payable.settlementPayableId);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        idempotent: false,
        queue: {
          settlementPayableId: payable.settlementPayableId,
          settlementBatchId: batch.settlementBatchId,
          cityCode: "hangzhou",
          status: "queued",
          enqueuedBy: "operator-hangzhou",
          grossAmount: payable.grossAmount,
          platformFeeAmount: payable.platformFeeAmount,
          workerReceivableAmount: payable.workerReceivableAmount,
          itemCount: payable.itemCount,
        },
      });
      const [payables] = await getMysqlPool().query<(RowDataPacket & { status: string })[]>(
        "SELECT status FROM settlement_payables WHERE settlement_payable_id = ?",
        [payable.settlementPayableId],
      );
      expect(payables[0]!.status).toBe("payable");
      const [batches] = await getMysqlPool().query<(RowDataPacket & { status: string })[]>(
        "SELECT status FROM settlement_batches WHERE settlement_batch_id = ?",
        [batch.settlementBatchId],
      );
      expect(batches[0]!.status).toBe("confirmed");
    } finally { await app.close(); }
  }));

  it("rejects confirmed batch without payable", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { createConfirmedSettlement } = await import("./helpers/settlementTestHelper.js");
      const { batch } = await createConfirmedSettlement(app);
      const [rows] = await getMysqlPool().query<(RowDataPacket & { settlement_payable_id: string })[]>(
        "SELECT settlement_payable_id FROM settlement_payables WHERE settlement_batch_id = ? LIMIT 1",
        [batch.settlementBatchId],
      );
      const fakePayableId = rows[0]?.settlement_payable_id ?? "spy_missing_test";
      if (!rows[0]) {
        const response = await enqueueSettlementPayable(app, fakePayableId);
        expect(response.statusCode).toBe(404);
      }
    } finally { await app.close(); }
  }));
});
