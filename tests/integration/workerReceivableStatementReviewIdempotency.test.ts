import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  createStatementReadySettlement,
  getWorkerReceivableStatementReview,
  reviewWorkerReceivableStatementOnce,
  settlementHeaders,
  withSettlementTestLock,
} from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement review idempotency", { timeout: 60000 }, () => {
  it("does not duplicate review or outbox on repeat", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { statementId } = await createStatementReadySettlement(app);
      const first = await reviewWorkerReceivableStatementOnce(app, statementId, { decision: "approved", reviewNote: "ok" });
      expect(first.statusCode).toBe(200);
      const reviewId = first.json().review.reviewId as string;
      const reviewedAt = first.json().review.reviewedAt as string;
      const reviewedBy = first.json().review.reviewedBy as string;

      const second = await reviewWorkerReceivableStatementOnce(app, statementId, { decision: "approved", reviewNote: "changed" });
      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({ idempotent: true, review: { reviewId, reviewedAt, reviewedBy, reviewNote: "ok" } });

      const [reviews] = await getMysqlPool().query<(RowDataPacket & { review_id: string })[]>(
        "SELECT review_id FROM worker_receivable_statement_reviews WHERE statement_id = ?",
        [statementId],
      );
      expect(reviews).toHaveLength(1);
      const [outbox] = await getMysqlPool().query<(RowDataPacket & { event_id: string })[]>(
        "SELECT event_id FROM event_outbox WHERE event_type = 'worker.receivable.statement.reviewed' AND aggregate_id = ?",
        [reviewId],
      );
      expect(outbox).toHaveLength(1);
    } finally { await app.close(); }
  }));

  it("returns conflict for different decision", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { statementId } = await createStatementReadySettlement(app);
      await reviewWorkerReceivableStatementOnce(app, statementId, { decision: "approved" });
      const conflict = await reviewWorkerReceivableStatementOnce(app, statementId, { decision: "rejected" });
      expect(conflict.statusCode).toBe(409);
    } finally { await app.close(); }
  }));
});

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement review city scoped", { timeout: 60000 }, () => {
  it("returns 404 for cross-city review", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { statementId } = await createStatementReadySettlement(app);
      const crossReview = await reviewWorkerReceivableStatementOnce(app, statementId, { decision: "approved" }, "shanghai");
      expect(crossReview.statusCode).toBe(404);
      const crossGet = await getWorkerReceivableStatementReview(app, statementId, "shanghai");
      expect(crossGet.statusCode).toBe(404);
    } finally { await app.close(); }
  }));
});

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement review rejected flow", { timeout: 60000 }, () => {
  it("records rejected decision", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { statementId } = await createStatementReadySettlement(app);
      const response = await reviewWorkerReceivableStatementOnce(app, statementId, { decision: "rejected", reviewNote: "mismatch" });
      expect(response.statusCode).toBe(200);
      expect(response.json().review.decision).toBe("rejected");
    } finally { await app.close(); }
  }));
});

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement review validation", { timeout: 60000 }, () => {
  it("rejects invalid decision", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { statementId } = await createStatementReadySettlement(app);
      const response = await app.inject({
        method: "POST",
        url: `/api/internal/settlement/worker-statements/${statementId}/review-once`,
        headers: settlementHeaders("hangzhou"),
        payload: { decision: "paid" },
      });
      expect(response.statusCode).toBe(400);
    } finally { await app.close(); }
  }));

  it("returns 404 for missing statement", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const response = await reviewWorkerReceivableStatementOnce(app, "wrs_missing", { decision: "approved" });
      expect(response.statusCode).toBe(404);
    } finally { await app.close(); }
  }));
});
