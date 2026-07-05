import type { PoolConnection } from "mysql2/promise";
import type {
  EventOutbox,
  LedgerAccrual,
  LedgerEntry,
  RequestContext,
} from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import {
  eventOutboxRepository,
  EventOutboxRepository,
} from "../events/eventOutbox.js";
import {
  generateLedgerAccrualId,
  generateLedgerEntryId,
} from "../events/eventIds.js";
import { calculateLedgerAccrual } from "./ledgerCalculator.js";
import {
  ledgerRepository,
  LedgerRepository,
  type LedgerSingleWriteKey,
  type LedgerSingleWriteFeeType,
} from "./ledgerRepository.js";
import { recordLedgerAudit } from "./auditGate.js";

export class LedgerAccrualError extends Error {}

export type LedgerAccrualResult = {
  accrual: LedgerAccrual;
  entries: LedgerEntry[];
  idempotent: boolean;
};

type TransactionRunner = <T>(
  callback: (connection: PoolConnection) => Promise<T>,
) => Promise<T>;

export class LedgerAccrualService {
  constructor(
    private readonly repository: LedgerRepository = ledgerRepository,
    private readonly outboxRepository: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  async accrue(
    context: RequestContext,
    event: EventOutbox,
  ): Promise<LedgerAccrualResult> {
    const cityCode = assertCityScopedContext(context);
    if (event.eventType !== "fulfillment.completed") {
      throw new LedgerAccrualError(
        `ledger only consumes fulfillment.completed, got ${event.eventType}`,
      );
    }
    if (event.cityCode !== cityCode) {
      throw new LedgerAccrualError("event city mismatch");
    }

    const fulfillmentId = String(
      event.payload.fulfillmentId ?? event.aggregateId,
    );
    if (fulfillmentId !== event.aggregateId) {
      throw new LedgerAccrualError("event fulfillment mismatch");
    }

    return this.transactionRunner(async (connection) => {
      const existing = await this.repository.findAccrualByEvent(
        connection,
        cityCode,
        event.eventId,
      );
      if (existing) {
        await this.outboxRepository.markEventPublished(
          connection,
          event.eventId,
          cityCode,
        );
        return { accrual: existing, entries: [], idempotent: true };
      }

      const snapshot = await this.repository.loadSnapshot(
        connection,
        cityCode,
        fulfillmentId,
      );
      if (!snapshot) {
        throw new LedgerAccrualError("completed fulfillment snapshot not found");
      }
      if (snapshot.currency !== "CNY") {
        throw new LedgerAccrualError("ledger currency must be CNY");
      }

      const sourceType = "fulfillment.completed" as const;
      const singleWriteKeys: LedgerSingleWriteKey[] = [
        { orderId: snapshot.orderId, feeType: "gross", sourceType },
        { orderId: snapshot.orderId, feeType: "platform_fee", sourceType },
        { orderId: snapshot.orderId, feeType: "worker_receivable", sourceType },
      ];
      for (const key of singleWriteKeys) {
        const existingForOrderFee =
          await this.repository.findAccrualBySingleWriteKey(
            connection,
            cityCode,
            key,
          );
        if (existingForOrderFee) {
          await this.outboxRepository.markEventPublished(
            connection,
            event.eventId,
            cityCode,
          );
          return {
            accrual: existingForOrderFee,
            entries: [],
            idempotent: true,
          };
        }
      }

      const amounts = calculateLedgerAccrual(snapshot.grossAmount);
      const createdAt = new Date().toISOString();
      const customerAccountId = await this.repository.ensureAccount(
        connection,
        cityCode,
        "customer",
        snapshot.customerId,
      );
      const platformAccountId = await this.repository.ensureAccount(
        connection,
        cityCode,
        "platform",
        "platform",
      );
      const workerAccountId = await this.repository.ensureAccount(
        connection,
        cityCode,
        "worker",
        snapshot.workerId,
      );

      const accrual: LedgerAccrual = {
        accrualId: generateLedgerAccrualId(),
        cityCode,
        fulfillmentId: snapshot.fulfillmentId,
        orderId: snapshot.orderId,
        paymentOrderId: snapshot.paymentOrderId,
        workerId: snapshot.workerId,
        customerId: snapshot.customerId,
        skuId: snapshot.skuId,
        ...amounts,
        sourceEventId: event.eventId,
        status: "accrued",
        createdAt,
      };
      await this.repository.insertAccrual(connection, accrual);

      await recordLedgerAudit({
        connection,
        outbox: this.outboxRepository,
        cityCode,
        sourceType: "ledger.accrued",
        items: [
          {
            orderId: snapshot.orderId,
            feeType: "gross",
            aggregateType: "ledger_accrual",
            aggregateId: accrual.accrualId,
            snapshot: {
              city_code: cityCode,
              order_id: snapshot.orderId,
              fee_type: "gross",
              source_type: "ledger.accrued",
              accrual_id: accrual.accrualId,
              fulfillment_id: snapshot.fulfillmentId,
              amount: amounts.grossAmount,
              currency: accrual.currency,
            },
          },
          {
            orderId: snapshot.orderId,
            feeType: "platform_fee",
            aggregateType: "ledger_accrual",
            aggregateId: accrual.accrualId,
            snapshot: {
              city_code: cityCode,
              order_id: snapshot.orderId,
              fee_type: "platform_fee",
              source_type: "ledger.accrued",
              accrual_id: accrual.accrualId,
              fulfillment_id: snapshot.fulfillmentId,
              amount: amounts.platformFee,
              currency: accrual.currency,
            },
          },
          {
            orderId: snapshot.orderId,
            feeType: "worker_receivable",
            aggregateType: "ledger_accrual",
            aggregateId: accrual.accrualId,
            snapshot: {
              city_code: cityCode,
              order_id: snapshot.orderId,
              fee_type: "worker_receivable",
              source_type: "ledger.accrued",
              accrual_id: accrual.accrualId,
              fulfillment_id: snapshot.fulfillmentId,
              amount: amounts.workerReceivable,
              currency: accrual.currency,
            },
          },
        ],
      });

      const entryBase = {
        cityCode,
        sourceType,
        sourceId: snapshot.fulfillmentId,
        currency: "CNY" as const,
        createdAt,
      };
      const entries: LedgerEntry[] = [
        {
          ...entryBase,
          entryId: generateLedgerEntryId(),
          accountId: customerAccountId,
          accountType: "customer",
          ownerId: snapshot.customerId,
          direction: "debit",
          amount: amounts.grossAmount,
          description: "Customer service consumption accrued",
        },
        {
          ...entryBase,
          entryId: generateLedgerEntryId(),
          accountId: platformAccountId,
          accountType: "platform",
          ownerId: "platform",
          direction: "credit",
          amount: amounts.platformFee,
          description: "Platform fee accrued",
        },
        {
          ...entryBase,
          entryId: generateLedgerEntryId(),
          accountId: workerAccountId,
          accountType: "worker",
          ownerId: snapshot.workerId,
          direction: "credit",
          amount: amounts.workerReceivable,
          description: "Worker receivable accrued",
        },
      ];
      const feeTypes: LedgerSingleWriteFeeType[] = [
        "gross",
        "platform_fee",
        "worker_receivable",
      ];
      for (const [index, entry] of entries.entries()) {
        await this.repository.insertEntry(connection, entry);
        const feeType = feeTypes[index]!;
        await recordLedgerAudit({
          connection,
          outbox: this.outboxRepository,
          cityCode,
          sourceType,
          items: [{
            orderId: snapshot.orderId,
            feeType,
            aggregateType: "ledger_entry",
            aggregateId: entry.entryId,
            snapshot: {
              city_code: cityCode,
              order_id: snapshot.orderId,
              fee_type: feeType,
              source_type: sourceType,
              source_id: snapshot.fulfillmentId,
              amount: entry.amount,
              currency: entry.currency,
            },
          }],
        });
      }
      await this.outboxRepository.markEventPublished(
        connection,
        event.eventId,
        cityCode,
      );
      return { accrual, entries, idempotent: false };
    });
  }
}

export const ledgerAccrualService = new LedgerAccrualService();
