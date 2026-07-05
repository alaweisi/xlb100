import type { LedgerAccrual, RequestContext } from "@xlb/types";
import type { PoolConnection } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import { SettlementPreparationService } from "../../backend/src/settlement/settlementPreparationService.js";
import type { SettlementRepository } from "../../backend/src/settlement/settlementRepository.js";
import type { EventOutboxRepository } from "../../backend/src/events/eventOutbox.js";

const context: RequestContext = { traceId: "trace", appType: "admin", role: "operator", cityCode: "hangzhou", requestStartedAt: new Date().toISOString() };
const accrual: LedgerAccrual = { accrualId: "lar-1", cityCode: "hangzhou", fulfillmentId: "ful-1", orderId: "ord-1", paymentOrderId: "pay-1", workerId: "worker-1", customerId: "customer-1", skuId: "sku-1", grossAmount: 89, platformFee: 8.9, workerReceivable: 80.1, currency: "CNY", sourceEventId: "evt-1", status: "accrued", createdAt: new Date().toISOString() };
const transaction = async <T>(callback: (connection: PoolConnection) => Promise<T>) => callback({} as PoolConnection);

describe("settlementPreparationService", () => {
  it("creates one batch, item, and prepared event from accruals", async () => {
    const repository = { findUnpreparedAccruals: vi.fn().mockResolvedValue([accrual]), insertBatch: vi.fn(), insertItem: vi.fn() };
    const outbox = { insertEvent: vi.fn() };
    const service = new SettlementPreparationService(repository as unknown as SettlementRepository, outbox as unknown as EventOutboxRepository, transaction);
    const result = await service.prepareOnce(context);
    expect(result).toMatchObject({ processed: 1, batch: { cityCode: "hangzhou", itemCount: 1, totalGrossAmount: 89, totalPlatformFee: 8.9, totalWorkerReceivable: 80.1, status: "prepared" } });
    expect(repository.insertItem).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ accrualId: "lar-1", status: "prepared" }));
    expect(outbox.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: "settlement.prepared", cityCode: "hangzhou" }));
    expect(outbox.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "conflict_audit",
      payload: expect.objectContaining({
        order_id: "ord-1",
        fee_type: "gross",
        source_type: "settlement.prepared",
        snapshot_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
  });

  it("returns processed zero without creating an empty batch", async () => {
    const repository = { findUnpreparedAccruals: vi.fn().mockResolvedValue([]), insertBatch: vi.fn(), insertItem: vi.fn() };
    const outbox = { insertEvent: vi.fn() };
    const service = new SettlementPreparationService(repository as unknown as SettlementRepository, outbox as unknown as EventOutboxRepository, transaction);
    await expect(service.prepareOnce(context)).resolves.toEqual({ processed: 0, batch: null, items: [] });
    expect(repository.insertBatch).not.toHaveBeenCalled();
    expect(outbox.insertEvent).not.toHaveBeenCalled();
  });
});
