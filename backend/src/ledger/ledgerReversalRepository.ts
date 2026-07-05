import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CityCode, LedgerEntry } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";

type ReversalSnapshotRow = RowDataPacket & {
  accrual_id: string;
  fulfillment_id: string;
  order_id: string;
  city_code: string;
  payment_order_id: string;
  worker_id: string;
  customer_id: string;
  sku_id: string;
  gross_amount: string;
  platform_fee: string;
  worker_receivable: string;
  currency: "CNY";
};

type LedgerEntryRow = RowDataPacket & {
  entry_id: string;
  city_code: string;
  account_id: string;
  account_type: "customer" | "platform" | "worker";
  owner_id: string;
  source_type: "fulfillment.completed" | "refund.approved";
  source_id: string;
  direction: "debit" | "credit";
  amount: string;
  currency: "CNY";
  description: string | null;
  created_at: Date;
};

export type LedgerReversalSnapshot = {
  accrualId: string;
  fulfillmentId: string;
  orderId: string;
  cityCode: CityCode;
  paymentOrderId: string;
  workerId: string;
  customerId: string;
  skuId: string;
  grossAmount: number;
  platformFee: number;
  workerReceivable: number;
  currency: "CNY";
};

function mapEntry(row: LedgerEntryRow): LedgerEntry {
  return {
    entryId: row.entry_id,
    cityCode: row.city_code as CityCode,
    accountId: row.account_id,
    accountType: row.account_type,
    ownerId: row.owner_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    direction: row.direction,
    amount: Number(row.amount),
    currency: row.currency,
    description: row.description,
    createdAt: row.created_at.toISOString(),
  };
}

function mapSnapshot(row: ReversalSnapshotRow): LedgerReversalSnapshot {
  return {
    accrualId: row.accrual_id,
    fulfillmentId: row.fulfillment_id,
    orderId: row.order_id,
    cityCode: row.city_code as CityCode,
    paymentOrderId: row.payment_order_id,
    workerId: row.worker_id,
    customerId: row.customer_id,
    skuId: row.sku_id,
    grossAmount: Number(row.gross_amount),
    platformFee: Number(row.platform_fee),
    workerReceivable: Number(row.worker_receivable),
    currency: row.currency,
  };
}

export class LedgerReversalRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async loadSnapshotForRefund(
    connection: PoolConnection,
    cityCode: CityCode,
    fulfillmentId: string,
    orderId: string,
  ): Promise<LedgerReversalSnapshot | null> {
    const [rows] = await connection.query<ReversalSnapshotRow[]>(
      `SELECT accrual_id, fulfillment_id, order_id, city_code, payment_order_id,
              worker_id, customer_id, sku_id, gross_amount, platform_fee,
              worker_receivable, currency
         FROM ledger_accruals
        WHERE city_code = ?
          AND fulfillment_id = ?
          AND order_id = ?
          AND status = 'accrued'
        LIMIT 1 FOR UPDATE`,
      [cityCode, fulfillmentId, orderId],
    );
    return rows[0] ? mapSnapshot(rows[0]) : null;
  }

  async listOriginalEntriesForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    fulfillmentId: string,
  ): Promise<LedgerEntry[]> {
    const [rows] = await connection.query<LedgerEntryRow[]>(
      `SELECT entry_id, city_code, account_id, account_type, owner_id,
              source_type, source_id, direction, amount, currency,
              description, created_at
         FROM ledger_entries
        WHERE city_code = ?
          AND source_type = 'fulfillment.completed'
          AND source_id = ?
        ORDER BY account_type ASC, direction ASC
        FOR UPDATE`,
      [cityCode, fulfillmentId],
    );
    return rows.map(mapEntry);
  }

  async listExistingReversalEntriesForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    fulfillmentId: string,
  ): Promise<LedgerEntry[]> {
    const [rows] = await connection.query<LedgerEntryRow[]>(
      `SELECT entry_id, city_code, account_id, account_type, owner_id,
              source_type, source_id, direction, amount, currency,
              description, created_at
         FROM ledger_entries
        WHERE city_code = ?
          AND source_type = 'refund.approved'
          AND source_id = ?
        ORDER BY account_type ASC, direction ASC
        FOR UPDATE`,
      [cityCode, fulfillmentId],
    );
    return rows.map(mapEntry);
  }
}

export const ledgerReversalRepository = new LedgerReversalRepository();
