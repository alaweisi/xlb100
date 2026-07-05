import type { PoolConnection } from "mysql2/promise";
import type {
  RequestContext,
  SettlementBatch,
  SettlementPayable,
  SettlementPayableEventPayload,
} from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import { generateEventId } from "../events/eventIds.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../events/eventOutbox.js";
import { calculateSettlementTotals } from "./settlementCalculator.js";
import { generateSettlementPayableId } from "./settlementIds.js";
import {
  settlementRepository,
  SettlementRepository,
} from "./settlementRepository.js";
import { assertSettlementPayableReady } from "./settlementStateMachine.js";
import { SettlementBatchNotFoundError } from "./settlementConfirmationService.js";
import { recordLedgerAudit } from "../ledger/auditGate.js";
import type { LedgerSingleWriteFeeType } from "../ledger/ledgerRepository.js";

type TransactionRunner = <T>(callback: (connection: PoolConnection) => Promise<T>) => Promise<T>;

export class SettlementPayableError extends Error {}

export type SettlementPayableResult = {
  payable: SettlementPayable;
  idempotent: boolean;
};

function assertPayableSnapshotIntegrity(
  batch: SettlementBatch,
  items: Awaited<ReturnType<SettlementRepository["lockBatchItems"]>>,
): void {
  if (items.length !== batch.itemCount || items.length === 0) {
    throw new SettlementPayableError("settlement batch item count mismatch");
  }
  if (
    items.some(
      (item) =>
        item.cityCode !== batch.cityCode ||
        item.currency !== "CNY" ||
        item.status !== "confirmed",
    )
  ) {
    throw new SettlementPayableError("settlement batch items are not payable-ready");
  }
  const totals = calculateSettlementTotals(items);
  if (
    totals.totalGrossAmount !== batch.totalGrossAmount ||
    totals.totalPlatformFee !== batch.totalPlatformFee ||
    totals.totalWorkerReceivable !== batch.totalWorkerReceivable
  ) {
    throw new SettlementPayableError("settlement batch amount snapshot mismatch");
  }
}

export class SettlementPayableService {
  constructor(
    private readonly repository: SettlementRepository = settlementRepository,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  async markSettlementPayable(context: RequestContext, batchId: string): Promise<SettlementPayableResult> {
    const cityCode = assertCityScopedContext(context);
    const markedBy = context.userId;
    if (!markedBy || markedBy.length > 64) {
      throw new SettlementPayableError("settlement payable readiness requires a valid operator userId");
    }

    return this.transactionRunner(async (connection) => {
      const batch = await this.repository.findBatchForUpdate(connection, cityCode, batchId);
      if (!batch) throw new SettlementBatchNotFoundError("settlement batch not found in city scope");

      const existing = await this.repository.findPayableForBatch(connection, cityCode, batchId);
      if (existing) return { payable: existing, idempotent: true };

      try {
        assertSettlementPayableReady(batch.status);
      } catch (error) {
        throw new SettlementPayableError(error instanceof Error ? error.message : "settlement batch cannot be marked payable");
      }

      const items = await this.repository.lockBatchItems(connection, cityCode, batchId);
      assertPayableSnapshotIntegrity(batch, items);

      const markedAt = new Date(
        Math.max(
          Math.floor(Date.now() / 1000) * 1000,
          batch.confirmedAt ? new Date(batch.confirmedAt).getTime() : 0,
        ),
      ).toISOString();

      const payable: SettlementPayable = {
        settlementPayableId: generateSettlementPayableId(),
        cityCode,
        settlementBatchId: batchId,
        currency: "CNY",
        grossAmount: batch.totalGrossAmount,
        platformFeeAmount: batch.totalPlatformFee,
        workerReceivableAmount: batch.totalWorkerReceivable,
        itemCount: batch.itemCount,
        status: "payable",
        markedAt,
        markedBy,
        createdAt: markedAt,
        updatedAt: markedAt,
      };

      await this.repository.insertPayable(connection, payable);
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
          sourceType: "settlement.payable",
          items: auditAmounts.map(([feeType, amount]) => ({
            orderId: item.orderId,
            feeType,
            aggregateType: "settlement_payable",
            aggregateId: payable.settlementPayableId,
            snapshot: {
              city_code: cityCode,
              order_id: item.orderId,
              fee_type: feeType,
              source_type: "settlement.payable",
              accrual_id: item.accrualId,
              amount,
              currency: item.currency,
            },
          })),
        });
      }

      const payload: SettlementPayableEventPayload = {
        payableId: payable.settlementPayableId,
        batchId,
        cityCode,
        currency: "CNY",
        grossAmount: payable.grossAmount,
        platformFeeAmount: payable.platformFeeAmount,
        workerReceivableAmount: payable.workerReceivableAmount,
        itemCount: payable.itemCount,
        markedAt,
        markedBy,
      };

      await this.outbox.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "settlement.payable",
        aggregateType: "settlement_payable",
        aggregateId: payable.settlementPayableId,
        cityCode,
        payload: { ...payload },
      });

      return { payable, idempotent: false };
    });
  }

  async getPayableByBatch(context: RequestContext, batchId: string): Promise<SettlementPayable | null> {
    const cityCode = assertCityScopedContext(context);
    return this.repository.getPayableByBatch(context, cityCode, batchId);
  }
}

export const settlementPayableService = new SettlementPayableService();
