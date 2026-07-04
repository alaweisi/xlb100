import type { PoolConnection } from "mysql2/promise";
import type {
  RequestContext,
  SettlementItem,
  SettlementPayable,
  SettlementPayableQueue,
  WorkerReceivableStatement,
  WorkerReceivableStatementCreatedEventPayload,
  WorkerReceivableStatementLine,
} from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import { generateEventId } from "../events/eventIds.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../events/eventOutbox.js";
import { calculateSettlementTotals } from "./settlementCalculator.js";
import {
  generateWorkerReceivableStatementId,
  generateWorkerReceivableStatementLineId,
} from "./settlementIds.js";
import {
  settlementRepository,
  SettlementRepository,
} from "./settlementRepository.js";
import {
  assertWorkerReceivableStatementGeneratable,
} from "./settlementStateMachine.js";
import {
  workerReceivableStatementRepository,
  WorkerReceivableStatementRepository,
} from "./workerReceivableStatementRepository.js";

type TransactionRunner = <T>(callback: (connection: PoolConnection) => Promise<T>) => Promise<T>;

export class WorkerReceivableStatementNotFoundError extends Error {}
export class WorkerReceivableStatementError extends Error {}

export type GenerateWorkerReceivableStatementsResult = {
  statements: WorkerReceivableStatement[];
  idempotent: boolean;
};

function groupItemsByWorker(items: SettlementItem[]): Map<string, SettlementItem[]> {
  const groups = new Map<string, SettlementItem[]>();
  for (const item of items) {
    const list = groups.get(item.workerId) ?? [];
    list.push(item);
    groups.set(item.workerId, list);
  }
  return groups;
}

function assertQueueSnapshotIntegrity(
  queue: SettlementPayableQueue,
  payable: SettlementPayable,
): void {
  if (queue.status !== "queued") {
    throw new WorkerReceivableStatementError("settlement payable queue is not queued");
  }
  if (payable.status !== "payable") {
    throw new WorkerReceivableStatementError("settlement payable is not payable");
  }
  if (
    queue.settlementPayableId !== payable.settlementPayableId ||
    queue.settlementBatchId !== payable.settlementBatchId ||
    queue.grossAmount !== payable.grossAmount ||
    queue.platformFeeAmount !== payable.platformFeeAmount ||
    queue.workerReceivableAmount !== payable.workerReceivableAmount ||
    queue.itemCount !== payable.itemCount
  ) {
    throw new WorkerReceivableStatementError("settlement payable queue snapshot mismatch");
  }
}

function assertItemsMatchQueue(
  queue: SettlementPayableQueue,
  items: SettlementItem[],
): void {
  if (items.length !== queue.itemCount || items.length === 0) {
    throw new WorkerReceivableStatementError("settlement item count mismatch for worker receivable statements");
  }
  if (
    items.some(
      (item) =>
        item.cityCode !== queue.cityCode ||
        item.settlementBatchId !== queue.settlementBatchId ||
        item.currency !== "CNY" ||
        item.status !== "confirmed",
    )
  ) {
    throw new WorkerReceivableStatementError("settlement items are not statement-ready");
  }
  const totals = calculateSettlementTotals(items);
  if (
    totals.totalGrossAmount !== queue.grossAmount ||
    totals.totalPlatformFee !== queue.platformFeeAmount ||
    totals.totalWorkerReceivable !== queue.workerReceivableAmount
  ) {
    throw new WorkerReceivableStatementError("settlement item amount snapshot mismatch");
  }
}

export class WorkerReceivableStatementService {
  constructor(
    private readonly settlementRepo: SettlementRepository = settlementRepository,
    private readonly statementRepo: WorkerReceivableStatementRepository = workerReceivableStatementRepository,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  async generateWorkerReceivableStatements(
    context: RequestContext,
    payableId: string,
  ): Promise<GenerateWorkerReceivableStatementsResult> {
    const cityCode = assertCityScopedContext(context);
    const generatedBy = context.userId;
    if (!generatedBy || generatedBy.length > 64) {
      throw new WorkerReceivableStatementError("worker receivable statement generation requires a valid operator userId");
    }

    return this.transactionRunner(async (connection) => {
      const payable = await this.settlementRepo.findPayableByIdForEnqueue(connection, cityCode, payableId);
      if (!payable) {
        throw new WorkerReceivableStatementNotFoundError("settlement payable not found in city scope");
      }

      const queue = await this.settlementRepo.findQueueForPayable(connection, cityCode, payableId);
      if (!queue) {
        throw new WorkerReceivableStatementNotFoundError("settlement payable queue not found in city scope");
      }

      const existing = await this.statementRepo.findStatementsByQueue(connection, cityCode, queue.queueId);
      if (existing.length > 0) {
        return { statements: existing, idempotent: true };
      }

      try {
        assertWorkerReceivableStatementGeneratable(queue.status);
      } catch (error) {
        throw new WorkerReceivableStatementError(
          error instanceof Error ? error.message : "settlement payable queue cannot generate worker receivable statements",
        );
      }

      assertQueueSnapshotIntegrity(queue, payable);

      const batch = await this.settlementRepo.findBatchForUpdate(connection, cityCode, queue.settlementBatchId);
      if (!batch || batch.status !== "confirmed") {
        throw new WorkerReceivableStatementError("settlement batch is not confirmed");
      }

      const items = await this.settlementRepo.lockBatchItems(connection, cityCode, queue.settlementBatchId);
      assertItemsMatchQueue(queue, items);

      const generatedAt = new Date(
        Math.max(
          Math.floor(Date.now() / 1000) * 1000,
          new Date(queue.enqueuedAt).getTime(),
        ),
      ).toISOString();

      const workerGroups = groupItemsByWorker(items);
      const statements: WorkerReceivableStatement[] = [];

      for (const [workerId, workerItems] of [...workerGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const totals = calculateSettlementTotals(workerItems);
        const statement: WorkerReceivableStatement = {
          statementId: generateWorkerReceivableStatementId(),
          cityCode,
          queueId: queue.queueId,
          settlementPayableId: payableId,
          settlementBatchId: queue.settlementBatchId,
          workerId,
          currency: "CNY",
          grossAmount: totals.totalGrossAmount,
          platformFeeAmount: totals.totalPlatformFee,
          workerReceivableAmount: totals.totalWorkerReceivable,
          itemCount: totals.itemCount,
          status: "created",
          generatedAt,
          generatedBy,
          createdAt: generatedAt,
          updatedAt: generatedAt,
        };

        await this.statementRepo.insertStatement(connection, statement);

        for (const item of workerItems) {
          const line: WorkerReceivableStatementLine = {
            lineId: generateWorkerReceivableStatementLineId(),
            statementId: statement.statementId,
            cityCode,
            settlementItemId: item.settlementItemId,
            settlementBatchId: item.settlementBatchId,
            workerId: item.workerId,
            orderId: item.orderId,
            fulfillmentId: item.fulfillmentId,
            skuId: item.skuId,
            currency: "CNY",
            grossAmount: item.grossAmount,
            platformFeeAmount: item.platformFee,
            workerReceivableAmount: item.workerReceivable,
            createdAt: generatedAt,
          };
          await this.statementRepo.insertStatementLine(connection, line);
        }

        const payload: WorkerReceivableStatementCreatedEventPayload = {
          statementId: statement.statementId,
          queueId: queue.queueId,
          payableId,
          batchId: queue.settlementBatchId,
          cityCode,
          workerId,
          currency: "CNY",
          grossAmount: statement.grossAmount,
          platformFeeAmount: statement.platformFeeAmount,
          workerReceivableAmount: statement.workerReceivableAmount,
          itemCount: statement.itemCount,
          generatedAt,
          generatedBy,
        };

        await this.outbox.insertEvent(connection, {
          eventId: generateEventId(),
          eventType: "worker.receivable.statement.created",
          aggregateType: "worker_receivable_statement",
          aggregateId: statement.statementId,
          cityCode,
          payload: { ...payload },
        });

        statements.push(statement);
      }

      return { statements, idempotent: false };
    });
  }

  async listWorkerReceivableStatementsByPayable(
    context: RequestContext,
    payableId: string,
  ): Promise<WorkerReceivableStatement[] | null> {
    const cityCode = assertCityScopedContext(context);
    return this.statementRepo.listStatementsByPayable(context, cityCode, payableId);
  }

  async getWorkerReceivableStatement(
    context: RequestContext,
    statementId: string,
  ): Promise<{ statement: WorkerReceivableStatement; lines: WorkerReceivableStatementLine[] } | null> {
    const cityCode = assertCityScopedContext(context);
    const statement = await this.statementRepo.getStatementById(context, cityCode, statementId);
    if (!statement) return null;
    const lines = await this.statementRepo.listStatementLines(context, cityCode, statementId);
    return { statement, lines };
  }
}

export const workerReceivableStatementService = new WorkerReceivableStatementService();
