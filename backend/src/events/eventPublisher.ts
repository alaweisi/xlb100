import type { RequestContext } from "@xlb/types";
import type { CityCode } from "@xlb/types";
import type { EventOutbox } from "@xlb/types";
import { executeCityScoped } from "../dal/scopedExecutor.js";
import { eventOutboxRepository, EventOutboxRepository } from "./eventOutbox.js";

export class EventPublisher {
  constructor(private readonly repository: EventOutboxRepository = eventOutboxRepository) {}

  async listPending(context: RequestContext, limit = 100): Promise<EventOutbox[]> {
    return executeCityScoped(context, (cityCode) =>
      this.repository.findPendingEvents(context, cityCode as CityCode, limit),
    );
  }
}

export const eventPublisher = new EventPublisher();
