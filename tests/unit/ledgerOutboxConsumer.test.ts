import type { EventOutbox, RequestContext } from "@xlb/types";
import { describe, expect, it, vi } from "vitest";
import { LedgerOutboxConsumer } from "../../backend/src/ledger/ledgerOutboxConsumer.js";
import type { EventOutboxRepository, OutboxClaim } from "../../backend/src/events/eventOutbox.js";
import type { LedgerAccrualService } from "../../backend/src/ledger/ledgerAccrualService.js";
import type { LedgerReversalService } from "../../backend/src/ledger/ledgerReversalService.js";

describe("ledgerOutboxConsumer", () => {
  it("claims only fulfillment.completed events in the current city", async () => {
    const context: RequestContext = { traceId: "t", appType: "admin", role: "operator", cityCode: "hangzhou", requestStartedAt: new Date().toISOString() };
    const event = {
      eventId: "evt",
      eventType: "fulfillment.completed",
      aggregateId: "ful",
      cityCode: "hangzhou",
      status: "processing",
      leaseOwner: "ledger-accrual:test",
      leaseToken: "00000000-0000-4000-8000-000000000001",
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    } as EventOutbox as OutboxClaim;
    const accrual = { accrualId: "lac" };
    const outbox = {
      claimFulfillmentCompletedForLedger: vi.fn().mockResolvedValue([event]),
      claimEventsByType: vi.fn().mockResolvedValue([]),
      renewClaim: vi.fn().mockResolvedValue(true),
      failClaim: vi.fn(),
    };
    const service = { accrue: vi.fn().mockResolvedValue({ accrual, entries: [], idempotent: false }) };
    const reversals = { reverse: vi.fn() };
    const consumer = new LedgerOutboxConsumer(
      outbox as unknown as EventOutboxRepository,
      service as unknown as LedgerAccrualService,
      reversals as unknown as LedgerReversalService,
    );

    expect(await consumer.runOnce(context)).toMatchObject({ processed: 1, accruals: [accrual] });
    expect(outbox.claimFulfillmentCompletedForLedger).toHaveBeenCalledWith(
      context,
      "hangzhou",
      expect.stringMatching(/^ledger-accrual:/),
    );
    expect(outbox.claimEventsByType).toHaveBeenCalledWith(
      context,
      "hangzhou",
      "refund.approved",
      expect.stringMatching(/^ledger-reversal:/),
    );
    expect(outbox.renewClaim).toHaveBeenCalledWith(event);
  });
});
