import type { LedgerAccrual, RequestContext } from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../events/eventOutbox.js";
import {
  ledgerAccrualService,
  LedgerAccrualService,
} from "./ledgerAccrualService.js";

export class LedgerOutboxConsumer {
  constructor(
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly accruals: LedgerAccrualService = ledgerAccrualService,
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
}

export const ledgerOutboxConsumer = new LedgerOutboxConsumer();
