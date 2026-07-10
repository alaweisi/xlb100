import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CityCode, OrderReverseRequest, OrderReverseStatus, OrderReverseType, OrderStatus, RequestContext } from "@xlb/types";
import { RepositoryBase } from "../../dal/repositoryBase.js";
import { assertCityScopedContext, buildCityScopedWhere } from "../../dal/scopedExecutor.js";

type ReverseRow = RowDataPacket & {
  reverse_request_id: string;
  city_code: string;
  order_id: string;
  customer_id: string;
  reverse_type: string;
  status: string;
  reason: string;
  requested_scheduled_at: Date | null;
  requested_time_slot: string | null;
  idempotency_key: string;
  review_note: string | null;
  reviewed_by_admin_id: string | null;
  reviewed_at: Date | null;
  applied_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ReverseOrderSnapshot = {
  orderId: string;
  cityCode: CityCode;
  customerId: string;
  status: OrderStatus;
  hasStartedFulfillment: boolean;
};

function mapReverse(row: ReverseRow): OrderReverseRequest {
  return {
    reverseRequestId: row.reverse_request_id,
    cityCode: row.city_code as CityCode,
    orderId: row.order_id,
    customerId: row.customer_id,
    reverseType: row.reverse_type as OrderReverseType,
    status: row.status as OrderReverseStatus,
    reason: row.reason,
    requestedScheduledAt: row.requested_scheduled_at?.toISOString() ?? null,
    requestedTimeSlot: row.requested_time_slot as OrderReverseRequest["requestedTimeSlot"],
    idempotencyKey: row.idempotency_key,
    reviewNote: row.review_note,
    reviewedByAdminId: row.reviewed_by_admin_id,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    appliedAt: row.applied_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const SELECT_REVERSE = `SELECT reverse_request_id, city_code, order_id, customer_id, reverse_type,
  status, reason, requested_scheduled_at, requested_time_slot, idempotency_key,
  review_note, reviewed_by_admin_id, reviewed_at, applied_at, created_at, updated_at
  FROM order_reverse_requests`;

export class OrderReverseRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async loadOrderForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    orderId: string,
  ): Promise<ReverseOrderSnapshot | null> {
    const [rows] = await connection.query<(RowDataPacket & {
      order_id: string;
      city_code: string;
      customer_id: string;
      status: string;
      started_count: number;
    })[]>(
      `SELECT o.order_id, o.city_code, o.customer_id, o.status,
              (SELECT COUNT(*) FROM fulfillments f
                WHERE f.city_code=o.city_code AND f.order_id=o.order_id
                  AND f.status IN ('in_progress','completed')) AS started_count
         FROM orders o
        WHERE o.city_code=? AND o.order_id=?
        LIMIT 1 FOR UPDATE`,
      [cityCode, orderId],
    );
    const row = rows[0];
    return row
      ? {
          orderId: row.order_id,
          cityCode: row.city_code as CityCode,
          customerId: row.customer_id,
          status: row.status as OrderStatus,
          hasStartedFulfillment: Number(row.started_count) > 0,
        }
      : null;
  }

  async findByIdempotencyForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    customerId: string,
    key: string,
  ): Promise<OrderReverseRequest | null> {
    const [rows] = await connection.query<ReverseRow[]>(
      `${SELECT_REVERSE} WHERE city_code=? AND customer_id=? AND idempotency_key=? LIMIT 1 FOR UPDATE`,
      [cityCode, customerId, key],
    );
    return rows[0] ? mapReverse(rows[0]) : null;
  }

  async findByIdForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    reverseRequestId: string,
  ): Promise<OrderReverseRequest | null> {
    const [rows] = await connection.query<ReverseRow[]>(
      `${SELECT_REVERSE} WHERE city_code=? AND reverse_request_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, reverseRequestId],
    );
    return rows[0] ? mapReverse(rows[0]) : null;
  }

  async insert(
    connection: PoolConnection,
    input: {
      reverseRequestId: string;
      cityCode: CityCode;
      orderId: string;
      customerId: string;
      reverseType: OrderReverseType;
      reason: string;
      requestedScheduledAt: Date | null;
      requestedTimeSlot: string | null;
      idempotencyKey: string;
    },
  ): Promise<void> {
    await connection.query(
      `INSERT INTO order_reverse_requests
        (reverse_request_id, city_code, order_id, customer_id, reverse_type, status,
         reason, requested_scheduled_at, requested_time_slot, idempotency_key)
       VALUES (?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?)`,
      [
        input.reverseRequestId,
        input.cityCode,
        input.orderId,
        input.customerId,
        input.reverseType,
        input.reason,
        input.requestedScheduledAt,
        input.requestedTimeSlot,
        input.idempotencyKey,
      ],
    );
  }

  async markReviewed(
    connection: PoolConnection,
    cityCode: CityCode,
    id: string,
    status: "approved" | "rejected",
    adminId: string,
    note: string | null,
  ): Promise<void> {
    await connection.query(
      `UPDATE order_reverse_requests
          SET status=?, review_note=?, reviewed_by_admin_id=?, reviewed_at=CURRENT_TIMESTAMP
        WHERE city_code=? AND reverse_request_id=? AND status='requested'`,
      [status, note, adminId, cityCode, id],
    );
  }

  async apply(connection: PoolConnection, request: OrderReverseRequest): Promise<void> {
    if (request.reverseType === "cancel") {
      await connection.query(
        `UPDATE orders SET status='cancelled' WHERE city_code=? AND order_id=?`,
        [request.cityCode, request.orderId],
      );
    } else if (request.reverseType === "reschedule") {
      await connection.query(
        `UPDATE orders SET scheduled_at=?, scheduled_time_slot=? WHERE city_code=? AND order_id=?`,
        [new Date(request.requestedScheduledAt!), request.requestedTimeSlot, request.cityCode, request.orderId],
      );
    }
    await connection.query(
      `UPDATE order_reverse_requests
          SET status='applied', applied_at=CURRENT_TIMESTAMP
        WHERE city_code=? AND reverse_request_id=? AND status='approved'`,
      [request.cityCode, request.reverseRequestId],
    );
  }

  async insertTimeline(
    connection: PoolConnection,
    input: {
      timelineEventId: string;
      cityCode: CityCode;
      orderId: string;
      reverseRequestId: string;
      eventType: string;
      actorType: string;
      actorId: string | null;
      content: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await connection.query(
      `INSERT INTO aftersale_timeline_events
        (timeline_event_id, city_code, order_id, reverse_request_id, event_type,
         actor_type, actor_id, content, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.timelineEventId,
        input.cityCode,
        input.orderId,
        input.reverseRequestId,
        input.eventType,
        input.actorType,
        input.actorId,
        input.content,
        JSON.stringify(input.payload),
      ],
    );
  }

  async listByOrder(
    context: RequestContext,
    cityCode: CityCode,
    orderId: string,
    customerId: string,
  ): Promise<OrderReverseRequest[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<ReverseRow[]>(
      `${SELECT_REVERSE} WHERE ${where.clause} AND order_id=? AND customer_id=? ORDER BY created_at DESC`,
      [...where.params, orderId, customerId],
    );
    return rows.map(mapReverse);
  }

  async listForAdmin(
    context: RequestContext,
    cityCode: CityCode,
    filters: { status?: string; reverseType?: string },
  ): Promise<OrderReverseRequest[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    const where = buildCityScopedWhere(cityCode);
    const clauses = [where.clause];
    const params: unknown[] = [...where.params];
    if (filters.status) {
      clauses.push("status=?");
      params.push(filters.status);
    }
    if (filters.reverseType) {
      clauses.push("reverse_type=?");
      params.push(filters.reverseType);
    }
    const [rows] = await this.pool.query<ReverseRow[]>(
      `${SELECT_REVERSE} WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT 200`,
      params,
    );
    return rows.map(mapReverse);
  }
}

export const orderReverseRepository = new OrderReverseRepository();
