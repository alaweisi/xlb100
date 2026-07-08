import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CityCode } from "@xlb/types";
import type { EventOutbox, OutboxEventType } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type OutboxRow = RowDataPacket & {
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  city_code: string;
  payload_json: string | Record<string, unknown>;
  status: string;
  created_at: Date;
  published_at: Date | null;
};

function mapOutboxRow(row: OutboxRow): EventOutbox {
  const payload =
    typeof row.payload_json === "string"
      ? (JSON.parse(row.payload_json) as Record<string, unknown>)
      : row.payload_json;
  return {
    eventId: row.event_id,
    eventType: row.event_type as EventOutbox["eventType"],
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    cityCode: row.city_code as CityCode,
    payload,
    status: row.status as EventOutbox["status"],
    createdAt: row.created_at.toISOString(),
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
  };
}

export type InsertOutboxEventInput = {
  eventId: string;
  eventType: OutboxEventType;
  aggregateType: string;
  aggregateId: string;
  cityCode: CityCode;
  payload: Record<string, unknown>;
};

export class EventOutboxRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async insertEvent(
    connection: PoolConnection,
    input: InsertOutboxEventInput,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO event_outbox
        (event_id, event_type, aggregate_type, aggregate_id, city_code, payload_json, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [
        input.eventId,
        input.eventType,
        input.aggregateType,
        input.aggregateId,
        input.cityCode,
        JSON.stringify(input.payload),
      ],
    );
  }

  async findPendingEvents(
    context: RequestContext,
    cityCode: CityCode,
    limit = 100,
  ): Promise<EventOutbox[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in outbox query");
    }

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<OutboxRow[]>(
      `SELECT event_id, event_type, aggregate_type, aggregate_id, city_code,
              payload_json, status, created_at, published_at
       FROM event_outbox
       WHERE ${where.clause} AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT ?`,
      [...where.params, limit],
    );

    return rows.map(mapOutboxRow);
  }

  async findByAggregate(
    context: RequestContext,
    cityCode: CityCode,
    aggregateId: string,
    eventType?: OutboxEventType,
  ): Promise<EventOutbox[]> {
    this.requireContext(context);
    assertCityScopedContext(context);

    const where = buildCityScopedWhere(cityCode);
    const params: unknown[] = [...where.params, aggregateId];
    let typeClause = "";
    if (eventType) {
      typeClause = " AND event_type = ?";
      params.push(eventType);
    }

    const [rows] = await this.pool.query<OutboxRow[]>(
      `SELECT event_id, event_type, aggregate_type, aggregate_id, city_code,
              payload_json, status, created_at, published_at
       FROM event_outbox
       WHERE ${where.clause} AND aggregate_id = ?${typeClause}
       ORDER BY created_at ASC`,
      params,
    );

    return rows.map(mapOutboxRow);
  }

  async findPendingEventsByType(
    context: RequestContext,
    cityCode: CityCode,
    eventType: OutboxEventType,
    limit = 100,
  ): Promise<EventOutbox[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in outbox query");
    }

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<OutboxRow[]>(
      `SELECT event_id, event_type, aggregate_type, aggregate_id, city_code,
              payload_json, status, created_at, published_at
       FROM event_outbox
       WHERE ${where.clause} AND status = 'pending' AND event_type = ?
       ORDER BY created_at ASC
       LIMIT ?`,
      [...where.params, eventType, limit],
    );

    return rows.map(mapOutboxRow);
  }

  async findPendingOrderCreatedForDispatch(
    context: RequestContext,
    cityCode: CityCode,
    limit = 100,
  ): Promise<EventOutbox[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in outbox query");
    }

    const where = buildCityScopedWhere(cityCode, "e.city_code");
    const [rows] = await this.pool.query<OutboxRow[]>(
      `SELECT e.event_id, e.event_type, e.aggregate_type, e.aggregate_id, e.city_code,
              e.payload_json, e.status, e.created_at, e.published_at
       FROM event_outbox e
       INNER JOIN orders o
          ON o.city_code = e.city_code
         AND o.order_id = e.aggregate_id
       WHERE ${where.clause}
         AND e.status = 'pending'
         AND e.event_type = 'order.created'
         AND o.status = 'pending_dispatch'
       ORDER BY e.created_at DESC
       LIMIT ?`,
      [...where.params, limit],
    );

    return rows.map(mapOutboxRow);
  }

  async findPendingFulfillmentCompletedForLedger(
    context: RequestContext,
    cityCode: CityCode,
    limit = 100,
  ): Promise<EventOutbox[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in outbox query");
    }

    const where = buildCityScopedWhere(cityCode, "e.city_code");
    const [rows] = await this.pool.query<OutboxRow[]>(
      `SELECT e.event_id, e.event_type, e.aggregate_type, e.aggregate_id, e.city_code,
              e.payload_json, e.status, e.created_at, e.published_at
       FROM event_outbox e
       INNER JOIN fulfillments f
          ON f.city_code = e.city_code
         AND f.fulfillment_id = e.aggregate_id
       INNER JOIN orders o
          ON o.city_code = f.city_code
         AND o.order_id = f.order_id
       INNER JOIN payment_orders p
          ON p.city_code = o.city_code
         AND p.order_id = o.order_id
         AND p.status = 'paid'
       WHERE ${where.clause}
         AND e.status = 'pending'
         AND e.event_type = 'fulfillment.completed'
         AND f.status = 'completed'
         AND o.status = 'paid'
       ORDER BY e.created_at DESC
       LIMIT ?`,
      [...where.params, limit],
    );

    return rows.map(mapOutboxRow);
  }

  async markEventPublished(
    connection: PoolConnection,
    eventId: string,
    cityCode: CityCode,
  ): Promise<void> {
    await connection.query(
      `UPDATE event_outbox
       SET status = 'published', published_at = CURRENT_TIMESTAMP
       WHERE event_id = ? AND city_code = ? AND status = 'pending'`,
      [eventId, cityCode],
    );
  }

  async markEventFailed(
    connection: PoolConnection,
    eventId: string,
    cityCode: CityCode,
  ): Promise<void> {
    await connection.query(
      `UPDATE event_outbox
       SET status = 'failed'
       WHERE event_id = ? AND city_code = ?`,
      [eventId, cityCode],
    );
  }
}

export const eventOutboxRepository = new EventOutboxRepository();
