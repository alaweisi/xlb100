import type { PoolConnection } from "mysql2/promise";
import type { CityCode, Fulfillment, RequestContext } from "@xlb/types";
import {
  completeFulfillmentSchema,
  startFulfillmentSchema,
} from "@xlb/validators";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../events/eventOutbox.js";
import {
  dispatchRepository,
  DispatchRepository,
} from "../dispatch/dispatchRepository.js";
import { generateEventId, generateFulfillmentConfirmationId } from "../events/eventIds.js";
import {
  buildFulfillmentCompletedPayload,
  buildFulfillmentStartedPayload,
} from "../events/fulfillmentEvents.js";
import {
  fulfillmentRepository,
  FulfillmentRepository,
} from "./fulfillmentRepository.js";
import { assertFulfillmentTransition } from "./fulfillmentStateMachine.js";
import {
  fulfillmentEvidenceRepository,
  type FulfillmentEvidenceRepository,
} from "./evidence/fulfillmentEvidenceRepository.js";

export class FulfillmentNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(fulfillmentId: string) {
    super(`Fulfillment not found: ${fulfillmentId}`);
    this.name = "FulfillmentNotFoundError";
  }
}

export class FulfillmentValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "FulfillmentValidationError";
  }
}

export type FulfillmentLifecycleResult = {
  fulfillment: Fulfillment;
  idempotent: boolean;
};

type TransactionRunner = <T>(
  callback: (connection: PoolConnection) => Promise<T>,
) => Promise<T>;

export class FulfillmentService {
  constructor(
    private readonly repository: FulfillmentRepository = fulfillmentRepository,
    private readonly outboxRepository: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
    private readonly now: () => Date = () => new Date(),
    private readonly dispatchStatusRepository?: DispatchRepository,
    private readonly evidenceRepository?: FulfillmentEvidenceRepository,
  ) {}

  async startFulfillment(
    context: RequestContext,
    fulfillmentId: string,
    body: unknown,
  ): Promise<FulfillmentLifecycleResult> {
    const parsed = startFulfillmentSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new FulfillmentValidationError(parsed.error.message);
    }
    const { cityCode, workerId } = this.resolveWorkerScope(context);

    return this.transactionRunner(async (connection) => {
      const fulfillment = await this.repository.findByIdForWorkerForUpdate(
        connection,
        fulfillmentId,
        cityCode,
        workerId,
      );
      if (!fulfillment) {
        throw new FulfillmentNotFoundError(fulfillmentId);
      }
      if (fulfillment.status === "in_progress") {
        return { fulfillment, idempotent: true };
      }

      assertFulfillmentTransition(fulfillment.status, "in_progress");
      const startedAtDate = this.now();
      const startedAt = startedAtDate.toISOString();
      await this.repository.markStarted(
        connection,
        fulfillmentId,
        cityCode,
        workerId,
        startedAtDate,
      );
      await this.outboxRepository.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "fulfillment.started",
        aggregateType: "fulfillment",
        aggregateId: fulfillmentId,
        cityCode,
        payload: buildFulfillmentStartedPayload({
          fulfillmentId,
          acceptanceId: fulfillment.acceptanceId,
          dispatchTaskId: fulfillment.dispatchTaskId,
          orderId: fulfillment.orderId,
          cityCode,
          workerId,
          skuId: fulfillment.skuId,
          startedAt,
        }) as unknown as Record<string, unknown>,
      });

      return {
        fulfillment: {
          ...fulfillment,
          status: "in_progress",
          startedAt,
          updatedAt: startedAt,
        },
        idempotent: false,
      };
    });
  }

  async completeFulfillment(
    context: RequestContext,
    fulfillmentId: string,
    body: unknown,
  ): Promise<FulfillmentLifecycleResult> {
    const parsed = completeFulfillmentSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new FulfillmentValidationError(parsed.error.message);
    }
    const { cityCode, workerId } = this.resolveWorkerScope(context);

    return this.transactionRunner(async (connection) => {
      const fulfillment = await this.repository.findByIdForWorkerForUpdate(
        connection,
        fulfillmentId,
        cityCode,
        workerId,
      );
      if (!fulfillment) {
        throw new FulfillmentNotFoundError(fulfillmentId);
      }
      if (fulfillment.status === "completed") {
        await this.ensureCustomerConfirmation(connection, fulfillment, cityCode);
        return { fulfillment, idempotent: true };
      }

      assertFulfillmentTransition(fulfillment.status, "completed");
      const completedAtDate = this.now();
      const completedAt = completedAtDate.toISOString();
      const completionNote = parsed.data.completionNote ?? null;
      await this.repository.markCompleted(
        connection,
        fulfillmentId,
        cityCode,
        workerId,
        completedAtDate,
        completionNote,
      );
      await this.outboxRepository.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "fulfillment.completed",
        aggregateType: "fulfillment",
        aggregateId: fulfillmentId,
        cityCode,
        payload: buildFulfillmentCompletedPayload({
          fulfillmentId,
          acceptanceId: fulfillment.acceptanceId,
          dispatchTaskId: fulfillment.dispatchTaskId,
          orderId: fulfillment.orderId,
          cityCode,
          workerId,
          skuId: fulfillment.skuId,
          completedAt,
          completionNote,
        }) as unknown as Record<string, unknown>,
      });
      if (this.dispatchStatusRepository) {
        await this.dispatchStatusRepository.markCompleted(
          connection,
          fulfillment.dispatchTaskId,
          cityCode,
        );
        await this.dispatchStatusRepository.insertEvent(connection, {
          dispatchEventId: generateEventId(),
          dispatchTaskId: fulfillment.dispatchTaskId,
          cityCode,
          eventType: "TASK_COMPLETED",
          workerId,
          reason: "worker fulfillment completed",
        });
      }
      await this.ensureCustomerConfirmation(connection, fulfillment, cityCode);

      return {
        fulfillment: {
          ...fulfillment,
          status: "completed",
          completedAt,
          completionNote,
          updatedAt: completedAt,
        },
        idempotent: false,
      };
    });
  }

  async getFulfillmentForWorker(
    fulfillmentId: string,
    cityCode: CityCode,
    workerId: string,
  ): Promise<Fulfillment> {
    const fulfillment = await this.repository.findByIdForWorker(
      fulfillmentId,
      cityCode,
      workerId,
    );
    if (!fulfillment) {
      throw new FulfillmentNotFoundError(fulfillmentId);
    }
    return fulfillment;
  }

  async listFulfillmentsForWorker(
    workerId: string,
    cityCode: CityCode,
  ): Promise<Fulfillment[]> {
    return this.repository.listByWorker(workerId, cityCode);
  }

  async findByDispatchTaskId(
    dispatchTaskId: string,
    cityCode: CityCode,
  ): Promise<Fulfillment | null> {
    return this.repository.findByDispatchTaskId(dispatchTaskId, cityCode);
  }

  async findByAcceptanceId(
    acceptanceId: string,
    cityCode: CityCode,
  ): Promise<Fulfillment | null> {
    return this.repository.findByAcceptanceId(acceptanceId, cityCode);
  }

  private resolveWorkerScope(context: RequestContext): {
    cityCode: CityCode;
    workerId: string;
  } {
    const cityCode = assertCityScopedContext(context);
    if (!context.userId) {
      throw new FulfillmentValidationError("Missing worker userId");
    }
    return { cityCode, workerId: context.userId };
  }

  private async ensureCustomerConfirmation(
    connection: PoolConnection,
    fulfillment: Fulfillment,
    cityCode: CityCode,
  ): Promise<void> {
    if (!this.evidenceRepository) return;
    const result = await this.evidenceRepository.ensurePendingConfirmation(connection, {
      confirmationId: generateFulfillmentConfirmationId(),
      cityCode,
      fulfillmentId: fulfillment.fulfillmentId,
      orderId: fulfillment.orderId,
    });
    if (result.created) {
      await this.outboxRepository.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "fulfillment.customer_confirmation.pending",
        aggregateType: "fulfillment_confirmation",
        aggregateId: result.confirmationId,
        cityCode,
        payload: {
          confirmationId: result.confirmationId,
          fulfillmentId: fulfillment.fulfillmentId,
          orderId: fulfillment.orderId,
          externalProviderExecuted: false,
        },
      });
    }
  }
}

export const fulfillmentService = new FulfillmentService(
  fulfillmentRepository,
  eventOutboxRepository,
  withTransaction,
  () => new Date(),
  dispatchRepository,
  fulfillmentEvidenceRepository,
);
