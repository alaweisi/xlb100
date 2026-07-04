import type { PoolConnection } from "mysql2/promise";
import type {
  RequestContext,
  SettlementBatch,
  SettlementPayable,
  SettlementPayableQueue,
  WorkerReceivableStatement,
  WorkerReceivableStatementReview,
  WorkerReceivableStatementReviewDecision,
  WorkerReceivableStatementReviewedEventPayload,
} from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import { generateEventId } from "../events/eventIds.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../events/eventOutbox.js";
import { generateWorkerReceivableStatementReviewId } from "./settlementIds.js";
import {
  settlementRepository,
  SettlementRepository,
} from "./settlementRepository.js";
import {
  assertWorkerReceivableStatementReviewable,
  canMarkSettlementPayable,
} from "./settlementStateMachine.js";
import {
  workerReceivableStatementRepository,
  WorkerReceivableStatementRepository,
} from "./workerReceivableStatementRepository.js";
import {
  workerReceivableStatementReviewRepository,
  WorkerReceivableStatementReviewRepository,
} from "./workerReceivableStatementReviewRepository.js";

type TransactionRunner = <T>(callback: (connection: PoolConnection) => Promise<T>) => Promise<T>;

export class WorkerReceivableStatementReviewNotFoundError extends Error {}
export class WorkerReceivableStatementReviewError extends Error {}

export type ReviewWorkerReceivableStatementOnceInput = {
  decision: WorkerReceivableStatementReviewDecision;
  reviewNote?: string | null;
};

export type ReviewWorkerReceivableStatementOnceResult = {
  review: WorkerReceivableStatementReview;
  idempotent: boolean;
};

function assertReviewContextIntegrity(
  statement: WorkerReceivableStatement,
  queue: SettlementPayableQueue,
  payable: SettlementPayable,
  batch: SettlementBatch,
): void {
  try {
    assertWorkerReceivableStatementReviewable(statement.status);
  } catch (error) {
    throw new WorkerReceivableStatementReviewError(
      error instanceof Error ? error.message : "worker receivable statement cannot be reviewed",
    );
  }
  if (queue.status !== "queued") {
    throw new WorkerReceivableStatementReviewError("settlement payable queue is not queued");
  }
  if (payable.status !== "payable") {
    throw new WorkerReceivableStatementReviewError("settlement payable is not payable");
  }
  if (!canMarkSettlementPayable(batch.status)) {
    throw new WorkerReceivableStatementReviewError("settlement batch is not confirmed");
  }
  if (
    statement.queueId !== queue.queueId ||
    statement.settlementPayableId !== payable.settlementPayableId ||
    statement.settlementBatchId !== batch.settlementBatchId ||
    queue.settlementPayableId !== payable.settlementPayableId ||
    queue.settlementBatchId !== batch.settlementBatchId
  ) {
    throw new WorkerReceivableStatementReviewError("worker receivable statement context mismatch");
  }
}

export class WorkerReceivableStatementReviewService {
  constructor(
    private readonly settlementRepo: SettlementRepository = settlementRepository,
    private readonly statementRepo: WorkerReceivableStatementRepository = workerReceivableStatementRepository,
    private readonly reviewRepo: WorkerReceivableStatementReviewRepository = workerReceivableStatementReviewRepository,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  async reviewWorkerReceivableStatementOnce(
    context: RequestContext,
    statementId: string,
    input: ReviewWorkerReceivableStatementOnceInput,
  ): Promise<ReviewWorkerReceivableStatementOnceResult> {
    const cityCode = assertCityScopedContext(context);
    const reviewedBy = context.userId;
    if (!reviewedBy || reviewedBy.length > 64) {
      throw new WorkerReceivableStatementReviewError("worker receivable statement review requires a valid operator userId");
    }
    const reviewNote = input.reviewNote?.trim() ? input.reviewNote.trim().slice(0, 512) : null;

    return this.transactionRunner(async (connection) => {
      const locked = await this.reviewRepo.findStatementForReview(connection, cityCode, statementId);
      if (!locked) throw new WorkerReceivableStatementReviewNotFoundError("worker receivable statement not found in city scope");

      const statement = await this.statementRepo.getStatementById(context, cityCode, statementId);
      if (!statement) throw new WorkerReceivableStatementReviewNotFoundError("worker receivable statement not found in city scope");

      const existing = await this.reviewRepo.findReviewByStatement(connection, cityCode, statementId);
      if (existing) {
        if (existing.decision !== input.decision) {
          throw new WorkerReceivableStatementReviewError("worker receivable statement review decision conflict");
        }
        return { review: existing, idempotent: true };
      }

      const payable = await this.settlementRepo.findPayableByIdForEnqueue(connection, cityCode, statement.settlementPayableId);
      if (!payable) throw new WorkerReceivableStatementReviewError("settlement payable not found for statement review");

      const queue = await this.settlementRepo.findQueueForPayable(connection, cityCode, statement.settlementPayableId);
      if (!queue) throw new WorkerReceivableStatementReviewError("settlement payable queue not found for statement review");

      const batch = await this.settlementRepo.findBatchForUpdate(connection, cityCode, statement.settlementBatchId);
      if (!batch) throw new WorkerReceivableStatementReviewError("settlement batch not found for statement review");

      assertReviewContextIntegrity(statement, queue, payable, batch);

      const reviewedAt = new Date(
        Math.max(
          Math.floor(Date.now() / 1000) * 1000,
          new Date(statement.generatedAt).getTime(),
        ),
      ).toISOString();

      const review: WorkerReceivableStatementReview = {
        reviewId: generateWorkerReceivableStatementReviewId(),
        cityCode,
        statementId: statement.statementId,
        queueId: statement.queueId,
        settlementPayableId: statement.settlementPayableId,
        settlementBatchId: statement.settlementBatchId,
        workerId: statement.workerId,
        decision: input.decision,
        reviewNote,
        reviewedAt,
        reviewedBy,
        createdAt: reviewedAt,
        updatedAt: reviewedAt,
      };

      await this.reviewRepo.insertReview(connection, review);

      const payload: WorkerReceivableStatementReviewedEventPayload = {
        reviewId: review.reviewId,
        statementId: review.statementId,
        queueId: review.queueId,
        payableId: review.settlementPayableId,
        batchId: review.settlementBatchId,
        cityCode,
        workerId: review.workerId,
        decision: review.decision,
        reviewNote: review.reviewNote,
        reviewedAt,
        reviewedBy,
      };

      await this.outbox.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "worker.receivable.statement.reviewed",
        aggregateType: "worker_receivable_statement_review",
        aggregateId: review.reviewId,
        cityCode,
        payload: { ...payload },
      });

      return { review, idempotent: false };
    });
  }

  async getWorkerReceivableStatementReview(
    context: RequestContext,
    statementId: string,
  ): Promise<WorkerReceivableStatementReview | null> {
    const cityCode = assertCityScopedContext(context);
    const statement = await this.statementRepo.getStatementById(context, cityCode, statementId);
    if (!statement) return null;
    return this.reviewRepo.getReviewByStatement(context, cityCode, statementId);
  }
}

export const workerReceivableStatementReviewService = new WorkerReceivableStatementReviewService();
