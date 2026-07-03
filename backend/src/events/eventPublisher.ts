import type { RequestContext } from "@xlb/types";
import type { CityCode } from "@xlb/types";
import type { EventOutbox } from "@xlb/types";
import { executeCityScoped } from "../dal/scopedExecutor.js";
import { eventOutboxRepository, EventOutboxRepository } from "./eventOutbox.js";

import type { OutboxEventType } from "@xlb/types";

export class EventPublisher {
  constructor(private readonly repository: EventOutboxRepository = eventOutboxRepository) {}

  async listPending(context: RequestContext, limit = 100): Promise<EventOutbox[]> {
    return executeCityScoped(context, (cityCode) =>
      this.repository.findPendingEvents(context, cityCode as CityCode, limit),
    );
  }

  async listPendingByType(
    context: RequestContext,
    eventType: OutboxEventType,
    limit = 100,
  ): Promise<EventOutbox[]> {
    return executeCityScoped(context, (cityCode) =>
      this.repository.findPendingEventsByType(
        context,
        cityCode as CityCode,
        eventType,
        limit,
      ),
    );
  }
}

export const eventPublisher = new EventPublisher();
