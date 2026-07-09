import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  createApprovedStatementSettlement,
  exportWorkerReceivableStatementOnce,
  getWorkerReceivableStatementExport,
  withSettlementTestLock,
} from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement export", { timeout: 60000 }, () => {
  it("exports approved statement and preserves settlement snapshots", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { statementId, payable, batch, queue, review } = await createApprovedStatementSettlement(app);
      const missingIdentity = await app.inject({
        method: "POST",
        url: `/api/internal/settlement/worker-statements/${statementId}/export-once`,
        headers: { "x-xlb-city-code": "hangzhou" },
        payload: {},
      });
      expect(missingIdentity.statusCode).toBe(401);

      const response = await exportWorkerReceivableStatementOnce(app, statementId);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        idempotent: false,
        export: {
          statementId,
          reviewId: review.reviewId,
          queueId: queue.queueId,
          settlementPayableId: payable.settlementPayableId,
          settlementBatchId: batch.settlementBatchId,
          cityCode: "hangzhou",
          exportFormat: "internal_v1",
          payloadVersion: "v1",
          exportedBy: "operator-hangzhou",
        },
      });
      expect(response.json().export.contentHash).toHaveLength(64);

      const detail = await getWorkerReceivableStatementExport(app, statementId);
      expect(detail.statusCode).toBe(200);
      expect(detail.json().export.exportId).toBe(response.json().export.exportId);

      const [statements] = await getMysqlPool().query<(RowDataPacket & { status: string })[]>(
        "SELECT status FROM worker_receivable_statements WHERE statement_id = ?",
        [statementId],
      );
      expect(statements[0]!.status).toBe("created");
      const [reviews] = await getMysqlPool().query<(RowDataPacket & { decision: string })[]>(
        "SELECT decision FROM worker_receivable_statement_reviews WHERE statement_id = ?",
        [statementId],
      );
      expect(reviews[0]!.decision).toBe("approved");
      const [outbox] = await getMysqlPool().query<(RowDataPacket & { event_id: string })[]>(
        "SELECT event_id FROM event_outbox WHERE event_type = 'worker.receivable.statement.exported' AND aggregate_id = ?",
        [response.json().export.exportId],
      );
      expect(outbox).toHaveLength(1);
    } finally { await app.close(); }
  }));
});
