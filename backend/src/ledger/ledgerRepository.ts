import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  LedgerAccountType,
  LedgerAccrual,
  LedgerEntry,
  RequestContext,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";
import { generateLedgerAccountId } from "../events/eventIds.js";

export type LedgerSnapshot = {
  fulfillmentId: string;
  orderId: string;
  paymentOrderId: string;
  workerId: string;
  customerId: string;
  skuId: string;
  grossAmount: number;
  currency: string;
};

type AccrualRow = RowDataPacket & {
  accrual_id: string;
  city_code: string;
  fulfillment_id: string;
  order_id: string;
  payment_order_id: string;
  worker_id: string;
  customer_id: string;
  sku_id: string;
  gross_amount: string;
  platform_fee: string;
  worker_receivable: string;
  currency: "CNY";
  source_event_id: string;
  status: string;
  created_at: Date;
};

export type LedgerSingleWriteFeeType =
  | "gross"
  | "platform_fee"
  | "worker_receivable";

export type LedgerSingleWriteKey = {
  orderId: string;
  feeType: LedgerSingleWriteFeeType;
  sourceType: "fulfillment.completed";
};

function mapAccrual(row: AccrualRow): LedgerAccrual {
  return {
    accrualId: row.accrual_id,
    cityCode: row.city_code as CityCode,
    fulfillmentId: row.fulfillment_id,
    orderId: row.order_id,
    paymentOrderId: row.payment_order_id,
    workerId: row.worker_id,
    customerId: row.customer_id,
    skuId: row.sku_id,
    grossAmount: Number(row.gross_amount),
    platformFee: Number(row.platform_fee),
    workerReceivable: Number(row.worker_receivable),
    currency: row.currency,
    sourceEventId: row.source_event_id,
    status: row.status as LedgerAccrual["status"],
    createdAt: row.created_at.toISOString(),
  };
}

export class LedgerRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async loadSnapshot(
    connection: PoolConnection,
    cityCode: CityCode,
    fulfillmentId: string,
  ): Promise<LedgerSnapshot | null> {
    const [rows] = await connection.query<
      (RowDataPacket & {
        fulfillment_id: string;
        order_id: string;
        payment_order_id: string;
        worker_id: string;
        customer_id: string;
        sku_id: string;
        total_amount: string;
        currency: string;
      })[]
    >(
      `SELECT f.fulfillment_id, f.order_id, p.payment_order_id, f.worker_id,
              o.customer_id, f.sku_id, o.total_amount, o.currency
       FROM fulfillments f
       JOIN orders o ON o.order_id = f.order_id AND o.city_code = f.city_code
       JOIN payment_orders p ON p.order_id = o.order_id AND p.city_code = o.city_code
       WHERE f.fulfillment_id = ? AND f.city_code = ?
         AND f.status = 'completed' AND o.status = 'paid' AND p.status = 'paid'
       LIMIT 1 FOR UPDATE`,
      [fulfillmentId, cityCode],
    );
    const row = rows[0];
    return row
      ? {
          fulfillmentId: row.fulfillment_id,
          orderId: row.order_id,
          paymentOrderId: row.payment_order_id,
          workerId: row.worker_id,
          customerId: row.customer_id,
          skuId: row.sku_id,
          grossAmount: Number(row.total_amount),
          currency: row.currency,
        }
      : null;
  }

  async ensureAccount(
    connection: PoolConnection,
    cityCode: CityCode,
    accountType: LedgerAccountType,
    ownerId: string,
  ): Promise<string> {
    await connection.query(
      `INSERT INTO ledger_accounts
        (account_id, city_code, account_type, owner_id, currency, status)
       VALUES (?, ?, ?, ?, 'CNY', 'active')
       ON DUPLICATE KEY UPDATE account_id = account_id`,
      [generateLedgerAccountId(), cityCode, accountType, ownerId],
    );
    const [rows] = await connection.query<
      (RowDataPacket & { account_id: string })[]
    >(
      `SELECT account_id FROM ledger_accounts
       WHERE city_code = ? AND account_type = ? AND owner_id = ?
         AND currency = 'CNY' LIMIT 1`,
      [cityCode, accountType, ownerId],
    );
    return rows[0]!.account_id;
  }

  async findAccrualByEvent(
    connection: PoolConnection,
    cityCode: CityCode,
    eventId: string,
  ): Promise<LedgerAccrual | null> {
    const [rows] = await connection.query<AccrualRow[]>(
      `SELECT * FROM ledger_accruals
       WHERE city_code = ? AND source_event_id = ? LIMIT 1`,
      [cityCode, eventId],
    );
    return rows[0] ? mapAccrual(rows[0]) : null;
  }

  async findAccrualBySingleWriteKey(
    connection: PoolConnection,
    cityCode: CityCode,
    key: LedgerSingleWriteKey,
  ): Promise<LedgerAccrual | null> {
    if (key.sourceType !== "fulfillment.completed") {
      throw new Error(`unsupported ledger source_type: ${key.sourceType}`);
    }
    if (!["gross", "platform_fee", "worker_receivable"].includes(key.feeType)) {
      throw new Error(`unsupported ledger fee_type: ${key.feeType}`);
    }
    const [rows] = await connection.query<AccrualRow[]>(
      `SELECT *
       FROM ledger_accruals
       WHERE city_code = ?
         AND order_id = ?
       LIMIT 1 FOR UPDATE`,
      [cityCode, key.orderId],
    );
    return rows[0] ? mapAccrual(rows[0]) : null;
  }

  async insertAccrual(
    connection: PoolConnection,
    accrual: LedgerAccrual,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO ledger_accruals
        (accrual_id, city_code, fulfillment_id, order_id, payment_order_id,
         worker_id, customer_id, sku_id, gross_amount, platform_fee,
         worker_receivable, currency, source_event_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accrued')`,
      [
        accrual.accrualId,
        accrual.cityCode,
        accrual.fulfillmentId,
        accrual.orderId,
        accrual.paymentOrderId,
        accrual.workerId,
        accrual.customerId,
        accrual.skuId,
        accrual.grossAmount,
        accrual.platformFee,
        accrual.workerReceivable,
        accrual.currency,
        accrual.sourceEventId,
      ],
    );
  }

  async insertEntry(
    connection: PoolConnection,
    entry: LedgerEntry,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO ledger_entries
        (entry_id, city_code, account_id, account_type, owner_id, source_type,
         source_id, direction, amount, currency, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CNY', ?)`,
      [
        entry.entryId,
        entry.cityCode,
        entry.accountId,
        entry.accountType,
        entry.ownerId,
        entry.sourceType,
        entry.sourceId,
        entry.direction,
        entry.amount,
        entry.description,
      ],
    );
  }

  async listAccruals(
    context: RequestContext,
    cityCode: CityCode,
    limit = 100,
  ): Promise<LedgerAccrual[]> {
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in ledger query");
    }
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<AccrualRow[]>(
      `SELECT * FROM ledger_accruals
       WHERE ${where.clause} ORDER BY created_at DESC LIMIT ?`,
      [...where.params, limit],
    );
    return rows.map(mapAccrual);
  }
}

export const ledgerRepository = new LedgerRepository();
