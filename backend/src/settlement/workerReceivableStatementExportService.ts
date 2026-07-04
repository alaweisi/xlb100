import type { PoolConnection } from "mysql2/promise";
import type {
  RequestContext,
  SettlementBatch,
  SettlementPayable,
  SettlementPayableQueue,
  WorkerReceivableStatement,
  WorkerReceivableStatementExport,
  WorkerReceivableStatementExportFormat,
  WorkerReceivableStatementExportedEventPayload,
  WorkerReceivableStatementExportPayloadVersion,
  WorkerReceivableStatementReview,
} from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import { generateEventId } from "../events/eventIds.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../events/eventOutbox.js";
import { generateWorkerReceivableStatementExportId } from "./settlementIds.js";
import {
  settlementRepository,
  SettlementRepository,
} from "./settlementRepository.js";
import {
  assertWorkerReceivableStatementExportable,
  canMarkSettlementPayable,
} from "./settlementStateMachine.js";
import { computeWorkerReceivableStatementExportContentHash } from "./workerReceivableStatementExportHash.js";
import {
  workerReceivableStatementExportRepository,
  WorkerReceivableStatementExportRepository,
} from "./workerReceivableStatementExportRepository.js";
import {
  workerReceivableStatementRepository,
  WorkerReceivableStatementRepository,
} from "./workerReceivableStatementRepository.js";
import {
  workerReceivableStatementReviewRepository,
  WorkerReceivableStatementReviewRepository,
} from "./workerReceivableStatementReviewRepository.js";

type TransactionRunner = <T>(callback: (connection: PoolConnection) => Promise<T>) => Promise<T>;

const DEFAULT_EXPORT_FORMAT: WorkerReceivableStatementExportFormat = "internal_v1";
const DEFAULT_PAYLOAD_VERSION: WorkerReceivableStatementExportPayloadVersion = "v1";

export class WorkerReceivableStatementExportNotFoundError extends Error {}
export class WorkerReceivableStatementExportError extends Error {}

export type ExportWorkerReceivableStatementOnceInput = {
  exportFormat?: WorkerReceivableStatementExportFormat;
};

export type ExportWorkerReceivableStatementOnceResult = {
  export: WorkerReceivableStatementExport;
  idempotent: boolean;
};

function assertExportContextIntegrity(
  statement: WorkerReceivableStatement,
  review: WorkerReceivableStatementReview,
  queue: SettlementPayableQueue,
  payable: SettlementPayable,
  batch: SettlementBatch,
): void {
  try {
    assertWorkerReceivableStatementExportable(statement.status, review.decision);
  } catch (error) {
    throw new WorkerReceivableStatementExportError(
      error instanceof Error ? error.message : "worker receivable statement cannot be exported",
    );
  }
  if (queue.status !== "queued") {
    throw new WorkerReceivableStatementExportError("settlement payable queue is not queued");
  }
  if (payable.status !== "payable") {
    throw new WorkerReceivableStatementExportError("settlement payable is not payable");
  }
  if (!canMarkSettlementPayable(batch.status)) {
    throw new WorkerReceivableStatementExportError("settlement batch is not confirmed");
  }
  if (
    statement.queueId !== review.queueId ||
    statement.settlementPayableId !== review.settlementPayableId ||
    statement.settlementBatchId !== review.settlementBatchId ||
    statement.workerId !== review.workerId ||
    queue.settlementPayableId !== payable.settlementPayableId ||
    queue.settlementBatchId !== batch.settlementBatchId
  ) {
    throw new WorkerReceivableStatementExportError("worker receivable statement export context mismatch");
  }
}

export class WorkerReceivableStatementExportService {
  constructor(
    private readonly settlementRepo: SettlementRepository = settlementRepository,
    private readonly statementRepo: WorkerReceivableStatementRepository = workerReceivableStatementRepository,
    private readonly reviewRepo: WorkerReceivableStatementReviewRepository = workerReceivableStatementReviewRepository,
    private readonly exportRepo: WorkerReceivableStatementExportRepository = workerReceivableStatementExportRepository,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  async exportWorkerReceivableStatementOnce(
    context: RequestContext,
    statementId: string,
    input: ExportWorkerReceivableStatementOnceInput = {},
  ): Promise<ExportWorkerReceivableStatementOnceResult> {
    const cityCode = assertCityScopedContext(context);
    const exportedBy = context.userId;
    if (!exportedBy || exportedBy.length > 64) {
      throw new WorkerReceivableStatementExportError("worker receivable statement export requires a valid operator userId");
    }
    const exportFormat = input.exportFormat ?? DEFAULT_EXPORT_FORMAT;
    if (exportFormat !== DEFAULT_EXPORT_FORMAT) {
      throw new WorkerReceivableStatementExportError("unsupported worker receivable statement export format");
    }

    return this.transactionRunner(async (connection) => {
      const locked = await this.exportRepo.lockStatementForExport(connection, cityCode, statementId);
      if (!locked) throw new WorkerReceivableStatementExportNotFoundError("worker receivable statement not found in city scope");

      const statement = await this.statementRepo.getStatementById(context, cityCode, statementId);
      if (!statement) throw new WorkerReceivableStatementExportNotFoundError("worker receivable statement not found in city scope");

      const existing = await this.exportRepo.findExportByStatement(connection, cityCode, statementId);
      if (existing) return { export: existing, idempotent: true };

      const review = await this.reviewRepo.findReviewByStatement(connection, cityCode, statementId);
      if (!review) {
        throw new WorkerReceivableStatementExportError("worker receivable statement review not found for export");
      }
      if (review.decision !== "approved") {
        throw new WorkerReceivableStatementExportError("worker receivable statement review is not approved for export");
      }

      const payable = await this.settlementRepo.findPayableByIdForEnqueue(connection, cityCode, statement.settlementPayableId);
      if (!payable) throw new WorkerReceivableStatementExportError("settlement payable not found for statement export");

      const queue = await this.settlementRepo.findQueueForPayable(connection, cityCode, statement.settlementPayableId);
      if (!queue) throw new WorkerReceivableStatementExportError("settlement payable queue not found for statement export");

      const batch = await this.settlementRepo.findBatchForUpdate(connection, cityCode, statement.settlementBatchId);
      if (!batch) throw new WorkerReceivableStatementExportError("settlement batch not found for statement export");

      assertExportContextIntegrity(statement, review, queue, payable, batch);

      const payloadVersion = DEFAULT_PAYLOAD_VERSION;
      const contentHash = computeWorkerReceivableStatementExportContentHash({
        statementId: statement.statementId,
        reviewId: review.reviewId,
        exportFormat,
        payloadVersion,
        grossAmount: statement.grossAmount,
        platformFeeAmount: statement.platformFeeAmount,
        workerReceivableAmount: statement.workerReceivableAmount,
        itemCount: statement.itemCount,
      });

      const exportedAt = new Date(
        Math.max(
          Math.floor(Date.now() / 1000) * 1000,
          new Date(review.reviewedAt).getTime(),
        ),
      ).toISOString();

      const exportRecord: WorkerReceivableStatementExport = {
        exportId: generateWorkerReceivableStatementExportId(),
        cityCode,
        statementId: statement.statementId,
        reviewId: review.reviewId,
        queueId: statement.queueId,
        settlementPayableId: statement.settlementPayableId,
        settlementBatchId: statement.settlementBatchId,
        workerId: statement.workerId,
        exportFormat,
        payloadVersion,
        contentHash,
        exportedAt,
        exportedBy,
        createdAt: exportedAt,
        updatedAt: exportedAt,
      };

      await this.exportRepo.insertExport(connection, exportRecord);

      const payload: WorkerReceivableStatementExportedEventPayload = {
        exportId: exportRecord.exportId,
        statementId: exportRecord.statementId,
        reviewId: exportRecord.reviewId,
        queueId: exportRecord.queueId,
        payableId: exportRecord.settlementPayableId,
        batchId: exportRecord.settlementBatchId,
        cityCode,
        workerId: exportRecord.workerId,
        exportFormat: exportRecord.exportFormat,
        payloadVersion: exportRecord.payloadVersion,
        contentHash: exportRecord.contentHash,
        exportedAt,
        exportedBy,
      };

      await this.outbox.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "worker.receivable.statement.exported",
        aggregateType: "worker_receivable_statement_export",
        aggregateId: exportRecord.exportId,
        cityCode,
        payload: { ...payload },
      });

      return { export: exportRecord, idempotent: false };
    });
  }

  async getWorkerReceivableStatementExport(
    context: RequestContext,
    statementId: string,
  ): Promise<WorkerReceivableStatementExport | null> {
    const cityCode = assertCityScopedContext(context);
    const statement = await this.statementRepo.getStatementById(context, cityCode, statementId);
    if (!statement) return null;
    return this.exportRepo.getExportByStatement(context, cityCode, statementId);
  }
}

export const workerReceivableStatementExportService = new WorkerReceivableStatementExportService();
