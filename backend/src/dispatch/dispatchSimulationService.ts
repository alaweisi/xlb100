import type {
  CityCode,
  DispatchEvent,
  DispatchTask,
  RequestContext,
} from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import {
  generateDispatchOfferId,
  generateEventId,
} from "../events/eventIds.js";
import {
  dispatchRepository,
  DispatchRepository,
} from "./dispatchRepository.js";
import { workerLocationService, WorkerLocationService } from "./workerLocationService.js";

const OFFER_BATCH_SIZE = 3;
const DEFAULT_TIMEOUT_MINUTES = 15;
const CUSTOMER_WAITING_MESSAGE = "正在寻找服务人员";

export class DispatchSimulationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "DispatchSimulationError";
    this.statusCode = statusCode;
  }
}

export type DispatchSimulationRunResult = {
  processed: number;
  tasks: DispatchTask[];
};

export class DispatchSimulationService {
  constructor(
    private readonly repository: DispatchRepository = dispatchRepository,
    private readonly locations: WorkerLocationService = workerLocationService,
  ) {}

  async matchOpenTasksOnce(
    context: RequestContext,
    limit = 50,
  ): Promise<DispatchSimulationRunResult> {
    const cityCode = assertCityScopedContext(context);
    const tasks = await this.repository.listTasksForMatching(context, cityCode, limit);
    const changed: DispatchTask[] = [];

    for (const task of tasks) {
      const updated = await this.matchOneTask(context, cityCode, task);
      if (updated) changed.push(updated);
    }

    return { processed: changed.length, tasks: changed };
  }

  async matchDispatchTaskOnce(
    context: RequestContext,
    dispatchTaskId: string,
  ): Promise<DispatchSimulationRunResult> {
    const cityCode = assertCityScopedContext(context);
    const task = await this.repository.findByDispatchTaskId(
      context,
      cityCode,
      dispatchTaskId,
    );
    if (!task) {
      throw new DispatchSimulationError(`Dispatch task not found: ${dispatchTaskId}`, 404);
    }
    if (task.status !== "queued" && task.status !== "reassigning") {
      return { processed: 0, tasks: [task] };
    }

    const updated = await this.matchOneTask(context, cityCode, task);
    return { processed: updated ? 1 : 0, tasks: updated ? [updated] : [] };
  }

  async rejectOffer(
    context: RequestContext,
    dispatchTaskId: string,
    reason = "worker rejected offer",
  ): Promise<DispatchTask> {
    const { cityCode, workerId, task } = await this.resolveWorkerTask(
      context,
      dispatchTaskId,
    );

    const offer = await this.repository.findOfferForWorker(
      context,
      cityCode,
      dispatchTaskId,
      workerId,
    );
    if (!offer || offer.status !== "offering") {
      throw new DispatchSimulationError("No active dispatch offer for worker", 409);
    }

    await withTransaction(async (connection) => {
      const marked = await this.repository.markOfferRejected(
        connection,
        dispatchTaskId,
        cityCode,
        workerId,
      );
      if (!marked) {
        throw new DispatchSimulationError("Dispatch offer is no longer active", 409);
      }
      await this.repository.insertEvent(connection, {
        dispatchEventId: generateEventId(),
        dispatchTaskId,
        cityCode,
        eventType: "WORKER_REJECTED",
        workerId,
        reason,
      });
    });

    await this.reassignIfAllOffersClosed(context, cityCode, task, reason);
    const refreshed = await this.repository.findByDispatchTaskId(
      context,
      cityCode,
      dispatchTaskId,
    );
    if (!refreshed) {
      throw new DispatchSimulationError("Dispatch task disappeared after reject", 500);
    }
    return refreshed;
  }

  async simulateWorkerTimeout(
    context: RequestContext,
    dispatchTaskId: string,
  ): Promise<DispatchTask> {
    const { cityCode, workerId, task } = await this.resolveWorkerTask(
      context,
      dispatchTaskId,
    );

    await this.timeoutOffer(context, cityCode, task, workerId, "simulated worker timeout");
    const refreshed = await this.repository.findByDispatchTaskId(
      context,
      cityCode,
      dispatchTaskId,
    );
    if (!refreshed) {
      throw new DispatchSimulationError("Dispatch task disappeared after timeout", 500);
    }
    return refreshed;
  }

  async runTimeoutOnce(
    context: RequestContext,
    timeoutMinutes = DEFAULT_TIMEOUT_MINUTES,
  ): Promise<DispatchSimulationRunResult> {
    const cityCode = assertCityScopedContext(context);
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    const offers = await this.repository.listTimedOutOffers(context, cityCode, cutoff);
    const changedTaskIds = new Set<string>();

    for (const offer of offers) {
      const task = await this.repository.findByDispatchTaskId(
        context,
        cityCode,
        offer.dispatchTaskId,
      );
      if (!task) continue;
      await this.timeoutOffer(
        context,
        cityCode,
        task,
        offer.workerId,
        `no response for ${timeoutMinutes} minutes`,
      );
      changedTaskIds.add(task.dispatchTaskId);
    }

    const tasks: DispatchTask[] = [];
    for (const dispatchTaskId of changedTaskIds) {
      const task = await this.repository.findByDispatchTaskId(
        context,
        cityCode,
        dispatchTaskId,
      );
      if (task) tasks.push(task);
    }

    return { processed: tasks.length, tasks };
  }

  async listEvents(
    context: RequestContext,
    cityCode: CityCode,
    dispatchTaskId: string,
  ): Promise<DispatchEvent[]> {
    return this.repository.listEventsByDispatchTask(context, cityCode, dispatchTaskId);
  }

  private async timeoutOffer(
    context: RequestContext,
    cityCode: CityCode,
    task: DispatchTask,
    workerId: string,
    reason: string,
  ): Promise<void> {
    await withTransaction(async (connection) => {
      const marked = await this.repository.markOfferTimeout(
        connection,
        task.dispatchTaskId,
        cityCode,
        workerId,
      );
      if (!marked) {
        throw new DispatchSimulationError("Dispatch offer is no longer active", 409);
      }
      await this.repository.insertEvent(connection, {
        dispatchEventId: generateEventId(),
        dispatchTaskId: task.dispatchTaskId,
        cityCode,
        eventType: "OFFER_TIMEOUT",
        workerId,
        reason,
      });
    });

    await this.reassignIfAllOffersClosed(context, cityCode, task, reason);
  }

  private async matchOneTask(
    context: RequestContext,
    cityCode: CityCode,
    task: DispatchTask,
  ): Promise<DispatchTask | null> {
    const activeOffers = await this.repository.listActiveOffersForTask(
      context,
      cityCode,
      task.dispatchTaskId,
    );
    if (activeOffers.length > 0) {
      return null;
    }

    const previousWorkerIds = await this.repository.listOfferWorkerIdsForTask(
      context,
      cityCode,
      task.dispatchTaskId,
    );
    const candidates = await this.locations.rankCandidates(context,task,previousWorkerIds,OFFER_BATCH_SIZE);

    if (candidates.length === 0) {
      await withTransaction(async (connection) => {
        await this.repository.markNoMatch(
          connection,
          task.dispatchTaskId,
          cityCode,
          CUSTOMER_WAITING_MESSAGE,
        );
        await this.repository.insertEvent(connection, {
          dispatchEventId: generateEventId(),
          dispatchTaskId: task.dispatchTaskId,
          cityCode,
          eventType: "NO_MATCH",
          reason: CUSTOMER_WAITING_MESSAGE,
        });
      });
      return this.repository.findByDispatchTaskId(context, cityCode, task.dispatchTaskId);
    }

    await withTransaction(async (connection) => {
      const marked = await this.repository.markOffering(
        connection,
        task.dispatchTaskId,
        cityCode,
        `offered to ${candidates.length} candidate worker(s)`,
      );
      if (!marked) return;

      for (const candidate of candidates) {
        await this.repository.createOffer(connection, {
          offerId: generateDispatchOfferId(),
          dispatchTaskId: task.dispatchTaskId,
          cityCode,
          workerId: candidate.workerId,
          distanceKm: candidate.distanceKm,
          etaMinutes: candidate.etaMinutes,
          rankScore: candidate.rankScore,
          geoProviderEnvelope: candidate.envelope,
        });
        await this.repository.insertEvent(connection, {
          dispatchEventId: generateEventId(),
          dispatchTaskId: task.dispatchTaskId,
          cityCode,
          eventType: "OFFER_CREATED",
          workerId: candidate.workerId,
          reason:
            candidate.distanceKm === null
              ? "candidate matched without distance"
              : `candidate distance ${candidate.distanceKm.toFixed(2)}km`,
        });
      }
    });

    return this.repository.findByDispatchTaskId(context, cityCode, task.dispatchTaskId);
  }

  private async reassignIfAllOffersClosed(
    context: RequestContext,
    cityCode: CityCode,
    task: DispatchTask,
    reason: string,
  ): Promise<void> {
    const activeOffers = await this.repository.listActiveOffersForTask(
      context,
      cityCode,
      task.dispatchTaskId,
    );
    if (activeOffers.length > 0) {
      return;
    }

    const latest = await this.repository.findByDispatchTaskId(
      context,
      cityCode,
      task.dispatchTaskId,
    );
    if (!latest) return;

    if ((latest.attemptCount ?? 0) >= (latest.maxAttempts ?? 3)) {
      await withTransaction(async (connection) => {
        await this.repository.markManualReview(
          connection,
          task.dispatchTaskId,
          cityCode,
          reason,
        );
        await this.repository.insertEvent(connection, {
          dispatchEventId: generateEventId(),
          dispatchTaskId: task.dispatchTaskId,
          cityCode,
          eventType: "MANUAL_REVIEW",
          reason,
        });
      });
      return;
    }

    await withTransaction(async (connection) => {
      await this.repository.markReassigning(
        connection,
        task.dispatchTaskId,
        cityCode,
        reason,
      );
      await this.repository.insertEvent(connection, {
        dispatchEventId: generateEventId(),
        dispatchTaskId: task.dispatchTaskId,
        cityCode,
        eventType: "REASSIGNING",
        reason,
      });
    });

    await this.matchDispatchTaskOnce(context, task.dispatchTaskId);
  }

  private async resolveWorkerTask(
    context: RequestContext,
    dispatchTaskId: string,
  ): Promise<{ cityCode: CityCode; workerId: string; task: DispatchTask }> {
    const cityCode = assertCityScopedContext(context);
    if (!context.userId) {
      throw new DispatchSimulationError("Missing worker userId", 403);
    }

    const task = await this.repository.findByDispatchTaskId(
      context,
      cityCode,
      dispatchTaskId,
    );
    if (!task) {
      throw new DispatchSimulationError(`Dispatch task not found: ${dispatchTaskId}`, 404);
    }
    if (!["offering", "reassigning"].includes(task.status)) {
      throw new DispatchSimulationError(
        `Dispatch task is not offering, current status=${task.status}`,
        409,
      );
    }

    return { cityCode, workerId: context.userId, task };
  }
}

export const dispatchSimulationService = new DispatchSimulationService();
