import type { PoolConnection } from "mysql2/promise";
import type {
  RequestContext,
  SettlementBatch,
  SettlementItem,
  SettlementPreparedEventPayload,
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
  generateSettlementBatchId,
  generateSettlementItemId,
} from "./settlementIds.js";
import {
  settlementRepository,
  SettlementRepository,
} from "./settlementRepository.js";
import { recordLedgerAudit } from "../ledger/auditGate.js";
import type { LedgerSingleWriteFeeType } from "../ledger/ledgerRepository.js";

type TransactionRunner = <T>(callback: (connection: PoolConnection) => Promise<T>) => Promise<T>;

export type SettlementPreparationResult = {
  processed: number;
  batch: SettlementBatch | null;
  items: SettlementItem[];
};

export class SettlementPreparationService {
  constructor(
    private readonly repository: SettlementRepository = settlementRepository,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  async prepareOnce(context: RequestContext): Promise<SettlementPreparationResult> {
    const cityCode = assertCityScopedContext(context);
    return this.transactionRunner(async (connection) => {
      const accruals = await this.repository.findUnpreparedAccruals(connection, cityCode);
      if (accruals.length === 0) return { processed: 0, batch: null, items: [] };
      if (accruals.some((row) => row.cityCode !== cityCode || row.status !== "accrued" || row.currency !== "CNY")) {
        throw new Error("invalid ledger accrual selected for settlement preparation");
      }

      const preparedAt = new Date().toISOString();
      const now = preparedAt;
      const totals = calculateSettlementTotals(accruals);
      const batch: SettlementBatch = {
        settlementBatchId: generateSettlementBatchId(),
        cityCode,
        ...totals,
        status: "prepared",
        preparedAt,
        confirmedAt: null,
        confirmedBy: null,
        createdAt: now,
        updatedAt: now,
      };
      const items: SettlementItem[] = accruals.map((accrual) => ({
        settlementItemId: generateSettlementItemId(),
        settlementBatchId: batch.settlementBatchId,
        cityCode,
        accrualId: accrual.accrualId,
        fulfillmentId: accrual.fulfillmentId,
        orderId: accrual.orderId,
        paymentOrderId: accrual.paymentOrderId,
        workerId: accrual.workerId,
        customerId: accrual.customerId,
        skuId: accrual.skuId,
        grossAmount: accrual.grossAmount,
        platformFee: accrual.platformFee,
        workerReceivable: accrual.workerReceivable,
        currency: "CNY",
        status: "prepared",
        createdAt: now,
        updatedAt: now,
      }));

      await this.repository.insertBatch(connection, batch);
      for (const item of items) {
        await this.repository.insertItem(connection, item);
        const auditAmounts: [LedgerSingleWriteFeeType, number][] = [
          ["gross", item.grossAmount],
          ["platform_fee", item.platformFee],
          ["worker_receivable", item.workerReceivable],
        ];
        await recordLedgerAudit({
          connection,
          outbox: this.outbox,
          cityCode,
          sourceType: "settlement.prepared",
          items: auditAmounts.map(([feeType, amount]) => ({
            orderId: item.orderId,
            feeType,
            aggregateType: "settlement_item",
            aggregateId: item.settlementItemId,
            snapshot: {
              city_code: cityCode,
              order_id: item.orderId,
              fee_type: feeType,
              source_type: "settlement.prepared",
              accrual_id: item.accrualId,
              amount,
              currency: item.currency,
            },
          })),
        });
      }
      const payload: SettlementPreparedEventPayload = {
        settlementBatchId: batch.settlementBatchId,
        cityCode,
        currency: "CNY",
        itemCount: batch.itemCount,
        totalGrossAmount: batch.totalGrossAmount,
        totalPlatformFee: batch.totalPlatformFee,
        totalWorkerReceivable: batch.totalWorkerReceivable,
        preparedAt,
      };
      await this.outbox.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "settlement.prepared",
        aggregateType: "settlement_batch",
        aggregateId: batch.settlementBatchId,
        cityCode,
        payload: { ...payload },
      });
      return { processed: items.length, batch, items };
    });
  }

  listBatches(context: RequestContext): Promise<SettlementBatch[]> {
    const cityCode = assertCityScopedContext(context);
    return this.repository.listBatches(context, cityCode);
  }

  listBatchItems(context: RequestContext, batchId: string): Promise<SettlementItem[] | null> {
    const cityCode = assertCityScopedContext(context);
    return this.repository.listBatchItems(context, cityCode, batchId);
  }
}

export const settlementPreparationService = new SettlementPreparationService();
