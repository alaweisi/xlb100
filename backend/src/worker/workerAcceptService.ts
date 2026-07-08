import type { CityCode, Fulfillment, RequestContext, WorkerTaskAcceptance } from "@xlb/types";
import { workerAcceptBodySchema } from "@xlb/validators";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import {
  dispatchRepository,
  DispatchRepository,
} from "../dispatch/dispatchRepository.js";
import {
  workerDispatchEligibilityService,
  WorkerDispatchEligibilityService,
} from "../compliance/certMatcher/workerDispatchEligibility.js";
import {
  workerService,
} from "./workerService.js";
import {
  workerAcceptRepository,
  WorkerAcceptRepository,
} from "./workerAcceptRepository.js";
import {
  fulfillmentRepository,
  FulfillmentRepository,
} from "../fulfillment/fulfillmentRepository.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../events/eventOutbox.js";
import {
  generateAcceptanceId,
  generateEventId,
  generateFulfillmentId,
} from "../events/eventIds.js";
import {
  buildDispatchAcceptedPayload,
  buildFulfillmentCreatedPayload,
} from "../events/acceptEvents.js";
import { canRetryAcceptForWorker } from "./workerAcceptIdempotency.js";

export class AcceptValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "AcceptValidationError";
  }
}

export class DispatchTaskNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(dispatchTaskId: string) {
    super(`Dispatch task not found: ${dispatchTaskId}`);
    this.name = "DispatchTaskNotFoundError";
  }
}

export class WorkerNotEligibleError extends Error {
  readonly statusCode = 403;

  constructor(reasons: string[]) {
    super(
      reasons.length > 0
        ? `Worker not eligible: ${reasons.join("; ")}`
        : "Worker not eligible for this task",
    );
    this.name = "WorkerNotEligibleError";
  }
}

export class TaskAlreadyAcceptedError extends Error {
  readonly statusCode = 409;

  constructor(dispatchTaskId: string) {
    super(`Dispatch task already accepted: ${dispatchTaskId}`);
    this.name = "TaskAlreadyAcceptedError";
  }
}

export class InvalidDispatchTaskStatusError extends Error {
  readonly statusCode = 409;

  constructor(status: string) {
    super(`Dispatch task cannot be accepted, current status=${status}`);
    this.name = "InvalidDispatchTaskStatusError";
  }
}

export type AcceptTaskResult = {
  acceptance: WorkerTaskAcceptance;
  fulfillment: Fulfillment;
  idempotent: boolean;
};

export class WorkerAcceptService {
  constructor(
    private readonly dispatchRepo: DispatchRepository = dispatchRepository,
    private readonly acceptRepo: WorkerAcceptRepository = workerAcceptRepository,
    private readonly fulfillmentRepo: FulfillmentRepository = fulfillmentRepository,
    private readonly eligibilityService: WorkerDispatchEligibilityService = workerDispatchEligibilityService,
    private readonly outboxRepo: EventOutboxRepository = eventOutboxRepository,
  ) {}

  async acceptTask(
    context: RequestContext,
    dispatchTaskId: string,
    body: unknown,
  ): Promise<AcceptTaskResult> {
    const parsed = workerAcceptBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new AcceptValidationError(parsed.error.message);
    }

    const cityCode = assertCityScopedContext(context);
    if (!context.userId) {
      throw new AcceptValidationError("Missing worker userId");
    }
    const workerId = context.userId;

    await workerService.assertWorkerBoundToCity(workerId, cityCode);

    const task = await this.dispatchRepo.findByDispatchTaskId(
      context,
      cityCode,
      dispatchTaskId,
    );
    if (!task) {
      throw new DispatchTaskNotFoundError(dispatchTaskId);
    }

    const existingAcceptance = await this.acceptRepo.findByDispatchTaskId(
      dispatchTaskId,
      cityCode,
    );
    if (existingAcceptance) {
      return this.buildIdempotentResult(existingAcceptance, workerId, cityCode);
    }

    const eligibility = await this.eligibilityService.computeEligibility(
      workerId,
      cityCode,
      task.skuId,
    );
    if (!eligibility.isEligible) {
      throw new WorkerNotEligibleError(eligibility.reasons);
    }

    if (task.status === "accepted") {
      const lateAcceptance = await this.acceptRepo.findByDispatchTaskId(
        dispatchTaskId,
        cityCode,
      );
      if (lateAcceptance) {
        return this.buildIdempotentResult(lateAcceptance, workerId, cityCode);
      }
      throw new TaskAlreadyAcceptedError(dispatchTaskId);
    }

    const isOfferBasedAccept = task.status === "offering";
    const workerOffer = isOfferBasedAccept
      ? await this.dispatchRepo.findOfferForWorker(
          context,
          cityCode,
          dispatchTaskId,
          workerId,
        )
      : null;
    const activeOffersBeforeAccept = isOfferBasedAccept
      ? await this.dispatchRepo.listActiveOffersForTask(
          context,
          cityCode,
          dispatchTaskId,
        )
      : [];

    if (isOfferBasedAccept && workerOffer?.status !== "offering") {
      throw new InvalidDispatchTaskStatusError("offering_without_worker_offer");
    }

    if (task.status !== "queued" && task.status !== "offering") {
      throw new InvalidDispatchTaskStatusError(task.status);
    }

    const acceptanceId = generateAcceptanceId();
    const fulfillmentId = generateFulfillmentId();
    const acceptedAt = new Date().toISOString();

    try {
      await withTransaction(async (connection) => {
        if (workerOffer) {
          const offerMarked = await this.dispatchRepo.markOfferAccepted(
            connection,
            dispatchTaskId,
            cityCode,
            workerId,
          );
          if (!offerMarked) {
            throw new TaskAlreadyAcceptedError(dispatchTaskId);
          }
        }

        const marked = await this.dispatchRepo.markAccepted(
          connection,
          dispatchTaskId,
          cityCode,
        );
        if (!marked) {
          throw new TaskAlreadyAcceptedError(dispatchTaskId);
        }

        if (workerOffer) {
          await this.dispatchRepo.markOtherOffersCancelled(
            connection,
            dispatchTaskId,
            cityCode,
            workerId,
          );
        }

        await this.acceptRepo.insert(connection, {
          acceptanceId,
          dispatchTaskId,
          cityCode,
          orderId: task.orderId,
          workerId,
          skuId: task.skuId,
        });

        await this.fulfillmentRepo.insertSkeleton(connection, {
          fulfillmentId,
          acceptanceId,
          dispatchTaskId,
          orderId: task.orderId,
          cityCode,
          workerId,
          skuId: task.skuId,
        });

        await this.outboxRepo.insertEvent(connection, {
          eventId: generateEventId(),
          eventType: "dispatch.accepted",
          aggregateType: "dispatch_task",
          aggregateId: dispatchTaskId,
          cityCode,
          payload: buildDispatchAcceptedPayload({
            acceptanceId,
            dispatchTaskId,
            orderId: task.orderId,
            cityCode,
            workerId,
            skuId: task.skuId,
            acceptedAt,
          }) as unknown as Record<string, unknown>,
        });

        await this.outboxRepo.insertEvent(connection, {
          eventId: generateEventId(),
          eventType: "fulfillment.created",
          aggregateType: "fulfillment",
          aggregateId: fulfillmentId,
          cityCode,
          payload: buildFulfillmentCreatedPayload({
            fulfillmentId,
            acceptanceId,
            dispatchTaskId,
            orderId: task.orderId,
            cityCode,
            workerId,
            skuId: task.skuId,
            status: "accepted",
          }) as unknown as Record<string, unknown>,
        });

        await this.dispatchRepo.insertEvent(connection, {
          dispatchEventId: generateEventId(),
          dispatchTaskId,
          cityCode,
          eventType: "WORKER_ACCEPTED",
          workerId,
          reason: workerOffer
            ? "worker accepted dispatch offer"
            : "worker accepted open queued task",
        });

        for (const offer of activeOffersBeforeAccept) {
          if (offer.workerId === workerId) continue;
          await this.dispatchRepo.insertEvent(connection, {
            dispatchEventId: generateEventId(),
            dispatchTaskId,
            cityCode,
            eventType: "OFFER_CANCELLED",
            workerId: offer.workerId,
            reason: `accepted by ${workerId}`,
          });
        }
      });
    } catch (error) {
      if (error instanceof TaskAlreadyAcceptedError) {
        const raced = await this.acceptRepo.findByDispatchTaskId(
          dispatchTaskId,
          cityCode,
        );
        if (raced) {
          return this.buildIdempotentResult(raced, workerId, cityCode);
        }
      }
      throw error;
    }

    const acceptance = await this.acceptRepo.findByDispatchTaskId(
      dispatchTaskId,
      cityCode,
    );
    const fulfillment = await this.fulfillmentRepo.findByDispatchTaskId(
      dispatchTaskId,
      cityCode,
    );
    if (!acceptance || !fulfillment) {
      throw new Error("Failed to load accept result");
    }

    return { acceptance, fulfillment, idempotent: false };
  }

  private async buildIdempotentResult(
    acceptance: WorkerTaskAcceptance,
    workerId: string,
    cityCode: CityCode,
  ): Promise<AcceptTaskResult> {
    const dispatchTaskId = acceptance.dispatchTaskId;
    if (canRetryAcceptForWorker(acceptance, workerId)) {
      const fulfillment = await this.fulfillmentRepo.findByAcceptanceId(
        acceptance.acceptanceId,
        cityCode,
      );
      if (!fulfillment) {
        throw new Error("Acceptance exists without fulfillment");
      }
      return { acceptance, fulfillment, idempotent: true };
    }
    throw new TaskAlreadyAcceptedError(dispatchTaskId);
  }
}

export const workerAcceptService = new WorkerAcceptService();

export {
  WorkerNotFoundError,
  WorkerCityBindingError,
} from "./workerService.js";
