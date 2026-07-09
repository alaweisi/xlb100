import type { PoolConnection } from "mysql2/promise";
import type { EventOutbox, LedgerEntry, RequestContext } from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../events/eventOutbox.js";
import {
  generateLedgerEntryId,
  generateWorkerReceivableAdjustmentId,
} from "../events/eventIds.js";
import {
  workerFinanceRepository,
  WorkerFinanceRepository,
} from "../worker/workerFinanceRepository.js";
import { recordLedgerAudit } from "./auditGate.js";
import {
  ledgerRepository,
  LedgerRepository,
  type LedgerSingleWriteFeeType,
} from "./ledgerRepository.js";
import {
  ledgerReversalRepository,
  LedgerReversalRepository,
} from "./ledgerReversalRepository.js";

export class LedgerReversalError extends Error {}

export type LedgerReversalResult = {
  refundId: string;
  entries: LedgerEntry[];
  idempotent: boolean;
};

type TransactionRunner = <T>(
  callback: (connection: PoolConnection) => Promise<T>,
) => Promise<T>;

type RefundApprovedPayload = {
  refundId?: unknown;
  orderId?: unknown;
  fulfillmentId?: unknown;
  amount?: unknown;
  currency?: unknown;
};

function oppositeDirection(direction: LedgerEntry["direction"]): LedgerEntry["direction"] {
  return direction === "debit" ? "credit" : "debit";
}

function feeTypeForOriginalEntry(entry: LedgerEntry): LedgerSingleWriteFeeType {
  if (entry.accountType === "customer" && entry.direction === "debit") {
    return "gross";
  }
  if (entry.accountType === "platform" && entry.direction === "credit") {
    return "platform_fee";
  }
  if (entry.accountType === "worker" && entry.direction === "credit") {
    return "worker_receivable";
  }
  throw new LedgerReversalError("unsupported original ledger entry shape");
}

export class LedgerReversalService {
  constructor(
    private readonly reversalRepository: LedgerReversalRepository = ledgerReversalRepository,
    private readonly repository: LedgerRepository = ledgerRepository,
    private readonly outboxRepository: EventOutboxRepository = eventOutboxRepository,
    private readonly workerFinance: WorkerFinanceRepository = workerFinanceRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  async reverse(
    context: RequestContext,
    event: EventOutbox,
  ): Promise<LedgerReversalResult> {
    const cityCode = assertCityScopedContext(context);
    if (event.eventType !== "refund.approved") {
      throw new LedgerReversalError(
        `ledger reversal only consumes refund.approved, got ${event.eventType}`,
      );
    }
    if (event.cityCode !== cityCode) {
      throw new LedgerReversalError("event city mismatch");
    }

    const payload = event.payload as RefundApprovedPayload;
    const refundId = String(payload.refundId ?? event.aggregateId);
    const orderId = String(payload.orderId ?? "");
    const fulfillmentId = String(payload.fulfillmentId ?? "");
    if (!refundId || refundId !== event.aggregateId || !orderId || !fulfillmentId) {
      throw new LedgerReversalError("refund.approved payload is incomplete");
    }
    if (payload.currency !== "CNY") {
      throw new LedgerReversalError("ledger reversal currency must be CNY");
    }

    return this.transactionRunner(async (connection) => {
      const snapshot = await this.reversalRepository.loadSnapshotForRefund(
        connection,
        cityCode,
        fulfillmentId,
        orderId,
      );
      if (!snapshot) {
        throw new LedgerReversalError("refund reversal accrual snapshot not found");
      }
      if (Number(payload.amount) !== Number(snapshot.grossAmount.toFixed(2))) {
        throw new LedgerReversalError("refund amount must match accrued gross amount");
      }
      const workerFinanceAdjustment = {
        adjustmentId: generateWorkerReceivableAdjustmentId(),
        cityCode,
        refundId,
        sourceEventId: event.eventId,
        accrualId: snapshot.accrualId,
        fulfillmentId: snapshot.fulfillmentId,
        orderId: snapshot.orderId,
        paymentOrderId: snapshot.paymentOrderId,
        workerId: snapshot.workerId,
        customerId: snapshot.customerId,
        grossAdjustment: -snapshot.grossAmount,
        platformFeeAdjustment: -snapshot.platformFee,
        workerReceivableAdjustment: -snapshot.workerReceivable,
      };

      const existing =
        await this.reversalRepository.listExistingReversalEntriesForUpdate(
          connection,
          cityCode,
          fulfillmentId,
        );
      if (existing.length > 0) {
        await this.workerFinance.applyRefundAdjustment(
          connection,
          workerFinanceAdjustment,
        );
        await this.outboxRepository.markEventPublished(
          connection,
          event.eventId,
          cityCode,
        );
        return { refundId, entries: existing, idempotent: true };
      }

      const originalEntries =
        await this.reversalRepository.listOriginalEntriesForUpdate(
          connection,
          cityCode,
          fulfillmentId,
        );
      if (originalEntries.length !== 3) {
        throw new LedgerReversalError("refund reversal requires three original ledger entries");
      }

      const createdAt = new Date().toISOString();
      const entries: LedgerEntry[] = originalEntries.map((entry) => ({
        entryId: generateLedgerEntryId(),
        cityCode,
        accountId: entry.accountId,
        accountType: entry.accountType,
        ownerId: entry.ownerId,
        sourceType: "refund.approved",
        sourceId: fulfillmentId,
        direction: oppositeDirection(entry.direction),
        amount: entry.amount,
        currency: "CNY",
        description: `Refund reversal for ${refundId}`,
        createdAt,
      }));

      for (const [index, entry] of entries.entries()) {
        const originalEntry = originalEntries[index]!;
        const feeType = feeTypeForOriginalEntry(originalEntry);
        await this.repository.insertEntry(connection, entry);
        await recordLedgerAudit({
          connection,
          outbox: this.outboxRepository,
          cityCode,
          sourceType: "refund.approved",
          items: [{
            orderId,
            feeType,
            aggregateType: "ledger_entry",
            aggregateId: entry.entryId,
            snapshot: {
              city_code: cityCode,
              order_id: orderId,
              fee_type: feeType,
              source_type: "refund.approved",
              source_id: fulfillmentId,
              amount: entry.amount,
              currency: entry.currency,
            },
          }],
        });
      }

      await this.workerFinance.applyRefundAdjustment(
        connection,
        workerFinanceAdjustment,
      );
      await this.outboxRepository.markEventPublished(
        connection,
        event.eventId,
        cityCode,
      );
      return { refundId, entries, idempotent: false };
    });
  }
}

export const ledgerReversalService = new LedgerReversalService();
