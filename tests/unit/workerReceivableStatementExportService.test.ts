import type { RequestContext, SettlementBatch, SettlementPayable, SettlementPayableQueue, WorkerReceivableStatement, WorkerReceivableStatementReview } from "@xlb/types";
import type { PoolConnection } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import {
  WorkerReceivableStatementExportNotFoundError,
  WorkerReceivableStatementExportError,
  WorkerReceivableStatementExportService,
} from "../../backend/src/settlement/workerReceivableStatementExportService.js";
import { computeWorkerReceivableStatementExportContentHash } from "../../backend/src/settlement/workerReceivableStatementExportHash.js";
import type { SettlementRepository } from "../../backend/src/settlement/settlementRepository.js";
import type { WorkerReceivableStatementRepository } from "../../backend/src/settlement/workerReceivableStatementRepository.js";
import type { WorkerReceivableStatementReviewRepository } from "../../backend/src/settlement/workerReceivableStatementReviewRepository.js";
import type { WorkerReceivableStatementExportRepository } from "../../backend/src/settlement/workerReceivableStatementExportRepository.js";
import type { EventOutboxRepository } from "../../backend/src/events/eventOutbox.js";

const now = new Date().toISOString();
const context: RequestContext = { traceId: "trace", appType: "admin", role: "operator", cityCode: "hangzhou", userId: "operator-1", requestStartedAt: now };
const statement: WorkerReceivableStatement = {
  statementId: "wrs-1", cityCode: "hangzhou", queueId: "spq-1", settlementPayableId: "spy-1",
  settlementBatchId: "stb-1", workerId: "wrk-1", currency: "CNY", grossAmount: 89,
  platformFeeAmount: 8.9, workerReceivableAmount: 80.1, itemCount: 1, status: "created",
  generatedAt: now, generatedBy: "operator-1", createdAt: now, updatedAt: now,
};
const review: WorkerReceivableStatementReview = {
  reviewId: "wrr-1", cityCode: "hangzhou", statementId: "wrs-1", queueId: "spq-1",
  settlementPayableId: "spy-1", settlementBatchId: "stb-1", workerId: "wrk-1",
  decision: "approved", reviewNote: null, reviewedAt: now, reviewedBy: "operator-1",
  createdAt: now, updatedAt: now,
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
const transaction = async <T>(callback: (connection: PoolConnection) => Promise<T>) => callback({} as PoolConnection);

describe("workerReceivableStatementExportService", () => {
  it("exports approved review and writes exported outbox event", async () => {
    const settlementRepo = {
      findPayableByIdForEnqueue: vi.fn().mockResolvedValue(payable),
      findQueueForPayable: vi.fn().mockResolvedValue(queue),
      findBatchForUpdate: vi.fn().mockResolvedValue(batch),
    };
    const exportRepo = {
      lockStatementForExport: vi.fn().mockResolvedValue(true),
      findExportByStatement: vi.fn().mockResolvedValue(null),
      insertExport: vi.fn(),
    };
    const reviewRepo = { findReviewByStatement: vi.fn().mockResolvedValue(review) };
    const outbox = { insertEvent: vi.fn() };
    const service = new WorkerReceivableStatementExportService(
      settlementRepo as unknown as SettlementRepository,
      { getStatementById: vi.fn().mockResolvedValue(statement) } as unknown as WorkerReceivableStatementRepository,
      reviewRepo as unknown as WorkerReceivableStatementReviewRepository,
      exportRepo as unknown as WorkerReceivableStatementExportRepository,
      outbox as unknown as EventOutboxRepository,
      transaction,
    );
    const result = await service.exportWorkerReceivableStatementOnce(context, "wrs-1");
    expect(result.idempotent).toBe(false);
    expect(result.export.exportFormat).toBe("internal_v1");
    expect(result.export.payloadVersion).toBe("v1");
    expect(result.export.contentHash).toHaveLength(64);
    expect(exportRepo.insertExport).toHaveBeenCalledOnce();
    expect(outbox.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "worker.receivable.statement.exported",
    }));
  });

  it("rejects rejected review", async () => {
    const rejected = { ...review, decision: "rejected" as const };
    const service = new WorkerReceivableStatementExportService(
      {} as SettlementRepository,
      { getStatementById: vi.fn().mockResolvedValue(statement) } as unknown as WorkerReceivableStatementRepository,
      { findReviewByStatement: vi.fn().mockResolvedValue(rejected) } as unknown as WorkerReceivableStatementReviewRepository,
      { lockStatementForExport: vi.fn().mockResolvedValue(true), findExportByStatement: vi.fn().mockResolvedValue(null) } as unknown as WorkerReceivableStatementExportRepository,
      { insertEvent: vi.fn() } as unknown as EventOutboxRepository,
      transaction,
    );
    await expect(service.exportWorkerReceivableStatementOnce(context, "wrs-1")).rejects.toBeInstanceOf(WorkerReceivableStatementExportError);
  });

  it("rejects export without review", async () => {
    const service = new WorkerReceivableStatementExportService(
      {} as SettlementRepository,
      { getStatementById: vi.fn().mockResolvedValue(statement) } as unknown as WorkerReceivableStatementRepository,
      { findReviewByStatement: vi.fn().mockResolvedValue(null) } as unknown as WorkerReceivableStatementReviewRepository,
      { lockStatementForExport: vi.fn().mockResolvedValue(true), findExportByStatement: vi.fn().mockResolvedValue(null) } as unknown as WorkerReceivableStatementExportRepository,
      { insertEvent: vi.fn() } as unknown as EventOutboxRepository,
      transaction,
    );
    await expect(service.exportWorkerReceivableStatementOnce(context, "wrs-1")).rejects.toBeInstanceOf(WorkerReceivableStatementExportError);
  });

  it("returns existing export idempotently", async () => {
    const existing = {
      exportId: "wre-1", cityCode: "hangzhou" as const, statementId: "wrs-1", reviewId: "wrr-1",
      queueId: "spq-1", settlementPayableId: "spy-1", settlementBatchId: "stb-1", workerId: "wrk-1",
      exportFormat: "internal_v1" as const, payloadVersion: "v1" as const, contentHash: "abc",
      exportedAt: now, exportedBy: "operator-1", createdAt: now, updatedAt: now,
    };
    const service = new WorkerReceivableStatementExportService(
      {} as SettlementRepository,
      { getStatementById: vi.fn().mockResolvedValue(statement) } as unknown as WorkerReceivableStatementRepository,
      {} as WorkerReceivableStatementReviewRepository,
      { lockStatementForExport: vi.fn().mockResolvedValue(true), findExportByStatement: vi.fn().mockResolvedValue(existing) } as unknown as WorkerReceivableStatementExportRepository,
      { insertEvent: vi.fn() } as unknown as EventOutboxRepository,
      transaction,
    );
    await expect(service.exportWorkerReceivableStatementOnce(context, "wrs-1")).resolves.toEqual({
      export: existing,
      idempotent: true,
    });
  });
});

describe("computeWorkerReceivableStatementExportContentHash", () => {
  it("is stable for the same inputs", () => {
    const input = {
      statementId: "wrs-1", reviewId: "wrr-1", exportFormat: "internal_v1" as const,
      payloadVersion: "v1" as const, grossAmount: 89, platformFeeAmount: 8.9,
      workerReceivableAmount: 80.1, itemCount: 1,
    };
    expect(computeWorkerReceivableStatementExportContentHash(input)).toBe(
      computeWorkerReceivableStatementExportContentHash(input),
    );
  });
});
