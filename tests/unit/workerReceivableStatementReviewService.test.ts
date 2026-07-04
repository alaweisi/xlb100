import type {
  RequestContext,
  SettlementBatch,
  SettlementPayable,
  SettlementPayableQueue,
  WorkerReceivableStatement,
  WorkerReceivableStatementReview,
} from "@xlb/types";
import type { PoolConnection } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import {
  WorkerReceivableStatementReviewNotFoundError,
  WorkerReceivableStatementReviewError,
  WorkerReceivableStatementReviewService,
} from "../../backend/src/settlement/workerReceivableStatementReviewService.js";
import type { SettlementRepository } from "../../backend/src/settlement/settlementRepository.js";
import type { WorkerReceivableStatementRepository } from "../../backend/src/settlement/workerReceivableStatementRepository.js";
import type { WorkerReceivableStatementReviewRepository } from "../../backend/src/settlement/workerReceivableStatementReviewRepository.js";
import type { EventOutboxRepository } from "../../backend/src/events/eventOutbox.js";

const now = new Date().toISOString();
const context: RequestContext = { traceId: "trace", appType: "admin", role: "operator", cityCode: "hangzhou", userId: "operator-1", requestStartedAt: now };
const statement: WorkerReceivableStatement = {
  statementId: "wrs-1", cityCode: "hangzhou", queueId: "spq-1", settlementPayableId: "spy-1",
  settlementBatchId: "stb-1", workerId: "wrk-1", currency: "CNY", grossAmount: 89,
  platformFeeAmount: 8.9, workerReceivableAmount: 80.1, itemCount: 1, status: "created",
  generatedAt: now, generatedBy: "operator-1", createdAt: now, updatedAt: now,
};
const payable: SettlementPayable = {
  settlementPayableId: "spy-1", cityCode: "hangzhou", settlementBatchId: "stb-1", currency: "CNY",
  grossAmount: 89, platformFeeAmount: 8.9, workerReceivableAmount: 80.1, itemCount: 1,
  status: "payable", markedAt: now, markedBy: "operator-1", createdAt: now, updatedAt: now,
};
const batch: SettlementBatch = {
  settlementBatchId: "stb-1", cityCode: "hangzhou", currency: "CNY", totalGrossAmount: 89,
  totalPlatformFee: 8.9, totalWorkerReceivable: 80.1, itemCount: 1, status: "confirmed",
  preparedAt: now, confirmedAt: now, confirmedBy: "operator-1", createdAt: now, updatedAt: now,
};
const queue: SettlementPayableQueue = {
  queueId: "spq-1", cityCode: "hangzhou", settlementPayableId: "spy-1", settlementBatchId: "stb-1",
  currency: "CNY", grossAmount: 89, platformFeeAmount: 8.9, workerReceivableAmount: 80.1, itemCount: 1,
  status: "queued", enqueuedAt: now, enqueuedBy: "operator-1", createdAt: now, updatedAt: now,
};
const review: WorkerReceivableStatementReview = {
  reviewId: "wrr-1", cityCode: "hangzhou", statementId: "wrs-1", queueId: "spq-1",
  settlementPayableId: "spy-1", settlementBatchId: "stb-1", workerId: "wrk-1",
  decision: "approved", reviewNote: null, reviewedAt: now, reviewedBy: "operator-1",
  createdAt: now, updatedAt: now,
};
const transaction = async <T>(callback: (connection: PoolConnection) => Promise<T>) => callback({} as PoolConnection);

describe("workerReceivableStatementReviewService", () => {
  it("reviews created statement as approved", async () => {
    const settlementRepo = {
      findPayableByIdForEnqueue: vi.fn().mockResolvedValue(payable),
      findQueueForPayable: vi.fn().mockResolvedValue(queue),
      findBatchForUpdate: vi.fn().mockResolvedValue(batch),
    };
    const statementRepo = { getStatementById: vi.fn().mockResolvedValue(statement) };
    const reviewRepo = {
      findStatementForReview: vi.fn().mockResolvedValue(statement),
      findReviewByStatement: vi.fn().mockResolvedValue(null),
      insertReview: vi.fn(),
    };
    const outbox = { insertEvent: vi.fn() };
    const service = new WorkerReceivableStatementReviewService(
      settlementRepo as unknown as SettlementRepository,
      statementRepo as unknown as WorkerReceivableStatementRepository,
      reviewRepo as unknown as WorkerReceivableStatementReviewRepository,
      outbox as unknown as EventOutboxRepository,
      transaction,
    );
    const result = await service.reviewWorkerReceivableStatementOnce(context, "wrs-1", { decision: "approved" });
    expect(result.idempotent).toBe(false);
    expect(result.review.decision).toBe("approved");
    expect(result.review.reviewedBy).toBe("operator-1");
    expect(reviewRepo.insertReview).toHaveBeenCalledOnce();
    expect(outbox.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "worker.receivable.statement.reviewed",
    }));
  });

  it("reviews created statement as rejected", async () => {
    const settlementRepo = {
      findPayableByIdForEnqueue: vi.fn().mockResolvedValue(payable),
      findQueueForPayable: vi.fn().mockResolvedValue(queue),
      findBatchForUpdate: vi.fn().mockResolvedValue(batch),
    };
    const reviewRepo = {
      findStatementForReview: vi.fn().mockResolvedValue(statement),
      findReviewByStatement: vi.fn().mockResolvedValue(null),
      insertReview: vi.fn(),
    };
    const service = new WorkerReceivableStatementReviewService(
      settlementRepo as unknown as SettlementRepository,
      { getStatementById: vi.fn().mockResolvedValue(statement) } as unknown as WorkerReceivableStatementRepository,
      reviewRepo as unknown as WorkerReceivableStatementReviewRepository,
      { insertEvent: vi.fn() } as unknown as EventOutboxRepository,
      transaction,
    );
    const result = await service.reviewWorkerReceivableStatementOnce(context, "wrs-1", { decision: "rejected", reviewNote: "bad data" });
    expect(result.review.decision).toBe("rejected");
    expect(result.review.reviewNote).toBe("bad data");
  });

  it("returns existing review idempotently for same decision", async () => {
    const reviewRepo = {
      findStatementForReview: vi.fn().mockResolvedValue(statement),
      findReviewByStatement: vi.fn().mockResolvedValue(review),
    };
    const service = new WorkerReceivableStatementReviewService(
      {} as SettlementRepository,
      { getStatementById: vi.fn().mockResolvedValue(statement) } as unknown as WorkerReceivableStatementRepository,
      reviewRepo as unknown as WorkerReceivableStatementReviewRepository,
      { insertEvent: vi.fn() } as unknown as EventOutboxRepository,
      transaction,
    );
    await expect(service.reviewWorkerReceivableStatementOnce(context, "wrs-1", { decision: "approved" })).resolves.toEqual({
      review,
      idempotent: true,
    });
  });

  it("rejects conflicting decision", async () => {
    const reviewRepo = {
      findStatementForReview: vi.fn().mockResolvedValue(statement),
      findReviewByStatement: vi.fn().mockResolvedValue(review),
    };
    const service = new WorkerReceivableStatementReviewService(
      {} as SettlementRepository,
      { getStatementById: vi.fn().mockResolvedValue(statement) } as unknown as WorkerReceivableStatementRepository,
      reviewRepo as unknown as WorkerReceivableStatementReviewRepository,
      { insertEvent: vi.fn() } as unknown as EventOutboxRepository,
      transaction,
    );
    await expect(service.reviewWorkerReceivableStatementOnce(context, "wrs-1", { decision: "rejected" }))
      .rejects.toBeInstanceOf(WorkerReceivableStatementReviewError);
  });

  it("rejects missing statements", async () => {
    const reviewRepo = { findStatementForReview: vi.fn().mockResolvedValue(null) };
    const service = new WorkerReceivableStatementReviewService(
      {} as SettlementRepository,
      { getStatementById: vi.fn().mockResolvedValue(null) } as unknown as WorkerReceivableStatementRepository,
      reviewRepo as unknown as WorkerReceivableStatementReviewRepository,
      { insertEvent: vi.fn() } as unknown as EventOutboxRepository,
      transaction,
    );
    await expect(service.reviewWorkerReceivableStatementOnce(context, "missing", { decision: "approved" }))
      .rejects.toBeInstanceOf(WorkerReceivableStatementReviewNotFoundError);
  });
});
