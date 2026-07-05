import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CityCode, RefundRequest, RequestContext } from "@xlb/types";
import { RepositoryBase } from "../../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../../dal/scopedExecutor.js";

type RefundRow = RowDataPacket & {
  refund_id: string;
  city_code: string;
  order_id: string;
  customer_id: string;
  fulfillment_id: string;
  payment_order_id: string;
  amount: string;
  currency: "CNY";
  reason: string | null;
  status: string;
  requested_at: Date;
  approved_at: Date | null;
  approved_by_admin_id: string | null;
};

export type RefundableOrderSnapshot = {
  orderId: string;
  cityCode: CityCode;
  customerId: string;
  fulfillmentId: string;
  paymentOrderId: string;
  amount: number;
  currency: "CNY";
};

export type InsertRefundRequestInput = {
  refundId: string;
  cityCode: CityCode;
  orderId: string;
  customerId: string;
  fulfillmentId: string;
  paymentOrderId: string;
  amount: number;
  currency: "CNY";
  reason: string | null;
};

function mapRefund(row: RefundRow): RefundRequest {
  return {
    refundId: row.refund_id,
    cityCode: row.city_code as CityCode,
    orderId: row.order_id,
    customerId: row.customer_id,
    fulfillmentId: row.fulfillment_id,
    paymentOrderId: row.payment_order_id,
    amount: Number(row.amount),
    currency: row.currency,
    reason: row.reason,
    status: row.status as RefundRequest["status"],
    requestedAt: row.requested_at.toISOString(),
    approvedAt: row.approved_at?.toISOString() ?? null,
    approvedByAdminId: row.approved_by_admin_id,
  };
}

export class RefundRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async loadRefundableOrderSnapshot(
    connection: PoolConnection,
    cityCode: CityCode,
    orderId: string,
  ): Promise<RefundableOrderSnapshot | null> {
    const [rows] = await connection.query<
      (RowDataPacket & {
        order_id: string;
        city_code: string;
        customer_id: string;
        fulfillment_id: string;
        payment_order_id: string;
        gross_amount: string;
        currency: "CNY";
      })[]
    >(
      `SELECT o.order_id, o.city_code, o.customer_id, f.fulfillment_id,
              p.payment_order_id, la.gross_amount, la.currency
         FROM orders o
         JOIN payment_orders p
           ON p.order_id = o.order_id AND p.city_code = o.city_code
          AND p.status = 'paid'
         JOIN fulfillments f
           ON f.order_id = o.order_id AND f.city_code = o.city_code
          AND f.status = 'completed'
         JOIN ledger_accruals la
           ON la.order_id = o.order_id AND la.city_code = o.city_code
          AND la.fulfillment_id = f.fulfillment_id
          AND la.status = 'accrued'
        WHERE o.order_id = ? AND o.city_code = ? AND o.status = 'paid'
        LIMIT 1 FOR UPDATE`,
      [orderId, cityCode],
    );
    const row = rows[0];
    return row
      ? {
          orderId: row.order_id,
          cityCode: row.city_code as CityCode,
          customerId: row.customer_id,
          fulfillmentId: row.fulfillment_id,
          paymentOrderId: row.payment_order_id,
          amount: Number(row.gross_amount),
          currency: row.currency,
        }
      : null;
  }

  async findByOrderForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    orderId: string,
  ): Promise<RefundRequest | null> {
    const [rows] = await connection.query<RefundRow[]>(
      `SELECT refund_id, city_code, order_id, customer_id, fulfillment_id,
              payment_order_id, amount, currency, reason, status,
              requested_at, approved_at, approved_by_admin_id
         FROM aftersale_refund_requests
        WHERE city_code = ? AND order_id = ?
        LIMIT 1 FOR UPDATE`,
      [cityCode, orderId],
    );
    return rows[0] ? mapRefund(rows[0]) : null;
  }

  async findByIdForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    refundId: string,
  ): Promise<RefundRequest | null> {
    const [rows] = await connection.query<RefundRow[]>(
      `SELECT refund_id, city_code, order_id, customer_id, fulfillment_id,
              payment_order_id, amount, currency, reason, status,
              requested_at, approved_at, approved_by_admin_id
         FROM aftersale_refund_requests
        WHERE city_code = ? AND refund_id = ?
        LIMIT 1 FOR UPDATE`,
      [cityCode, refundId],
    );
    return rows[0] ? mapRefund(rows[0]) : null;
  }

  async findById(
    context: RequestContext,
    cityCode: CityCode,
    refundId: string,
  ): Promise<RefundRequest | null> {
    this.requireContext(context);
    assertCityScopedContext(context);
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<RefundRow[]>(
      `SELECT refund_id, city_code, order_id, customer_id, fulfillment_id,
              payment_order_id, amount, currency, reason, status,
              requested_at, approved_at, approved_by_admin_id
         FROM aftersale_refund_requests
        WHERE ${where.clause} AND refund_id = ?
        LIMIT 1`,
      [...where.params, refundId],
    );
    return rows[0] ? mapRefund(rows[0]) : null;
  }

  async insertRefundRequest(
    connection: PoolConnection,
    input: InsertRefundRequestInput,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO aftersale_refund_requests
        (refund_id, city_code, order_id, customer_id, fulfillment_id,
         payment_order_id, amount, currency, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'CNY', ?, 'requested')`,
      [
        input.refundId,
        input.cityCode,
        input.orderId,
        input.customerId,
        input.fulfillmentId,
        input.paymentOrderId,
        input.amount,
        input.reason,
      ],
    );
  }

  async markApproved(
    connection: PoolConnection,
    cityCode: CityCode,
    refundId: string,
    approvedByAdminId: string,
    approvalEventId: string,
    approvedAt: Date,
  ): Promise<void> {
    await connection.query(
      `UPDATE aftersale_refund_requests
          SET status = 'approved',
              approved_at = ?,
              approved_by_admin_id = ?,
              approval_event_id = ?
        WHERE city_code = ? AND refund_id = ? AND status = 'requested'`,
      [approvedAt, approvedByAdminId, approvalEventId, cityCode, refundId],
    );
  }
}

export const refundRepository = new RefundRepository();
