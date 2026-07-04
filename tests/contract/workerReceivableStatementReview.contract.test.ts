import { describe, expect, it } from "vitest";
import {
  getWorkerReceivableStatementReviewResponseSchema,
  reviewWorkerReceivableStatementResponseSchema,
  workerReceivableStatementReviewSchema,
  workerReceivableStatementReviewedEventPayloadSchema,
} from "@xlb/validators";

describe("worker receivable statement review contract", () => {
  const now = new Date().toISOString();
  const review = {
    reviewId: "wrr-1",
    cityCode: "hangzhou",
    statementId: "wrs-1",
    queueId: "spq-1",
    settlementPayableId: "spy-1",
    settlementBatchId: "stb-1",
    workerId: "wrk-1",
    decision: "approved" as const,
    reviewNote: null,
    reviewedAt: now,
    reviewedBy: "operator-1",
    createdAt: now,
    updatedAt: now,
  };

  it("accepts review-once response", () => {
    expect(reviewWorkerReceivableStatementResponseSchema.parse({ ok: true, review, idempotent: false })).toBeTruthy();
    expect(reviewWorkerReceivableStatementResponseSchema.parse({ ok: true, review, idempotent: true })).toBeTruthy();
  });

  it("accepts get review response", () => {
    expect(getWorkerReceivableStatementReviewResponseSchema.parse({ ok: true, review })).toBeTruthy();
  });

  it("rejects payout-like fields on review schema", () => {
    expect(() => workerReceivableStatementReviewSchema.parse({ ...review, payoutId: "bad" })).toThrow();
    expect(() => workerReceivableStatementReviewSchema.parse({ ...review, paidAt: now })).toThrow();
  });
});

describe("worker.receivable.statement.reviewed event contract", () => {
  it("accepts valid payload without payout fields", () => {
    const payload = workerReceivableStatementReviewedEventPayloadSchema.parse({
      reviewId: "wrr-1",
      statementId: "wrs-1",
      queueId: "spq-1",
      payableId: "spy-1",
      batchId: "stb-1",
      cityCode: "hangzhou",
      workerId: "wrk-1",
      decision: "approved",
      reviewNote: null,
      reviewedAt: new Date().toISOString(),
      reviewedBy: "operator-1",
    });
    expect(payload).not.toHaveProperty("payoutId");
    expect(payload).not.toHaveProperty("provider");
    expect(payload).not.toHaveProperty("paymentInstruction");
  });
});
