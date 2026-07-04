import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  createStatementReadySettlement,
  getWorkerReceivableStatementReview,
  reviewWorkerReceivableStatementOnce,
  withSettlementTestLock,
} from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement review", { timeout: 60000 }, () => {
  it("reviews statement and preserves settlement snapshots", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { statementId, payable, batch, queue } = await createStatementReadySettlement(app);
      const missingIdentity = await app.inject({
        method: "POST",
        url: `/api/internal/settlement/worker-statements/${statementId}/review-once`,
        headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator", "x-xlb-city-code": "hangzhou" },
        payload: { decision: "approved" },
      });
      expect(missingIdentity.statusCode).toBe(403);

      const response = await reviewWorkerReceivableStatementOnce(app, statementId, { decision: "approved" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        idempotent: false,
        review: {
          statementId,
          queueId: queue.queueId,
          settlementPayableId: payable.settlementPayableId,
          settlementBatchId: batch.settlementBatchId,
          cityCode: "hangzhou",
          decision: "approved",
          reviewedBy: "operator-hangzhou",
        },
      });

      const detail = await getWorkerReceivableStatementReview(app, statementId);
      expect(detail.statusCode).toBe(200);
      expect(detail.json().review.reviewId).toBe(response.json().review.reviewId);

      const [statements] = await getMysqlPool().query<(RowDataPacket & { status: string })[]>(
        "SELECT status FROM worker_receivable_statements WHERE statement_id = ?",
        [statementId],
      );
      expect(statements[0]!.status).toBe("created");
      const [queues] = await getMysqlPool().query<(RowDataPacket & { status: string })[]>(
        "SELECT status FROM settlement_payable_queue WHERE queue_id = ?",
        [queue.queueId],
      );
      expect(queues[0]!.status).toBe("queued");
      const [outbox] = await getMysqlPool().query<(RowDataPacket & { event_id: string })[]>(
        "SELECT event_id FROM event_outbox WHERE event_type = 'worker.receivable.statement.reviewed' AND aggregate_id = ?",
        [response.json().review.reviewId],
      );
      expect(outbox).toHaveLength(1);
    } finally { await app.close(); }
  }));
});
