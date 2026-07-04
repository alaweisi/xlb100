import type { RequestContext, SettlementBatch, SettlementItem, SettlementPayable, SettlementPayableQueue } from "@xlb/types";
import type { PoolConnection } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import {
  WorkerReceivableStatementNotFoundError,
  WorkerReceivableStatementError,
  WorkerReceivableStatementService,
} from "../../backend/src/settlement/workerReceivableStatementService.js";
import type { SettlementRepository } from "../../backend/src/settlement/settlementRepository.js";
import type { WorkerReceivableStatementRepository } from "../../backend/src/settlement/workerReceivableStatementRepository.js";
import type { EventOutboxRepository } from "../../backend/src/events/eventOutbox.js";

const now = new Date().toISOString();
const context: RequestContext = { traceId: "trace", appType: "admin", role: "operator", cityCode: "hangzhou", userId: "operator-1", requestStartedAt: now };
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
const item: SettlementItem = {
  settlementItemId: "sti-1", settlementBatchId: "stb-1", cityCode: "hangzhou", accrualId: "lac-1",
  fulfillmentId: "ful-1", orderId: "ord-1", paymentOrderId: "pay-1", workerId: "wrk-1",
  customerId: "cus-1", skuId: "sku-1", grossAmount: 89, platformFee: 8.9, workerReceivable: 80.1,
  currency: "CNY", status: "confirmed", createdAt: now, updatedAt: now,
};
const transaction = async <T>(callback: (connection: PoolConnection) => Promise<T>) => callback({} as PoolConnection);

describe("workerReceivableStatementService", () => {
  it("generates worker statements and writes one created event per worker", async () => {
    const settlementRepo = {
      findPayableByIdForEnqueue: vi.fn().mockResolvedValue(payable),
      findQueueForPayable: vi.fn().mockResolvedValue(queue),
      findBatchForUpdate: vi.fn().mockResolvedValue(batch),
      lockBatchItems: vi.fn().mockResolvedValue([item]),
    };
    const statementRepo = {
      findStatementsByQueue: vi.fn().mockResolvedValue([]),
      insertStatement: vi.fn(),
      insertStatementLine: vi.fn(),
    };
    const outbox = { insertEvent: vi.fn() };
    const service = new WorkerReceivableStatementService(
      settlementRepo as unknown as SettlementRepository,
      statementRepo as unknown as WorkerReceivableStatementRepository,
      outbox as unknown as EventOutboxRepository,
      transaction,
    );
    const result = await service.generateWorkerReceivableStatements(context, "spy-1");
    expect(result.idempotent).toBe(false);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]).toMatchObject({
      workerId: "wrk-1",
      status: "created",
      generatedBy: "operator-1",
      grossAmount: 89,
      platformFeeAmount: 8.9,
      workerReceivableAmount: 80.1,
      itemCount: 1,
    });
    expect(statementRepo.insertStatement).toHaveBeenCalledOnce();
    expect(statementRepo.insertStatementLine).toHaveBeenCalledOnce();
    expect(outbox.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "worker.receivable.statement.created",
    }));
  });

  it("returns existing statements without another outbox event", async () => {
    const existing = [{
      statementId: "wrs-1", cityCode: "hangzhou" as const, queueId: "spq-1", settlementPayableId: "spy-1",
      settlementBatchId: "stb-1", workerId: "wrk-1", currency: "CNY" as const, grossAmount: 89,
      platformFeeAmount: 8.9, workerReceivableAmount: 80.1, itemCount: 1, status: "created" as const,
      generatedAt: now, generatedBy: "operator-1", createdAt: now, updatedAt: now,
    }];
    const settlementRepo = { findPayableByIdForEnqueue: vi.fn().mockResolvedValue(payable), findQueueForPayable: vi.fn().mockResolvedValue(queue) };
    const statementRepo = { findStatementsByQueue: vi.fn().mockResolvedValue(existing), insertStatement: vi.fn() };
    const outbox = { insertEvent: vi.fn() };
    const service = new WorkerReceivableStatementService(
      settlementRepo as unknown as SettlementRepository,
      statementRepo as unknown as WorkerReceivableStatementRepository,
      outbox as unknown as EventOutboxRepository,
      transaction,
    );
    await expect(service.generateWorkerReceivableStatements(context, "spy-1")).resolves.toEqual({
      statements: existing,
      idempotent: true,
    });
    expect(outbox.insertEvent).not.toHaveBeenCalled();
  });

  it("rejects missing payables and queues", async () => {
    const missingPayable = { findPayableByIdForEnqueue: vi.fn().mockResolvedValue(null) };
    const missingPayableService = new WorkerReceivableStatementService(
      missingPayable as unknown as SettlementRepository,
      { findStatementsByQueue: vi.fn() } as unknown as WorkerReceivableStatementRepository,
      { insertEvent: vi.fn() } as unknown as EventOutboxRepository,
      transaction,
    );
    await expect(missingPayableService.generateWorkerReceivableStatements(context, "missing")).rejects.toBeInstanceOf(WorkerReceivableStatementNotFoundError);

    const missingQueue = {
      findPayableByIdForEnqueue: vi.fn().mockResolvedValue(payable),
      findQueueForPayable: vi.fn().mockResolvedValue(null),
    };
    const missingQueueService = new WorkerReceivableStatementService(
      missingQueue as unknown as SettlementRepository,
      { findStatementsByQueue: vi.fn() } as unknown as WorkerReceivableStatementRepository,
      { insertEvent: vi.fn() } as unknown as EventOutboxRepository,
      transaction,
    );
    await expect(missingQueueService.generateWorkerReceivableStatements(context, "spy-1")).rejects.toBeInstanceOf(WorkerReceivableStatementNotFoundError);
  });

  it("aggregates multiple workers from batch items", async () => {
    const item2: SettlementItem = {
      ...item,
      settlementItemId: "sti-2",
      accrualId: "lac-2",
      fulfillmentId: "ful-2",
      orderId: "ord-2",
      workerId: "wrk-2",
      grossAmount: 100,
      platformFee: 10,
      workerReceivable: 90,
    };
    const multiQueue = { ...queue, grossAmount: 189, platformFeeAmount: 18.9, workerReceivableAmount: 170.1, itemCount: 2 };
    const multiPayable = { ...payable, grossAmount: 189, platformFeeAmount: 18.9, workerReceivableAmount: 170.1, itemCount: 2 };
    const multiBatch = { ...batch, totalGrossAmount: 189, totalPlatformFee: 18.9, totalWorkerReceivable: 170.1, itemCount: 2 };
    const settlementRepo = {
      findPayableByIdForEnqueue: vi.fn().mockResolvedValue(multiPayable),
      findQueueForPayable: vi.fn().mockResolvedValue(multiQueue),
      findBatchForUpdate: vi.fn().mockResolvedValue(multiBatch),
      lockBatchItems: vi.fn().mockResolvedValue([item, item2]),
    };
    const statementRepo = {
      findStatementsByQueue: vi.fn().mockResolvedValue([]),
      insertStatement: vi.fn(),
      insertStatementLine: vi.fn(),
    };
    const outbox = { insertEvent: vi.fn() };
    const service = new WorkerReceivableStatementService(
      settlementRepo as unknown as SettlementRepository,
      statementRepo as unknown as WorkerReceivableStatementRepository,
      outbox as unknown as EventOutboxRepository,
      transaction,
    );
    const result = await service.generateWorkerReceivableStatements(context, "spy-1");
    expect(result.statements).toHaveLength(2);
    expect(outbox.insertEvent).toHaveBeenCalledTimes(2);
  });
});
