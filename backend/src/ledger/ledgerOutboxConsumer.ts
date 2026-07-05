import type { LedgerAccrual, LedgerEntry, RequestContext } from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../events/eventOutbox.js";
import {
  ledgerAccrualService,
  LedgerAccrualService,
} from "./ledgerAccrualService.js";
import {
  ledgerReversalService,
  LedgerReversalService,
} from "./ledgerReversalService.js";

export class LedgerOutboxConsumer {
  constructor(
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly accruals: LedgerAccrualService = ledgerAccrualService,
    private readonly reversals: LedgerReversalService = ledgerReversalService,
  ) {}

  async runOnce(
    context: RequestContext,
  ): Promise<{ processed: number; accruals: LedgerAccrual[] }> {
    const cityCode = assertCityScopedContext(context);
    const events = await this.outbox.findPendingEventsByType(
      context,
      cityCode,
      "fulfillment.completed",
    );
    const accruals: LedgerAccrual[] = [];
    for (const event of events) {
      accruals.push((await this.accruals.accrue(context, event)).accrual);
    }
    return { processed: accruals.length, accruals };
  }

  async runReversalsOnce(
    context: RequestContext,
  ): Promise<{ processed: number; entries: LedgerEntry[] }> {
    const cityCode = assertCityScopedContext(context);
    const events = await this.outbox.findPendingEventsByType(
      context,
      cityCode,
      "refund.approved",
    );
    const entries: LedgerEntry[] = [];
    for (const event of events) {
      entries.push(...(await this.reversals.reverse(context, event)).entries);
    }
    return { processed: events.length, entries };
  }
}

export const ledgerOutboxConsumer = new LedgerOutboxConsumer();
