import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  createQueuedSettlement,
  generateWorkerReceivableStatements,
  getWorkerReceivableStatement,
  listWorkerReceivableStatements,
  withSettlementTestLock,
} from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement", { timeout: 60000 }, () => {
  it("generates worker statements and preserves settlement snapshots", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { payable, batch, queue } = await createQueuedSettlement(app);
      const missingIdentity = await app.inject({
        method: "POST",
        url: `/api/internal/settlement/payables/${payable.settlementPayableId}/generate-worker-statements-once`,
        headers: { "x-xlb-city-code": "hangzhou" },
        payload: {},
      });
      expect(missingIdentity.statusCode).toBe(401);

      const response = await generateWorkerReceivableStatements(app, payable.settlementPayableId);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        idempotent: false,
        statements: [{
          settlementPayableId: payable.settlementPayableId,
          settlementBatchId: batch.settlementBatchId,
          queueId: queue.queueId,
          cityCode: "hangzhou",
          status: "created",
          generatedBy: "operator-hangzhou",
          grossAmount: payable.grossAmount,
          platformFeeAmount: payable.platformFeeAmount,
          workerReceivableAmount: payable.workerReceivableAmount,
          itemCount: payable.itemCount,
        }],
      });

      const statementId = response.json().statements[0].statementId as string;
      const detail = await getWorkerReceivableStatement(app, statementId);
      expect(detail.statusCode).toBe(200);
      expect(detail.json().lines).toHaveLength(payable.itemCount);

      const [queues] = await getMysqlPool().query<(RowDataPacket & { status: string })[]>(
        "SELECT status FROM settlement_payable_queue WHERE queue_id = ?",
        [queue.queueId],
      );
      expect(queues[0]!.status).toBe("queued");
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

      const [outbox] = await getMysqlPool().query<(RowDataPacket & { event_id: string })[]>(
        "SELECT event_id FROM event_outbox WHERE event_type = 'worker.receivable.statement.created' AND aggregate_id = ?",
        [statementId],
      );
      expect(outbox).toHaveLength(1);
    } finally { await app.close(); }
  }));
});
