import type { RequestContext, SettlementBatch, SettlementItem } from "@xlb/types";
import type { PoolConnection } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import { SettlementConfirmationError, SettlementConfirmationService } from "../../backend/src/settlement/settlementConfirmationService.js";
import type { SettlementRepository } from "../../backend/src/settlement/settlementRepository.js";
import type { EventOutboxRepository } from "../../backend/src/events/eventOutbox.js";

const now = new Date().toISOString();
const context: RequestContext = { traceId: "trace", appType: "admin", role: "operator", cityCode: "hangzhou", userId: "operator-1", requestStartedAt: now };
const batch: SettlementBatch = { settlementBatchId: "stb-1", cityCode: "hangzhou", currency: "CNY", totalGrossAmount: 89, totalPlatformFee: 8.9, totalWorkerReceivable: 80.1, itemCount: 1, status: "prepared", preparedAt: now, confirmedAt: null, confirmedBy: null, createdAt: now, updatedAt: now };
const item: SettlementItem = { settlementItemId: "sti-1", settlementBatchId: "stb-1", cityCode: "hangzhou", accrualId: "lar-1", fulfillmentId: "ful-1", orderId: "ord-1", paymentOrderId: "pay-1", workerId: "worker-1", customerId: "customer-1", skuId: "sku-1", grossAmount: 89, platformFee: 8.9, workerReceivable: 80.1, currency: "CNY", status: "prepared", createdAt: now, updatedAt: now };
const transaction = async <T>(callback: (connection: PoolConnection) => Promise<T>) => callback({} as PoolConnection);

describe("settlementConfirmationService", () => {
  it("atomically confirms a prepared snapshot and writes one audit event", async () => {
    const repository = { findBatchForConfirmation: vi.fn().mockResolvedValue(batch), lockBatchItems: vi.fn().mockResolvedValue([item]), markBatchConfirmed: vi.fn() };
    const outbox = { insertEvent: vi.fn() };
    const service = new SettlementConfirmationService(repository as unknown as SettlementRepository, outbox as unknown as EventOutboxRepository, transaction);
    const result = await service.confirmBatch(context, "stb-1");
    expect(result).toMatchObject({ idempotent: false, batch: { status: "confirmed", confirmedBy: "operator-1", totalGrossAmount: 89 } });
    expect(repository.markBatchConfirmed).toHaveBeenCalledOnce();
    expect(outbox.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: "settlement.confirmed", aggregateId: "stb-1" }));
    expect(outbox.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "conflict_audit",
      payload: expect.objectContaining({
        order_id: "ord-1",
        fee_type: "gross",
        source_type: "settlement.confirmed",
        snapshot_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
  });

  it("returns an already confirmed batch without another outbox event", async () => {
    const confirmed = { ...batch, status: "confirmed" as const, confirmedAt: now, confirmedBy: "operator-1" };
    const repository = { findBatchForConfirmation: vi.fn().mockResolvedValue(confirmed), lockBatchItems: vi.fn(), markBatchConfirmed: vi.fn() };
    const outbox = { insertEvent: vi.fn() };
    const service = new SettlementConfirmationService(repository as unknown as SettlementRepository, outbox as unknown as EventOutboxRepository, transaction);
    await expect(service.confirmBatch(context, "stb-1")).resolves.toEqual({ batch: confirmed, idempotent: true });
    expect(outbox.insertEvent).not.toHaveBeenCalled();
  });

  it("rejects cancelled batches and changed amount snapshots", async () => {
    const cancelledRepo = { findBatchForConfirmation: vi.fn().mockResolvedValue({ ...batch, status: "cancelled" }), lockBatchItems: vi.fn(), markBatchConfirmed: vi.fn() };
    const outbox = { insertEvent: vi.fn() };
    const cancelledService = new SettlementConfirmationService(cancelledRepo as unknown as SettlementRepository, outbox as unknown as EventOutboxRepository, transaction);
    await expect(cancelledService.confirmBatch(context, "stb-1")).rejects.toBeInstanceOf(SettlementConfirmationError);

    const changedRepo = { findBatchForConfirmation: vi.fn().mockResolvedValue(batch), lockBatchItems: vi.fn().mockResolvedValue([{ ...item, grossAmount: 90 }]), markBatchConfirmed: vi.fn() };
    const changedService = new SettlementConfirmationService(changedRepo as unknown as SettlementRepository, outbox as unknown as EventOutboxRepository, transaction);
    await expect(changedService.confirmBatch(context, "stb-1")).rejects.toThrow(/snapshot mismatch/);
    expect(changedRepo.markBatchConfirmed).not.toHaveBeenCalled();
  });
});
