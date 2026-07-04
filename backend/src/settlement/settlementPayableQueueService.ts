import type { PoolConnection } from "mysql2/promise";
import type {
  RequestContext,
  SettlementPayable,
  SettlementPayableQueue,
  SettlementPayableQueuedEventPayload,
} from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import { generateEventId } from "../events/eventIds.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../events/eventOutbox.js";
import { generateSettlementPayableQueueId } from "./settlementIds.js";
import {
  settlementRepository,
  SettlementRepository,
} from "./settlementRepository.js";
import {
  assertSettlementPayableEnqueueable,
  canMarkSettlementPayable,
} from "./settlementStateMachine.js";

type TransactionRunner = <T>(callback: (connection: PoolConnection) => Promise<T>) => Promise<T>;

export class SettlementPayableNotFoundError extends Error {}
export class SettlementPayableQueueError extends Error {}

export type SettlementPayableQueueResult = {
  queue: SettlementPayableQueue;
  idempotent: boolean;
};

function assertPayableQueueSnapshotIntegrity(payable: SettlementPayable, batchStatus: string): void {
  if (payable.status !== "payable") {
    throw new SettlementPayableQueueError("settlement payable is not enqueueable");
  }
  if (!canMarkSettlementPayable(batchStatus as "confirmed")) {
    throw new SettlementPayableQueueError("settlement batch is not confirmed");
  }
}

export class SettlementPayableQueueService {
  constructor(
    private readonly repository: SettlementRepository = settlementRepository,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  async enqueueSettlementPayable(context: RequestContext, payableId: string): Promise<SettlementPayableQueueResult> {
    const cityCode = assertCityScopedContext(context);
    const enqueuedBy = context.userId;
    if (!enqueuedBy || enqueuedBy.length > 64) {
      throw new SettlementPayableQueueError("settlement payable queue requires a valid operator userId");
    }

    return this.transactionRunner(async (connection) => {
      const payable = await this.repository.findPayableByIdForEnqueue(connection, cityCode, payableId);
      if (!payable) throw new SettlementPayableNotFoundError("settlement payable not found in city scope");

      const existing = await this.repository.findQueueForPayable(connection, cityCode, payableId);
      if (existing) return { queue: existing, idempotent: true };

      try {
        assertSettlementPayableEnqueueable(payable.status);
      } catch (error) {
        throw new SettlementPayableQueueError(error instanceof Error ? error.message : "settlement payable cannot be enqueued");
      }

      const batch = await this.repository.findBatchForUpdate(connection, cityCode, payable.settlementBatchId);
      if (!batch) throw new SettlementPayableQueueError("settlement batch not found for payable");
      assertPayableQueueSnapshotIntegrity(payable, batch.status);

      if (
        payable.grossAmount !== batch.totalGrossAmount ||
        payable.platformFeeAmount !== batch.totalPlatformFee ||
        payable.workerReceivableAmount !== batch.totalWorkerReceivable ||
        payable.itemCount !== batch.itemCount
      ) {
        throw new SettlementPayableQueueError("settlement payable amount snapshot mismatch");
      }

      const enqueuedAt = new Date(
        Math.max(
          Math.floor(Date.now() / 1000) * 1000,
          new Date(payable.markedAt).getTime(),
        ),
      ).toISOString();

      const queue: SettlementPayableQueue = {
        queueId: generateSettlementPayableQueueId(),
        cityCode,
        settlementPayableId: payableId,
        settlementBatchId: payable.settlementBatchId,
        currency: "CNY",
        grossAmount: payable.grossAmount,
        platformFeeAmount: payable.platformFeeAmount,
        workerReceivableAmount: payable.workerReceivableAmount,
        itemCount: payable.itemCount,
        status: "queued",
        enqueuedAt,
        enqueuedBy,
        createdAt: enqueuedAt,
        updatedAt: enqueuedAt,
      };

      await this.repository.insertPayableQueue(connection, queue);

      const payload: SettlementPayableQueuedEventPayload = {
        queueId: queue.queueId,
        payableId,
        batchId: payable.settlementBatchId,
        cityCode,
        currency: "CNY",
        grossAmount: queue.grossAmount,
        platformFeeAmount: queue.platformFeeAmount,
        workerReceivableAmount: queue.workerReceivableAmount,
        itemCount: queue.itemCount,
        enqueuedAt,
        enqueuedBy,
      };

      await this.outbox.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "settlement.payable.queued",
        aggregateType: "settlement_payable_queue",
        aggregateId: queue.queueId,
        cityCode,
        payload: { ...payload },
      });

      return { queue, idempotent: false };
    });
  }

  async getQueueByPayable(context: RequestContext, payableId: string): Promise<SettlementPayableQueue | null> {
    const cityCode = assertCityScopedContext(context);
    return this.repository.getQueueByPayable(context, cityCode, payableId);
  }
}

export const settlementPayableQueueService = new SettlementPayableQueueService();
