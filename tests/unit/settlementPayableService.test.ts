import type { RequestContext, SettlementBatch, SettlementItem, SettlementPayable } from "@xlb/types";
import type { PoolConnection } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import { SettlementPayableError, SettlementPayableService } from "../../backend/src/settlement/settlementPayableService.js";
import { SettlementBatchNotFoundError } from "../../backend/src/settlement/settlementConfirmationService.js";
import type { SettlementRepository } from "../../backend/src/settlement/settlementRepository.js";
import type { EventOutboxRepository } from "../../backend/src/events/eventOutbox.js";

const now = new Date().toISOString();
const context: RequestContext = { traceId: "trace", appType: "admin", role: "operator", cityCode: "hangzhou", userId: "operator-1", requestStartedAt: now };
const batch: SettlementBatch = {
  settlementBatchId: "stb-1", cityCode: "hangzhou", currency: "CNY", totalGrossAmount: 89,
  totalPlatformFee: 8.9, totalWorkerReceivable: 80.1, itemCount: 1, status: "confirmed",
  preparedAt: now, confirmedAt: now, confirmedBy: "operator-1", createdAt: now, updatedAt: now,
};
const item: SettlementItem = {
  settlementItemId: "sti-1", settlementBatchId: "stb-1", cityCode: "hangzhou", accrualId: "lar-1",
  fulfillmentId: "ful-1", orderId: "ord-1", paymentOrderId: "pay-1", workerId: "worker-1",
  customerId: "customer-1", skuId: "sku-1", grossAmount: 89, platformFee: 8.9, workerReceivable: 80.1,
  currency: "CNY", status: "confirmed", createdAt: now, updatedAt: now,
};
const payable: SettlementPayable = {
  settlementPayableId: "spy-1", cityCode: "hangzhou", settlementBatchId: "stb-1", currency: "CNY",
  grossAmount: 89, platformFeeAmount: 8.9, workerReceivableAmount: 80.1, itemCount: 1,
  status: "payable", markedAt: now, markedBy: "operator-1", createdAt: now, updatedAt: now,
};
const transaction = async <T>(callback: (connection: PoolConnection) => Promise<T>) => callback({} as PoolConnection);

describe("settlementPayableService", () => {
  it("marks a confirmed batch payable and writes one readiness event", async () => {
    const repository = {
      findBatchForUpdate: vi.fn().mockResolvedValue(batch),
      findPayableForBatch: vi.fn().mockResolvedValue(null),
      lockBatchItems: vi.fn().mockResolvedValue([item]),
      insertPayable: vi.fn(),
    };
    const outbox = { insertEvent: vi.fn() };
    const service = new SettlementPayableService(repository as unknown as SettlementRepository, outbox as unknown as EventOutboxRepository, transaction);
    const result = await service.markSettlementPayable(context, "stb-1");
    expect(result).toMatchObject({ idempotent: false, payable: { status: "payable", markedBy: "operator-1", grossAmount: 89 } });
    expect(repository.insertPayable).toHaveBeenCalledOnce();
    expect(outbox.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: "settlement.payable" }));
    expect(outbox.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "conflict_audit",
      payload: expect.objectContaining({
        order_id: "ord-1",
        fee_type: "gross",
        source_type: "settlement.payable",
        snapshot_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
  });

  it("returns an existing payable without another outbox event", async () => {
    const repository = {
      findBatchForUpdate: vi.fn().mockResolvedValue(batch),
      findPayableForBatch: vi.fn().mockResolvedValue(payable),
      lockBatchItems: vi.fn(),
      insertPayable: vi.fn(),
    };
    const outbox = { insertEvent: vi.fn() };
    const service = new SettlementPayableService(repository as unknown as SettlementRepository, outbox as unknown as EventOutboxRepository, transaction);
    await expect(service.markSettlementPayable(context, "stb-1")).resolves.toEqual({ payable, idempotent: true });
    expect(outbox.insertEvent).not.toHaveBeenCalled();
  });

  it("rejects prepared or cancelled batches and changed amount snapshots", async () => {
    const preparedRepo = {
      findBatchForUpdate: vi.fn().mockResolvedValue({ ...batch, status: "prepared", confirmedAt: null, confirmedBy: null }),
      findPayableForBatch: vi.fn().mockResolvedValue(null),
      lockBatchItems: vi.fn(),
      insertPayable: vi.fn(),
    };
    const outbox = { insertEvent: vi.fn() };
    const preparedService = new SettlementPayableService(preparedRepo as unknown as SettlementRepository, outbox as unknown as EventOutboxRepository, transaction);
    await expect(preparedService.markSettlementPayable(context, "stb-1")).rejects.toBeInstanceOf(SettlementPayableError);

    const cancelledRepo = {
      findBatchForUpdate: vi.fn().mockResolvedValue({ ...batch, status: "cancelled" }),
      findPayableForBatch: vi.fn().mockResolvedValue(null),
      lockBatchItems: vi.fn(),
      insertPayable: vi.fn(),
    };
    const cancelledService = new SettlementPayableService(cancelledRepo as unknown as SettlementRepository, outbox as unknown as EventOutboxRepository, transaction);
    await expect(cancelledService.markSettlementPayable(context, "stb-1")).rejects.toBeInstanceOf(SettlementPayableError);

    const changedRepo = {
      findBatchForUpdate: vi.fn().mockResolvedValue(batch),
      findPayableForBatch: vi.fn().mockResolvedValue(null),
      lockBatchItems: vi.fn().mockResolvedValue([{ ...item, grossAmount: 90 }]),
      insertPayable: vi.fn(),
    };
    const changedService = new SettlementPayableService(changedRepo as unknown as SettlementRepository, outbox as unknown as EventOutboxRepository, transaction);
    await expect(changedService.markSettlementPayable(context, "stb-1")).rejects.toThrow(/snapshot mismatch/);
    expect(changedRepo.insertPayable).not.toHaveBeenCalled();
  });

  it("throws when batch is missing in city scope", async () => {
    const repository = { findBatchForUpdate: vi.fn().mockResolvedValue(null), findPayableForBatch: vi.fn() };
    const service = new SettlementPayableService(repository as unknown as SettlementRepository, { insertEvent: vi.fn() } as unknown as EventOutboxRepository, transaction);
    await expect(service.markSettlementPayable(context, "missing")).rejects.toBeInstanceOf(SettlementBatchNotFoundError);
  });
});
