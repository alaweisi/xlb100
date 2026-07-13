import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CityCode, OrderReview, RequestContext } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type OrderReviewRow = RowDataPacket & {
  review_id: string;
  city_code: string;
  order_id: string;
  customer_id: string;
  worker_id: string;
  fulfillment_id: string;
  rating: number;
  comment: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

export type ReviewableOrderSnapshot = {
  orderId: string;
  cityCode: CityCode;
  customerId: string;
  workerId: string;
  fulfillmentId: string;
};

export type OwnedOrderSnapshot = {
  orderId: string;
  customerId: string;
};

export type InsertOrderReviewInput = {
  reviewId: string;
  cityCode: CityCode;
  orderId: string;
  customerId: string;
  workerId: string;
  fulfillmentId: string;
  rating: number;
  comment: string;
};

function mapReview(row: OrderReviewRow): OrderReview {
  return {
    reviewId: row.review_id,
    cityCode: row.city_code as CityCode,
    orderId: row.order_id,
    customerId: row.customer_id,
    workerId: row.worker_id,
    fulfillmentId: row.fulfillment_id,
    rating: Number(row.rating),
    comment: row.comment,
    status: row.status as OrderReview["status"],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class OrderReviewRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async lockOwnedOrder(
    connection: PoolConnection,
    cityCode: CityCode,
    orderId: string,
    customerId: string,
  ): Promise<OwnedOrderSnapshot | null> {
    const [rows] = await connection.query<
      (RowDataPacket & { order_id: string; customer_id: string })[]
    >(
      `SELECT order_id, customer_id
         FROM orders
        WHERE city_code=? AND order_id=? AND customer_id=?
        LIMIT 1 FOR UPDATE`,
      [cityCode, orderId, customerId],
    );
    return rows[0]
      ? { orderId: rows[0].order_id, customerId: rows[0].customer_id }
      : null;
  }

  async loadReviewableOrderSnapshot(
    connection: PoolConnection,
    cityCode: CityCode,
    orderId: string,
    customerId: string,
  ): Promise<ReviewableOrderSnapshot | null> {
    const [rows] = await connection.query<
      (RowDataPacket & {
        order_id: string;
        city_code: string;
        customer_id: string;
        worker_id: string;
        fulfillment_id: string;
      })[]
    >(
      `SELECT o.order_id, o.city_code, o.customer_id, f.worker_id, f.fulfillment_id
         FROM orders o
         JOIN fulfillments f
           ON f.order_id = o.order_id
          AND f.city_code = o.city_code
          AND f.status = 'completed'
        WHERE o.city_code = ?
          AND o.order_id = ?
          AND o.customer_id = ?
          AND o.status = 'paid'
        LIMIT 1 FOR UPDATE`,
      [cityCode, orderId, customerId],
    );
    const row = rows[0];
    return row
      ? {
          orderId: row.order_id,
          cityCode: row.city_code as CityCode,
          customerId: row.customer_id,
          workerId: row.worker_id,
          fulfillmentId: row.fulfillment_id,
        }
      : null;
  }

  async findByOrderForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    orderId: string,
  ): Promise<OrderReview | null> {
    const [rows] = await connection.query<OrderReviewRow[]>(
      `SELECT review_id, city_code, order_id, customer_id, worker_id,
              fulfillment_id, rating, comment, status, created_at, updated_at
         FROM order_reviews
        WHERE city_code = ? AND order_id = ?
        LIMIT 1 FOR UPDATE`,
      [cityCode, orderId],
    );
    return rows[0] ? mapReview(rows[0]) : null;
  }

  async findByOrder(
    context: RequestContext,
    cityCode: CityCode,
    orderId: string,
  ): Promise<OrderReview | null> {
    this.requireContext(context);
    assertCityScopedContext(context);
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<OrderReviewRow[]>(
      `SELECT review_id, city_code, order_id, customer_id, worker_id,
              fulfillment_id, rating, comment, status, created_at, updated_at
         FROM order_reviews
        WHERE ${where.clause} AND order_id = ?
        LIMIT 1`,
      [...where.params, orderId],
    );
    return rows[0] ? mapReview(rows[0]) : null;
  }

  async insertReview(
    connection: PoolConnection,
    input: InsertOrderReviewInput,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO order_reviews
        (review_id, city_code, order_id, customer_id, worker_id,
         fulfillment_id, rating, comment, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'created')`,
      [
        input.reviewId,
        input.cityCode,
        input.orderId,
        input.customerId,
        input.workerId,
        input.fulfillmentId,
        input.rating,
        input.comment,
      ],
    );
  }
}

export const orderReviewRepository = new OrderReviewRepository();
