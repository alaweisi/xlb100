import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  LedgerAccrual,
  RequestContext,
  SettlementBatch,
  SettlementItem,
  SettlementPayable,
  SettlementPayableQueue,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type BatchRow = RowDataPacket & {
  settlement_batch_id: string; city_code: string; currency: "CNY";
  total_gross_amount: string; total_platform_fee: string;
  total_worker_receivable: string; item_count: number;
  status: SettlementBatch["status"]; prepared_at: Date;
  confirmed_at: Date | null; confirmed_by: string | null;
  created_at: Date; updated_at: Date;
};

type ItemRow = RowDataPacket & {
  settlement_item_id: string; settlement_batch_id: string; city_code: string;
  accrual_id: string; fulfillment_id: string; order_id: string;
  payment_order_id: string; worker_id: string; customer_id: string; sku_id: string;
  gross_amount: string; platform_fee: string; worker_receivable: string;
  currency: "CNY"; status: SettlementItem["status"];
  created_at: Date; updated_at: Date;
};

type AccrualRow = RowDataPacket & {
  accrual_id: string; city_code: string; fulfillment_id: string; order_id: string;
  payment_order_id: string; worker_id: string; customer_id: string; sku_id: string;
  gross_amount: string; platform_fee: string; worker_receivable: string;
  currency: "CNY"; source_event_id: string; status: LedgerAccrual["status"];
  created_at: Date;
};

type PayableRow = RowDataPacket & {
  settlement_payable_id: string; city_code: string; settlement_batch_id: string;
  currency: "CNY"; gross_amount: string; platform_fee_amount: string;
  worker_receivable_amount: string; item_count: number; status: SettlementPayable["status"];
  marked_at: Date; marked_by: string; created_at: Date; updated_at: Date;
};

type QueueRow = RowDataPacket & {
  queue_id: string; city_code: string; settlement_payable_id: string;
  settlement_batch_id: string; currency: "CNY"; gross_amount: string;
  platform_fee_amount: string; worker_receivable_amount: string; item_count: number;
  status: SettlementPayableQueue["status"]; enqueued_at: Date; enqueued_by: string;
  created_at: Date; updated_at: Date;
};

const mapBatch = (row: BatchRow): SettlementBatch => ({
  settlementBatchId: row.settlement_batch_id,
  cityCode: row.city_code as CityCode,
  currency: row.currency,
  totalGrossAmount: Number(row.total_gross_amount),
  totalPlatformFee: Number(row.total_platform_fee),
  totalWorkerReceivable: Number(row.total_worker_receivable),
  itemCount: row.item_count,
  status: row.status,
  preparedAt: row.prepared_at.toISOString(),
  confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
  confirmedBy: row.confirmed_by,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const mapItem = (row: ItemRow): SettlementItem => ({
  settlementItemId: row.settlement_item_id,
  settlementBatchId: row.settlement_batch_id,
  cityCode: row.city_code as CityCode,
  accrualId: row.accrual_id,
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
  status: row.status,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const mapAccrual = (row: AccrualRow): LedgerAccrual => ({
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
  status: row.status,
  createdAt: row.created_at.toISOString(),
});

const mapPayable = (row: PayableRow): SettlementPayable => ({
  settlementPayableId: row.settlement_payable_id,
  cityCode: row.city_code as CityCode,
  settlementBatchId: row.settlement_batch_id,
  currency: row.currency,
  grossAmount: Number(row.gross_amount),
  platformFeeAmount: Number(row.platform_fee_amount),
  workerReceivableAmount: Number(row.worker_receivable_amount),
  itemCount: row.item_count,
  status: row.status,
  markedAt: row.marked_at.toISOString(),
  markedBy: row.marked_by,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const mapQueue = (row: QueueRow): SettlementPayableQueue => ({
  queueId: row.queue_id,
  cityCode: row.city_code as CityCode,
  settlementPayableId: row.settlement_payable_id,
  settlementBatchId: row.settlement_batch_id,
  currency: row.currency,
  grossAmount: Number(row.gross_amount),
  platformFeeAmount: Number(row.platform_fee_amount),
  workerReceivableAmount: Number(row.worker_receivable_amount),
  itemCount: row.item_count,
  status: row.status,
  enqueuedAt: row.enqueued_at.toISOString(),
  enqueuedBy: row.enqueued_by,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export class SettlementRepository extends RepositoryBase {
  constructor(pool?: Pool) { super(pool); }

  async findUnpreparedAccruals(
    connection: PoolConnection,
    cityCode: CityCode,
  ): Promise<LedgerAccrual[]> {
    const [rows] = await connection.query<AccrualRow[]>(
      `SELECT la.* FROM ledger_accruals la
       WHERE la.city_code = ? AND la.status = 'accrued'
         AND NOT EXISTS (
           SELECT 1 FROM settlement_items si
           WHERE si.accrual_id = la.accrual_id AND si.city_code = la.city_code
         )
       ORDER BY la.created_at ASC, la.accrual_id ASC
       FOR UPDATE`,
      [cityCode],
    );
    return rows.map(mapAccrual);
  }

  async insertBatch(connection: PoolConnection, batch: SettlementBatch): Promise<void> {
    await connection.query(
      `INSERT INTO settlement_batches
        (settlement_batch_id, city_code, currency, total_gross_amount,
         total_platform_fee, total_worker_receivable, item_count, status, prepared_at)
       VALUES (?, ?, 'CNY', ?, ?, ?, ?, 'prepared', ?)`,
      [batch.settlementBatchId, batch.cityCode, batch.totalGrossAmount,
        batch.totalPlatformFee, batch.totalWorkerReceivable, batch.itemCount,
        new Date(batch.preparedAt)],
    );
  }

  async insertItem(connection: PoolConnection, item: SettlementItem): Promise<void> {
    await connection.query(
      `INSERT INTO settlement_items
        (settlement_item_id, settlement_batch_id, city_code, accrual_id,
         fulfillment_id, order_id, payment_order_id, worker_id, customer_id,
         sku_id, gross_amount, platform_fee, worker_receivable, currency, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CNY', 'prepared')`,
      [item.settlementItemId, item.settlementBatchId, item.cityCode, item.accrualId,
        item.fulfillmentId, item.orderId, item.paymentOrderId, item.workerId,
        item.customerId, item.skuId, item.grossAmount, item.platformFee,
        item.workerReceivable],
    );
  }

  async findBatchForConfirmation(
    connection: PoolConnection,
    cityCode: CityCode,
    batchId: string,
  ): Promise<SettlementBatch | null> {
    return this.findBatchForUpdate(connection, cityCode, batchId);
  }

  async findBatchForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    batchId: string,
  ): Promise<SettlementBatch | null> {
    const [rows] = await connection.query<BatchRow[]>(
      `SELECT * FROM settlement_batches
       WHERE city_code = ? AND settlement_batch_id = ?
       LIMIT 1 FOR UPDATE`,
      [cityCode, batchId],
    );
    return rows[0] ? mapBatch(rows[0]) : null;
  }

  async findPayableForBatch(
    connection: PoolConnection,
    cityCode: CityCode,
    batchId: string,
  ): Promise<SettlementPayable | null> {
    const [rows] = await connection.query<PayableRow[]>(
      `SELECT * FROM settlement_payables
       WHERE city_code = ? AND settlement_batch_id = ?
       LIMIT 1`,
      [cityCode, batchId],
    );
    return rows[0] ? mapPayable(rows[0]) : null;
  }

  async insertPayable(connection: PoolConnection, payable: SettlementPayable): Promise<void> {
    await connection.query(
      `INSERT INTO settlement_payables
        (settlement_payable_id, city_code, settlement_batch_id, currency,
         gross_amount, platform_fee_amount, worker_receivable_amount, item_count,
         status, marked_at, marked_by)
       VALUES (?, ?, ?, 'CNY', ?, ?, ?, ?, 'payable', ?, ?)`,
      [
        payable.settlementPayableId,
        payable.cityCode,
        payable.settlementBatchId,
        payable.grossAmount,
        payable.platformFeeAmount,
        payable.workerReceivableAmount,
        payable.itemCount,
        new Date(payable.markedAt),
        payable.markedBy,
      ],
    );
  }

  async getPayableByBatch(
    context: RequestContext,
    cityCode: CityCode,
    batchId: string,
  ): Promise<SettlementPayable | null> {
    this.requireContext(context);
    if (assertCityScopedContext(context) !== cityCode) throw new Error("city_code mismatch in settlement query");
    const where = buildCityScopedWhere(cityCode);
    const [batches] = await this.pool.query<RowDataPacket[]>(
      `SELECT settlement_batch_id FROM settlement_batches
       WHERE ${where.clause} AND settlement_batch_id = ? LIMIT 1`,
      [...where.params, batchId],
    );
    if (!batches[0]) return null;
    const [rows] = await this.pool.query<PayableRow[]>(
      `SELECT * FROM settlement_payables
       WHERE ${where.clause} AND settlement_batch_id = ? LIMIT 1`,
      [...where.params, batchId],
    );
    return rows[0] ? mapPayable(rows[0]) : null;
  }

  async findPayableByIdForEnqueue(
    connection: PoolConnection,
    cityCode: CityCode,
    payableId: string,
  ): Promise<SettlementPayable | null> {
    const [rows] = await connection.query<PayableRow[]>(
      `SELECT * FROM settlement_payables
       WHERE city_code = ? AND settlement_payable_id = ?
       LIMIT 1 FOR UPDATE`,
      [cityCode, payableId],
    );
    return rows[0] ? mapPayable(rows[0]) : null;
  }

  async findQueueForPayable(
    connection: PoolConnection,
    cityCode: CityCode,
    payableId: string,
  ): Promise<SettlementPayableQueue | null> {
    const [rows] = await connection.query<QueueRow[]>(
      `SELECT * FROM settlement_payable_queue
       WHERE city_code = ? AND settlement_payable_id = ?
       LIMIT 1`,
      [cityCode, payableId],
    );
    return rows[0] ? mapQueue(rows[0]) : null;
  }

  async insertPayableQueue(connection: PoolConnection, queue: SettlementPayableQueue): Promise<void> {
    await connection.query(
      `INSERT INTO settlement_payable_queue
        (queue_id, city_code, settlement_payable_id, settlement_batch_id, currency,
         gross_amount, platform_fee_amount, worker_receivable_amount, item_count,
         status, enqueued_at, enqueued_by)
       VALUES (?, ?, ?, ?, 'CNY', ?, ?, ?, ?, 'queued', ?, ?)`,
      [
        queue.queueId,
        queue.cityCode,
        queue.settlementPayableId,
        queue.settlementBatchId,
        queue.grossAmount,
        queue.platformFeeAmount,
        queue.workerReceivableAmount,
        queue.itemCount,
        new Date(queue.enqueuedAt),
        queue.enqueuedBy,
      ],
    );
  }

  async getQueueByPayable(
    context: RequestContext,
    cityCode: CityCode,
    payableId: string,
  ): Promise<SettlementPayableQueue | null> {
    this.requireContext(context);
    if (assertCityScopedContext(context) !== cityCode) throw new Error("city_code mismatch in settlement query");
    const where = buildCityScopedWhere(cityCode);
    const [payables] = await this.pool.query<RowDataPacket[]>(
      `SELECT settlement_payable_id FROM settlement_payables
       WHERE ${where.clause} AND settlement_payable_id = ? LIMIT 1`,
      [...where.params, payableId],
    );
    if (!payables[0]) return null;
    const [rows] = await this.pool.query<QueueRow[]>(
      `SELECT * FROM settlement_payable_queue
       WHERE ${where.clause} AND settlement_payable_id = ? LIMIT 1`,
      [...where.params, payableId],
    );
    return rows[0] ? mapQueue(rows[0]) : null;
  }

  async lockBatchItems(
    connection: PoolConnection,
    cityCode: CityCode,
    batchId: string,
  ): Promise<SettlementItem[]> {
    const [rows] = await connection.query<ItemRow[]>(
      `SELECT * FROM settlement_items
       WHERE city_code = ? AND settlement_batch_id = ?
       ORDER BY created_at ASC, settlement_item_id ASC
       FOR UPDATE`,
      [cityCode, batchId],
    );
    return rows.map(mapItem);
  }

  async markBatchConfirmed(
    connection: PoolConnection,
    cityCode: CityCode,
    batchId: string,
    confirmedAt: string,
    confirmedBy: string,
  ): Promise<void> {
    await connection.query(
      `UPDATE settlement_batches
       SET status = 'confirmed', confirmed_at = ?, confirmed_by = ?, updated_at = ?
       WHERE city_code = ? AND settlement_batch_id = ? AND status = 'prepared'`,
      [new Date(confirmedAt), confirmedBy, new Date(confirmedAt), cityCode, batchId],
    );
    await connection.query(
      `UPDATE settlement_items
       SET status = 'confirmed'
       WHERE city_code = ? AND settlement_batch_id = ? AND status = 'prepared'`,
      [cityCode, batchId],
    );
  }

  async listBatches(context: RequestContext, cityCode: CityCode): Promise<SettlementBatch[]> {
    this.requireContext(context);
    if (assertCityScopedContext(context) !== cityCode) throw new Error("city_code mismatch in settlement query");
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<BatchRow[]>(
      `SELECT * FROM settlement_batches WHERE ${where.clause}
       ORDER BY prepared_at DESC, settlement_batch_id DESC`,
      where.params,
    );
    return rows.map(mapBatch);
  }

  async listBatchItems(
    context: RequestContext,
    cityCode: CityCode,
    batchId: string,
  ): Promise<SettlementItem[] | null> {
    this.requireContext(context);
    if (assertCityScopedContext(context) !== cityCode) throw new Error("city_code mismatch in settlement query");
    const where = buildCityScopedWhere(cityCode);
    const [batches] = await this.pool.query<RowDataPacket[]>(
      `SELECT settlement_batch_id FROM settlement_batches
       WHERE ${where.clause} AND settlement_batch_id = ? LIMIT 1`,
      [...where.params, batchId],
    );
    if (!batches[0]) return null;
    const [rows] = await this.pool.query<ItemRow[]>(
      `SELECT * FROM settlement_items
       WHERE ${where.clause} AND settlement_batch_id = ?
       ORDER BY created_at ASC, settlement_item_id ASC`,
      [...where.params, batchId],
    );
    return rows.map(mapItem);
  }
}

export const settlementRepository = new SettlementRepository();
