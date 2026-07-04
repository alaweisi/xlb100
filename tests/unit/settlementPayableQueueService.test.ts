import type { RequestContext, SettlementBatch, SettlementPayable } from "@xlb/types";
import type { PoolConnection } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import {
  SettlementPayableNotFoundError,
  SettlementPayableQueueError,
  SettlementPayableQueueService,
} from "../../backend/src/settlement/settlementPayableQueueService.js";
import type { SettlementRepository } from "../../backend/src/settlement/settlementRepository.js";
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
const transaction = async <T>(callback: (connection: PoolConnection) => Promise<T>) => callback({} as PoolConnection);

describe("settlementPayableQueueService", () => {
  it("enqueues a payable row and writes one queued event", async () => {
    const repository = {
      findPayableByIdForEnqueue: vi.fn().mockResolvedValue(payable),
      findQueueForPayable: vi.fn().mockResolvedValue(null),
      findBatchForUpdate: vi.fn().mockResolvedValue(batch),
      insertPayableQueue: vi.fn(),
    };
    const outbox = { insertEvent: vi.fn() };
    const service = new SettlementPayableQueueService(repository as unknown as SettlementRepository, outbox as unknown as EventOutboxRepository, transaction);
    const result = await service.enqueueSettlementPayable(context, "spy-1");
    expect(result).toMatchObject({ idempotent: false, queue: { status: "queued", enqueuedBy: "operator-1", grossAmount: 89 } });
    expect(repository.insertPayableQueue).toHaveBeenCalledOnce();
    expect(outbox.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: "settlement.payable.queued" }));
  });

  it("returns an existing queue without another outbox event", async () => {
    const queue = { queueId: "spq-1", cityCode: "hangzhou" as const, settlementPayableId: "spy-1", settlementBatchId: "stb-1", currency: "CNY" as const, grossAmount: 89, platformFeeAmount: 8.9, workerReceivableAmount: 80.1, itemCount: 1, status: "queued" as const, enqueuedAt: now, enqueuedBy: "operator-1", createdAt: now, updatedAt: now };
    const repository = { findPayableByIdForEnqueue: vi.fn().mockResolvedValue(payable), findQueueForPayable: vi.fn().mockResolvedValue(queue), findBatchForUpdate: vi.fn(), insertPayableQueue: vi.fn() };
    const outbox = { insertEvent: vi.fn() };
    const service = new SettlementPayableQueueService(repository as unknown as SettlementRepository, outbox as unknown as EventOutboxRepository, transaction);
    await expect(service.enqueueSettlementPayable(context, "spy-1")).resolves.toEqual({ queue, idempotent: true });
    expect(outbox.insertEvent).not.toHaveBeenCalled();
  });

  it("rejects missing payables and batch snapshot mismatches", async () => {
    const missing = { findPayableByIdForEnqueue: vi.fn().mockResolvedValue(null), findQueueForPayable: vi.fn() };
    const missingService = new SettlementPayableQueueService(missing as unknown as SettlementRepository, { insertEvent: vi.fn() } as unknown as EventOutboxRepository, transaction);
    await expect(missingService.enqueueSettlementPayable(context, "missing")).rejects.toBeInstanceOf(SettlementPayableNotFoundError);

    const badBatch = { findPayableByIdForEnqueue: vi.fn().mockResolvedValue(payable), findQueueForPayable: vi.fn().mockResolvedValue(null), findBatchForUpdate: vi.fn().mockResolvedValue({ ...batch, status: "prepared" }), insertPayableQueue: vi.fn() };
    const badService = new SettlementPayableQueueService(badBatch as unknown as SettlementRepository, { insertEvent: vi.fn() } as unknown as EventOutboxRepository, transaction);
    await expect(badService.enqueueSettlementPayable(context, "spy-1")).rejects.toBeInstanceOf(SettlementPayableQueueError);
  });
});
