import type { CityCode, DispatchTask, EventOutbox, RequestContext } from "@xlb/types";
import { orderPaidEventPayloadSchema } from "@xlb/validators";
import { withTransaction } from "../dal/transaction.js";
import { executeCityScoped, assertCityScopedContext } from "../dal/scopedExecutor.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../events/eventOutbox.js";
import { generateDispatchTaskId } from "../events/eventIds.js";
import { getDispatchStreamName } from "../streams/cityStreamNames.js";
import {
  dispatchStreamPublisher,
  DispatchStreamPublisher,
} from "../streams/dispatchStreamPublisher.js";
import {
  dispatchRepository,
  DispatchRepository,
} from "./dispatchRepository.js";

function isDuplicateEntryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "ER_DUP_ENTRY"
  );
}

export class DispatchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatchValidationError";
  }
}

export class DispatchService {
  constructor(
    private readonly tasks: DispatchRepository = dispatchRepository,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly publisher: DispatchStreamPublisher = dispatchStreamPublisher,
  ) {}

  async processPaidOrderEvent(
    context: RequestContext,
    event: EventOutbox,
  ): Promise<DispatchTask> {
    if (event.eventType !== "order.paid") {
      throw new DispatchValidationError(
        `dispatch only consumes order.paid, got ${event.eventType}`,
      );
    }

    const cityCode = assertCityScopedContext(context);
    if (event.cityCode !== cityCode) {
      throw new DispatchValidationError("event city_code mismatch");
    }

    const existing = await this.tasks.findBySourceEventId(
      context,
      cityCode,
      event.eventId,
    );
    if (existing) {
      if (existing.status === "queued" && event.status === "pending") {
        await withTransaction(async (connection) => {
          await this.outbox.markEventPublished(connection, event.eventId, cityCode);
        });
      }
      return existing;
    }

    const payload = orderPaidEventPayloadSchema.parse(event.payload);
    if (payload.cityCode !== cityCode) {
      throw new DispatchValidationError("payload cityCode mismatch");
    }

    const dispatchTaskId = generateDispatchTaskId();
    const streamName = getDispatchStreamName(cityCode);

    try {
      await withTransaction(async (connection) => {
        await this.tasks.insertTask(connection, {
          dispatchTaskId,
          cityCode,
          orderId: payload.orderId,
          customerId: payload.customerId,
          skuId: payload.skuId,
          amount: payload.amount,
          sourceEventId: event.eventId,
          streamName,
        });
      });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        const raced = await this.tasks.findBySourceEventId(
          context,
          cityCode,
          event.eventId,
        );
        if (raced) {
          return raced;
        }
      }
      throw error;
    }

    let streamEntryId: string;
    try {
      const pendingTask = (await this.tasks.findBySourceEventId(
        context,
        cityCode,
        event.eventId,
      ))!;
      if (pendingTask.status === "queued" && pendingTask.streamEntryId) {
        if (event.status === "pending") {
          await withTransaction(async (connection) => {
            await this.outbox.markEventPublished(connection, event.eventId, cityCode);
          });
        }
        return pendingTask;
      }
      streamEntryId = await this.publisher.publish(pendingTask);
    } catch (error) {
      await withTransaction(async (connection) => {
        await this.tasks.updateTaskFailed(connection, dispatchTaskId, cityCode);
        await this.outbox.markEventFailed(connection, event.eventId, cityCode);
      });
      throw error;
    }

    await withTransaction(async (connection) => {
      await this.tasks.updateTaskQueued(
        connection,
        dispatchTaskId,
        cityCode,
        streamEntryId,
      );
      await this.outbox.markEventPublished(connection, event.eventId, cityCode);
    });

    const result = await this.tasks.findBySourceEventId(
      context,
      cityCode,
      event.eventId,
    );
    if (!result) {
      throw new Error("dispatch task not found after processing");
    }
    return result;
  }

  async runDispatchOutboxOnce(
    context: RequestContext,
    cityCode?: CityCode,
  ): Promise<{ processed: number; tasks: DispatchTask[] }> {
    const resolvedCity = cityCode ?? assertCityScopedContext(context);
    const events = await this.outbox.findPendingEventsByType(
      context,
      resolvedCity,
      "order.paid",
    );

    const tasks: DispatchTask[] = [];
    for (const event of events) {
      const task = await this.processPaidOrderEvent(context, event);
      tasks.push(task);
    }

    return { processed: tasks.length, tasks };
  }

  async listTasks(context: RequestContext, limit = 100): Promise<DispatchTask[]> {
    return executeCityScoped(context, (cityCode) =>
      this.tasks.listTasks(context, cityCode, limit),
    );
  }
}

export const dispatchService = new DispatchService();
