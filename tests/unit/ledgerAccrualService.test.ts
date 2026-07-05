import type { EventOutbox, RequestContext } from "@xlb/types";
import type { PoolConnection } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import { LedgerAccrualService } from "../../backend/src/ledger/ledgerAccrualService.js";
import type { LedgerRepository } from "../../backend/src/ledger/ledgerRepository.js";
import type { EventOutboxRepository } from "../../backend/src/events/eventOutbox.js";

const context: RequestContext = { traceId: "trace-1", appType: "admin", role: "operator", cityCode: "hangzhou", requestStartedAt: new Date().toISOString() };
const event: EventOutbox = { eventId: "evt-1", eventType: "fulfillment.completed", aggregateType: "fulfillment", aggregateId: "ful-1", cityCode: "hangzhou", payload: { fulfillmentId: "ful-1" }, status: "pending", createdAt: new Date().toISOString(), publishedAt: null };

describe("ledgerAccrualService", () => {
  it("creates one accrual, three entries, and publishes the source event", async () => {
    const repo = {
      findAccrualByEvent: vi.fn().mockResolvedValue(null),
      findAccrualBySingleWriteKey: vi.fn().mockResolvedValue(null),
      loadSnapshot: vi.fn().mockResolvedValue({ fulfillmentId: "ful-1", orderId: "ord-1", paymentOrderId: "pay-1", workerId: "worker-1", customerId: "customer-1", skuId: "sku-1", grossAmount: 89, currency: "CNY" }),
      ensureAccount: vi.fn().mockResolvedValueOnce("customer-account").mockResolvedValueOnce("platform-account").mockResolvedValueOnce("worker-account"),
      insertAccrual: vi.fn(), insertEntry: vi.fn(),
    };
    const outbox = { insertEvent: vi.fn(), markEventPublished: vi.fn() };
    const transaction = async <T>(callback: (connection: PoolConnection) => Promise<T>) => callback({} as PoolConnection);
    const service = new LedgerAccrualService(repo as unknown as LedgerRepository, outbox as unknown as EventOutboxRepository, transaction);

    const result = await service.accrue(context, event);
    expect(result.accrual).toMatchObject({ grossAmount: 89, platformFee: 8.9, workerReceivable: 80.1, status: "accrued" });
    expect(result.entries.map((entry) => [entry.accountType, entry.direction, entry.amount])).toEqual([
      ["customer", "debit", 89], ["platform", "credit", 8.9], ["worker", "credit", 80.1],
    ]);
    expect(repo.insertEntry).toHaveBeenCalledTimes(3);
    expect(outbox.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "conflict_audit",
      aggregateType: "ledger_accrual",
      payload: expect.objectContaining({
        order_id: "ord-1",
        fee_type: "gross",
        source_type: "ledger.accrued",
        snapshot_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
    expect(outbox.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "conflict_audit",
      aggregateType: "ledger_entry",
      payload: expect.objectContaining({
        order_id: "ord-1",
        fee_type: "gross",
        source_type: "fulfillment.completed",
        snapshot_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }));
    expect(outbox.insertEvent).toHaveBeenCalledTimes(6);
    expect(outbox.markEventPublished).toHaveBeenCalledWith(expect.anything(), "evt-1", "hangzhou");
  });
});
