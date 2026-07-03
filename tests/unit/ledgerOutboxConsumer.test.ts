import type { EventOutbox, RequestContext } from "@xlb/types";
import { describe, expect, it, vi } from "vitest";
import { LedgerOutboxConsumer } from "../../backend/src/ledger/ledgerOutboxConsumer.js";
import type { EventOutboxRepository } from "../../backend/src/events/eventOutbox.js";
import type { LedgerAccrualService } from "../../backend/src/ledger/ledgerAccrualService.js";

describe("ledgerOutboxConsumer", () => {
  it("requests only pending fulfillment.completed events in the current city", async () => {
    const context: RequestContext = { traceId: "t", appType: "admin", role: "operator", cityCode: "hangzhou", requestStartedAt: new Date().toISOString() };
    const event = { eventId: "evt", eventType: "fulfillment.completed", aggregateId: "ful", cityCode: "hangzhou" } as EventOutbox;
    const accrual = { accrualId: "lac" };
    const outbox = { findPendingEventsByType: vi.fn().mockResolvedValue([event]) };
    const service = { accrue: vi.fn().mockResolvedValue({ accrual, entries: [], idempotent: false }) };
    const consumer = new LedgerOutboxConsumer(outbox as unknown as EventOutboxRepository, service as unknown as LedgerAccrualService);

    expect(await consumer.runOnce(context)).toMatchObject({ processed: 1, accruals: [accrual] });
    expect(outbox.findPendingEventsByType).toHaveBeenCalledWith(context, "hangzhou", "fulfillment.completed");
  });
});
