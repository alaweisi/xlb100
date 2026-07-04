import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { createConfirmedSettlement, markSettlementPayable, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement payable readiness", { timeout: 60000 }, () => {
  it("marks a confirmed batch payable and preserves batch status", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { batch } = await createConfirmedSettlement(app);
      const missingIdentity = await app.inject({
        method: "POST",
        url: `/api/internal/settlement/batches/${batch.settlementBatchId}/mark-payable`,
        headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator", "x-xlb-city-code": "hangzhou" },
        payload: {},
      });
      expect(missingIdentity.statusCode).toBe(403);
      const response = await markSettlementPayable(app, batch.settlementBatchId);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        idempotent: false,
        payable: {
          settlementBatchId: batch.settlementBatchId,
          cityCode: "hangzhou",
          status: "payable",
          markedBy: "operator-hangzhou",
          grossAmount: batch.totalGrossAmount,
          platformFeeAmount: batch.totalPlatformFee,
          workerReceivableAmount: batch.totalWorkerReceivable,
          itemCount: batch.itemCount,
        },
      });
      const [batches] = await getMysqlPool().query<(RowDataPacket & { status: string })[]>(
        "SELECT status FROM settlement_batches WHERE settlement_batch_id = ?",
        [batch.settlementBatchId],
      );
      expect(batches[0]!.status).toBe("confirmed");
      const [payables] = await getMysqlPool().query<RowDataPacket[]>(
        "SELECT settlement_payable_id FROM settlement_payables WHERE settlement_batch_id = ?",
        [batch.settlementBatchId],
      );
      expect(payables).toHaveLength(1);
    } finally { await app.close(); }
  }));

  it("rejects prepared batches", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { createPreparedSettlement } = await import("./helpers/settlementTestHelper.js");
      const { batch } = await createPreparedSettlement(app);
      const response = await markSettlementPayable(app, batch.settlementBatchId);
      expect(response.statusCode).toBe(409);
    } finally { await app.close(); }
  }));
});
