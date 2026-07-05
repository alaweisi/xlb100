import type { PoolConnection } from "mysql2/promise";
import type {
  RequestContext,
  SettlementBatch,
  SettlementConfirmedEventPayload,
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
  settlementRepository,
  SettlementRepository,
} from "./settlementRepository.js";
import { assertSettlementConfirmable } from "./settlementStateMachine.js";
import { recordLedgerAudit } from "../ledger/auditGate.js";
import type { LedgerSingleWriteFeeType } from "../ledger/ledgerRepository.js";

type TransactionRunner = <T>(callback: (connection: PoolConnection) => Promise<T>) => Promise<T>;

export class SettlementBatchNotFoundError extends Error {}
export class SettlementConfirmationError extends Error {}

export type SettlementConfirmationResult = {
  batch: SettlementBatch;
  idempotent: boolean;
};

function assertSnapshotIntegrity(batch: SettlementBatch, items: Awaited<ReturnType<SettlementRepository["lockBatchItems"]>>): void {
  if (items.length !== batch.itemCount || items.length === 0) {
    throw new SettlementConfirmationError("settlement batch item count mismatch");
  }
  if (items.some((item) => item.cityCode !== batch.cityCode || item.currency !== "CNY" || item.status !== "prepared")) {
    throw new SettlementConfirmationError("settlement batch items are not confirmable");
  }
  const totals = calculateSettlementTotals(items);
  if (
    totals.totalGrossAmount !== batch.totalGrossAmount ||
    totals.totalPlatformFee !== batch.totalPlatformFee ||
    totals.totalWorkerReceivable !== batch.totalWorkerReceivable
  ) {
    throw new SettlementConfirmationError("settlement batch amount snapshot mismatch");
  }
}

export class SettlementConfirmationService {
  constructor(
    private readonly repository: SettlementRepository = settlementRepository,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  async confirmBatch(context: RequestContext, batchId: string): Promise<SettlementConfirmationResult> {
    const cityCode = assertCityScopedContext(context);
    const confirmedBy = context.userId;
    if (!confirmedBy || confirmedBy.length > 64) {
      throw new SettlementConfirmationError("settlement confirmation requires a valid operator userId");
    }

    return this.transactionRunner(async (connection) => {
      const batch = await this.repository.findBatchForConfirmation(connection, cityCode, batchId);
      if (!batch) throw new SettlementBatchNotFoundError("settlement batch not found in city scope");
      if (batch.status === "confirmed") return { batch, idempotent: true };
      try {
        assertSettlementConfirmable(batch.status);
      } catch (error) {
        throw new SettlementConfirmationError(error instanceof Error ? error.message : "settlement batch cannot be confirmed");
      }

      const items = await this.repository.lockBatchItems(connection, cityCode, batchId);
      assertSnapshotIntegrity(batch, items);
      const confirmedAt = new Date(
        Math.max(
          Math.floor(Date.now() / 1000) * 1000,
          new Date(batch.preparedAt).getTime(),
        ),
      ).toISOString();
      await this.repository.markBatchConfirmed(connection, cityCode, batchId, confirmedAt, confirmedBy);

      const confirmed: SettlementBatch = {
        ...batch,
        status: "confirmed",
        confirmedAt,
        confirmedBy,
        updatedAt: confirmedAt,
      };
      for (const item of items) {
        const auditAmounts: [LedgerSingleWriteFeeType, number][] = [
          ["gross", item.grossAmount],
          ["platform_fee", item.platformFee],
          ["worker_receivable", item.workerReceivable],
        ];
        await recordLedgerAudit({
          connection,
          outbox: this.outbox,
          cityCode,
          sourceType: "settlement.confirmed",
          items: auditAmounts.map(([feeType, amount]) => ({
            orderId: item.orderId,
            feeType,
            aggregateType: "settlement_batch",
            aggregateId: batchId,
            snapshot: {
              city_code: cityCode,
              order_id: item.orderId,
              fee_type: feeType,
              source_type: "settlement.confirmed",
              accrual_id: item.accrualId,
              amount,
              currency: item.currency,
            },
          })),
        });
      }
      const payload: SettlementConfirmedEventPayload = {
        settlementBatchId: batchId,
        cityCode,
        currency: "CNY",
        itemCount: batch.itemCount,
        totalGrossAmount: batch.totalGrossAmount,
        totalPlatformFee: batch.totalPlatformFee,
        totalWorkerReceivable: batch.totalWorkerReceivable,
        confirmedAt,
        confirmedBy,
      };
      await this.outbox.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "settlement.confirmed",
        aggregateType: "settlement_batch",
        aggregateId: batchId,
        cityCode,
        payload: { ...payload },
      });
      return { batch: confirmed, idempotent: false };
    });
  }
}

export const settlementConfirmationService = new SettlementConfirmationService();
