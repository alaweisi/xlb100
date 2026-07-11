import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import type { CityCode, DispatchTask, EventOutbox, RequestContext } from "@xlb/types";
import { orderCreatedEventPayloadSchema } from "@xlb/validators";
import { withTransaction } from "../dal/transaction.js";
import { executeCityScoped, assertCityScopedContext } from "../dal/scopedExecutor.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
  type OutboxClaim,
} from "../events/eventOutbox.js";
import { generateDispatchTaskId, generateEventId } from "../events/eventIds.js";
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

  private async acknowledgeEvent(connection: PoolConnection, event: EventOutbox): Promise<void> {
    if (event.status === "processing") {
      if (!event.leaseOwner || !event.leaseToken || !event.leaseExpiresAt || event.attemptCount === undefined || event.maxAttempts === undefined) {
        throw new Error("processing outbox event is missing lease metadata");
      }
      if (!(await this.outbox.acknowledgeClaim(connection, event as OutboxClaim))) {
        throw new Error("outbox claim was lost before dispatch acknowledgement");
      }
      return;
    }
    await this.outbox.markEventPublished(connection, event.eventId, event.cityCode);
  }

  async processOrderCreatedEvent(
    context: RequestContext,
    event: EventOutbox,
  ): Promise<DispatchTask> {
    if (event.eventType !== "order.created") {
      throw new DispatchValidationError(
        `dispatch only consumes order.created, got ${event.eventType}`,
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
      if (existing.status !== "pending" && existing.status !== "failed") {
        await withTransaction(async (connection) => {
          await this.acknowledgeEvent(connection, event);
        });
        return existing;
      }
      if (existing.status === "failed" || existing.status === "pending") {
        const streamEntryId = await this.publisher.publish(existing);
        await withTransaction(async (connection) => {
          await this.tasks.updateTaskQueued(connection, existing.dispatchTaskId, cityCode, streamEntryId);
          await this.tasks.insertEvent(connection, {
            dispatchEventId: generateEventId(),
            dispatchTaskId: existing.dispatchTaskId,
            cityCode,
            eventType: "TASK_QUEUED",
            reason: "outbox retry recovered failed dispatch publish",
          });
          await this.acknowledgeEvent(connection, event);
        });
        return (await this.tasks.findBySourceEventId(context, cityCode, event.eventId))!;
      }
    }

    const payload = orderCreatedEventPayloadSchema.parse(event.payload);
    if (payload.cityCode !== cityCode) {
      throw new DispatchValidationError("payload cityCode mismatch");
    }

    const existingByOrder = await this.tasks.findByOrderId(context, cityCode, payload.orderId);
    if (existingByOrder) {
      if (event.status === "pending" || event.status === "processing") {
        await withTransaction(async (connection) => {
          await this.acknowledgeEvent(connection, event);
        });
      }
      return existingByOrder;
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
          amount: payload.totalAmount,
          sourceEventId: event.eventId,
          streamName,
        });
      });
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        const raced =
          (await this.tasks.findBySourceEventId(context, cityCode, event.eventId)) ??
          (await this.tasks.findByOrderId(context, cityCode, payload.orderId));
        if (raced) {
          if (event.status === "pending" || event.status === "processing") {
            await withTransaction(async (connection) => {
              await this.acknowledgeEvent(connection, event);
            });
          }
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
        if (event.status === "pending" || event.status === "processing") {
          await withTransaction(async (connection) => {
            await this.acknowledgeEvent(connection, event);
          });
        }
        return pendingTask;
      }
      streamEntryId = await this.publisher.publish(pendingTask);
    } catch (error) {
      await withTransaction(async (connection) => {
        await this.tasks.updateTaskFailed(connection, dispatchTaskId, cityCode);
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
      await this.tasks.insertEvent(connection, {
        dispatchEventId: generateEventId(),
        dispatchTaskId,
        cityCode,
        eventType: "TASK_QUEUED",
        reason: "order created dispatch task",
      });
      await this.acknowledgeEvent(connection, event);
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
    const events = await this.outbox.claimOrderCreatedForDispatch(
      context,
      resolvedCity,
      `dispatch:${randomUUID()}`,
    );

    const tasks: DispatchTask[] = [];
    for (const event of events) {
      try {
        if (!(await this.outbox.renewClaim(event))) continue;
        const task = await this.processOrderCreatedEvent(context, event);
        tasks.push(task);
      } catch (error) {
        await this.outbox.failClaim(event, error);
      }
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
