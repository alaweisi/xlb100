import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  DispatchEvent,
  DispatchEventType,
  DispatchOffer,
  DispatchOfferStatus,
  DispatchTask,
  RequestContext,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type DispatchTaskRow = RowDataPacket & {
  dispatch_task_id: string;
  city_code: string;
  order_id: string;
  customer_id: string;
  sku_id: string;
  amount: string;
  source_event_id: string;
  stream_name: string;
  stream_entry_id: string | null;
  status: string;
  attempt_count: number;
  max_attempts: number;
  last_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

type DispatchOfferRow = RowDataPacket & {
  offer_id: string;
  dispatch_task_id: string;
  city_code: string;
  worker_id: string;
  status: string;
  distance_km: string | null;
  offered_at: Date;
  responded_at: Date | null;
};

type DispatchEventRow = RowDataPacket & {
  dispatch_event_id: string;
  dispatch_task_id: string;
  city_code: string;
  event_type: string;
  worker_id: string | null;
  reason: string | null;
  created_at: Date;
};

type CandidateWorkerRow = RowDataPacket & {
  worker_id: string;
  distance_km: string | null;
};

const DISPATCH_TASK_COLUMNS = [
  "dispatch_task_id",
  "city_code",
  "order_id",
  "customer_id",
  "sku_id",
  "amount",
  "source_event_id",
  "stream_name",
  "stream_entry_id",
  "status",
  "attempt_count",
  "max_attempts",
  "last_reason",
  "created_at",
  "updated_at",
];

const DISPATCH_TASK_SELECT = DISPATCH_TASK_COLUMNS.join(", ");
const DISPATCH_TASK_SELECT_ALIASED = DISPATCH_TASK_COLUMNS.map(
  (column) => `dt.${column}`,
).join(", ");

function mapDispatchTaskRow(row: DispatchTaskRow): DispatchTask {
  return {
    dispatchTaskId: row.dispatch_task_id,
    cityCode: row.city_code as CityCode,
    orderId: row.order_id,
    customerId: row.customer_id,
    skuId: row.sku_id,
    amount: Number(row.amount),
    sourceEventId: row.source_event_id,
    streamName: row.stream_name,
    streamEntryId: row.stream_entry_id,
    status: row.status as DispatchTask["status"],
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    lastReason: row.last_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapDispatchOfferRow(row: DispatchOfferRow): DispatchOffer {
  return {
    offerId: row.offer_id,
    dispatchTaskId: row.dispatch_task_id,
    cityCode: row.city_code as CityCode,
    workerId: row.worker_id,
    status: row.status as DispatchOfferStatus,
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    offeredAt: row.offered_at.toISOString(),
    respondedAt: row.responded_at?.toISOString() ?? null,
  };
}

function mapDispatchEventRow(row: DispatchEventRow): DispatchEvent {
  return {
    dispatchEventId: row.dispatch_event_id,
    dispatchTaskId: row.dispatch_task_id,
    cityCode: row.city_code as CityCode,
    eventType: row.event_type as DispatchEventType,
    workerId: row.worker_id,
    reason: row.reason,
    createdAt: row.created_at.toISOString(),
  };
}

export type InsertDispatchTaskInput = {
  dispatchTaskId: string;
  cityCode: CityCode;
  orderId: string;
  customerId: string;
  skuId: string;
  amount: number;
  sourceEventId: string;
  streamName: string;
};

export type InsertDispatchOfferInput = {
  offerId: string;
  dispatchTaskId: string;
  cityCode: CityCode;
  workerId: string;
  distanceKm: number | null;
};

export type InsertDispatchEventInput = {
  dispatchEventId: string;
  dispatchTaskId: string;
  cityCode: CityCode;
  eventType: DispatchEventType;
  workerId?: string | null;
  reason?: string | null;
};

export type CandidateWorker = {
  workerId: string;
  distanceKm: number | null;
};

export class DispatchRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async insertTask(
    connection: PoolConnection,
    input: InsertDispatchTaskInput,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO dispatch_tasks
        (dispatch_task_id, city_code, order_id, customer_id, sku_id, amount,
         source_event_id, stream_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        input.dispatchTaskId,
        input.cityCode,
        input.orderId,
        input.customerId,
        input.skuId,
        input.amount,
        input.sourceEventId,
        input.streamName,
      ],
    );
  }

  async updateTaskQueued(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
    streamEntryId: string,
  ): Promise<void> {
    await connection.query(
      `UPDATE dispatch_tasks
       SET status = 'queued', stream_entry_id = ?
       WHERE dispatch_task_id = ? AND city_code = ?`,
      [streamEntryId, dispatchTaskId, cityCode],
    );
  }

  async insertEvent(
    connection: PoolConnection,
    input: InsertDispatchEventInput,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO dispatch_events
        (dispatch_event_id, dispatch_task_id, city_code, event_type, worker_id, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.dispatchEventId,
        input.dispatchTaskId,
        input.cityCode,
        input.eventType,
        input.workerId ?? null,
        input.reason ?? null,
      ],
    );
  }

  async createOffer(
    connection: PoolConnection,
    input: InsertDispatchOfferInput,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO dispatch_offers
        (offer_id, dispatch_task_id, city_code, worker_id, status, distance_km)
       VALUES (?, ?, ?, ?, 'offering', ?)
       ON DUPLICATE KEY UPDATE offer_id = offer_id`,
      [
        input.offerId,
        input.dispatchTaskId,
        input.cityCode,
        input.workerId,
        input.distanceKm,
      ],
    );
  }

  async updateTaskFailed(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
  ): Promise<void> {
    await connection.query(
      `UPDATE dispatch_tasks SET status = 'failed'
       WHERE dispatch_task_id = ? AND city_code = ?`,
      [dispatchTaskId, cityCode],
    );
  }

  async findBySourceEventId(
    context: RequestContext,
    cityCode: CityCode,
    sourceEventId: string,
  ): Promise<DispatchTask | null> {
    this.requireContext(context);
    assertCityScopedContext(context);

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<DispatchTaskRow[]>(
      `SELECT ${DISPATCH_TASK_SELECT}
       FROM dispatch_tasks
       WHERE ${where.clause} AND source_event_id = ?
       LIMIT 1`,
      [...where.params, sourceEventId],
    );

    return rows[0] ? mapDispatchTaskRow(rows[0]) : null;
  }

  async findByOrderId(
    context: RequestContext,
    cityCode: CityCode,
    orderId: string,
  ): Promise<DispatchTask | null> {
    this.requireContext(context);
    assertCityScopedContext(context);

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<DispatchTaskRow[]>(
      `SELECT ${DISPATCH_TASK_SELECT}
       FROM dispatch_tasks
       WHERE ${where.clause} AND order_id = ?
       LIMIT 1`,
      [...where.params, orderId],
    );

    return rows[0] ? mapDispatchTaskRow(rows[0]) : null;
  }

  async listTasks(
    context: RequestContext,
    cityCode: CityCode,
    limit = 100,
  ): Promise<DispatchTask[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in dispatch task query");
    }

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<DispatchTaskRow[]>(
      `SELECT ${DISPATCH_TASK_SELECT}
       FROM dispatch_tasks
       WHERE ${where.clause}
       ORDER BY created_at DESC
       LIMIT ?`,
      [...where.params, limit],
    );

    return rows.map(mapDispatchTaskRow);
  }

  async listQueuedTasks(
    context: RequestContext,
    cityCode: CityCode,
    limit = 100,
  ): Promise<DispatchTask[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in dispatch task query");
    }

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<DispatchTaskRow[]>(
      `SELECT ${DISPATCH_TASK_SELECT}
       FROM dispatch_tasks
       WHERE ${where.clause} AND status = 'queued'
       ORDER BY created_at DESC, dispatch_task_id DESC
       LIMIT ?`,
      [...where.params, limit],
    );

    return rows.map(mapDispatchTaskRow);
  }

  async listAvailableTasksForWorker(
    context: RequestContext,
    cityCode: CityCode,
    workerId: string,
    limit = 100,
  ): Promise<DispatchTask[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in dispatch task query");
    }

    const [rows] = await this.pool.query<DispatchTaskRow[]>(
      `SELECT DISTINCT ${DISPATCH_TASK_SELECT_ALIASED}
       FROM dispatch_tasks dt
       LEFT JOIN dispatch_offers offer
         ON offer.city_code = dt.city_code
        AND offer.dispatch_task_id = dt.dispatch_task_id
        AND offer.worker_id = ?
        AND offer.status = 'offering'
       WHERE dt.city_code = ?
         AND (
           dt.status = 'queued'
           OR (dt.status IN ('offering', 'reassigning') AND offer.offer_id IS NOT NULL)
         )
       ORDER BY dt.created_at DESC, dt.dispatch_task_id DESC
       LIMIT ?`,
      [workerId, cityCode, limit],
    );

    return rows.map(mapDispatchTaskRow);
  }

  async listTasksForMatching(
    context: RequestContext,
    cityCode: CityCode,
    limit = 50,
  ): Promise<DispatchTask[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in dispatch task query");
    }

    const [rows] = await this.pool.query<DispatchTaskRow[]>(
      `SELECT ${DISPATCH_TASK_SELECT}
       FROM dispatch_tasks
       WHERE city_code = ?
         AND status IN ('queued', 'reassigning')
       ORDER BY created_at ASC, dispatch_task_id ASC
       LIMIT ?`,
      [cityCode, limit],
    );

    return rows.map(mapDispatchTaskRow);
  }

  async findByDispatchTaskId(
    context: RequestContext,
    cityCode: CityCode,
    dispatchTaskId: string,
  ): Promise<DispatchTask | null> {
    this.requireContext(context);
    assertCityScopedContext(context);

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<DispatchTaskRow[]>(
      `SELECT ${DISPATCH_TASK_SELECT}
       FROM dispatch_tasks
       WHERE ${where.clause} AND dispatch_task_id = ?
       LIMIT 1`,
      [...where.params, dispatchTaskId],
    );

    return rows[0] ? mapDispatchTaskRow(rows[0]) : null;
  }

  async markAccepted(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
  ): Promise<boolean> {
    const [result] = await connection.query(
      `UPDATE dispatch_tasks
       SET status = 'accepted', last_reason = NULL
       WHERE dispatch_task_id = ?
         AND city_code = ?
         AND status IN ('queued', 'offering', 'reassigning')`,
      [dispatchTaskId, cityCode],
    );
    return (result as { affectedRows: number }).affectedRows === 1;
  }

  async markOffering(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
    reason: string,
  ): Promise<boolean> {
    const [result] = await connection.query(
      `UPDATE dispatch_tasks
       SET status = 'offering',
           attempt_count = attempt_count + 1,
           last_reason = ?
       WHERE dispatch_task_id = ?
         AND city_code = ?
         AND status IN ('queued', 'reassigning')`,
      [reason, dispatchTaskId, cityCode],
    );
    return (result as { affectedRows: number }).affectedRows === 1;
  }

  async markNoMatch(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
    reason: string,
  ): Promise<void> {
    await connection.query(
      `UPDATE dispatch_tasks
       SET status = 'no_match', last_reason = ?
       WHERE dispatch_task_id = ? AND city_code = ?`,
      [reason, dispatchTaskId, cityCode],
    );
  }

  async markReassigning(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
    reason: string,
  ): Promise<void> {
    await connection.query(
      `UPDATE dispatch_tasks
       SET status = 'reassigning', last_reason = ?
       WHERE dispatch_task_id = ?
         AND city_code = ?
         AND status IN ('offering', 'timeout', 'rejected')`,
      [reason, dispatchTaskId, cityCode],
    );
  }

  async markManualReview(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
    reason: string,
  ): Promise<void> {
    await connection.query(
      `UPDATE dispatch_tasks
       SET status = 'manual_review', last_reason = ?
       WHERE dispatch_task_id = ? AND city_code = ?`,
      [reason, dispatchTaskId, cityCode],
    );
  }

  async markCompleted(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
  ): Promise<void> {
    await connection.query(
      `UPDATE dispatch_tasks
       SET status = 'completed', last_reason = NULL
       WHERE dispatch_task_id = ?
         AND city_code = ?
         AND status IN ('accepted', 'completed')`,
      [dispatchTaskId, cityCode],
    );
  }

  async markOfferAccepted(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
    workerId: string,
  ): Promise<boolean> {
    const [result] = await connection.query(
      `UPDATE dispatch_offers
       SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
       WHERE dispatch_task_id = ?
         AND city_code = ?
         AND worker_id = ?
         AND status = 'offering'`,
      [dispatchTaskId, cityCode, workerId],
    );
    return (result as { affectedRows: number }).affectedRows === 1;
  }

  async markOfferRejected(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
    workerId: string,
  ): Promise<boolean> {
    const [result] = await connection.query(
      `UPDATE dispatch_offers
       SET status = 'rejected', responded_at = CURRENT_TIMESTAMP
       WHERE dispatch_task_id = ?
         AND city_code = ?
         AND worker_id = ?
         AND status = 'offering'`,
      [dispatchTaskId, cityCode, workerId],
    );
    return (result as { affectedRows: number }).affectedRows === 1;
  }

  async markOfferTimeout(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
    workerId: string,
  ): Promise<boolean> {
    const [result] = await connection.query(
      `UPDATE dispatch_offers
       SET status = 'timeout', responded_at = CURRENT_TIMESTAMP
       WHERE dispatch_task_id = ?
         AND city_code = ?
         AND worker_id = ?
         AND status = 'offering'`,
      [dispatchTaskId, cityCode, workerId],
    );
    return (result as { affectedRows: number }).affectedRows === 1;
  }

  async markOtherOffersCancelled(
    connection: PoolConnection,
    dispatchTaskId: string,
    cityCode: CityCode,
    acceptedWorkerId: string,
  ): Promise<void> {
    await connection.query(
      `UPDATE dispatch_offers
       SET status = 'cancelled', responded_at = CURRENT_TIMESTAMP
       WHERE dispatch_task_id = ?
         AND city_code = ?
         AND worker_id <> ?
         AND status = 'offering'`,
      [dispatchTaskId, cityCode, acceptedWorkerId],
    );
  }

  async listOffersForTask(
    context: RequestContext,
    cityCode: CityCode,
    dispatchTaskId: string,
  ): Promise<DispatchOffer[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in dispatch offer query");
    }

    const [rows] = await this.pool.query<DispatchOfferRow[]>(
      `SELECT offer_id, dispatch_task_id, city_code, worker_id, status,
              distance_km, offered_at, responded_at
       FROM dispatch_offers
       WHERE city_code = ? AND dispatch_task_id = ?
       ORDER BY offered_at ASC, distance_km ASC, worker_id ASC`,
      [cityCode, dispatchTaskId],
    );
    return rows.map(mapDispatchOfferRow);
  }

  async listActiveOffersForTask(
    context: RequestContext,
    cityCode: CityCode,
    dispatchTaskId: string,
  ): Promise<DispatchOffer[]> {
    const offers = await this.listOffersForTask(context, cityCode, dispatchTaskId);
    return offers.filter((offer) => offer.status === "offering");
  }

  async findOfferForWorker(
    context: RequestContext,
    cityCode: CityCode,
    dispatchTaskId: string,
    workerId: string,
  ): Promise<DispatchOffer | null> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in dispatch offer query");
    }

    const [rows] = await this.pool.query<DispatchOfferRow[]>(
      `SELECT offer_id, dispatch_task_id, city_code, worker_id, status,
              distance_km, offered_at, responded_at
       FROM dispatch_offers
       WHERE city_code = ? AND dispatch_task_id = ? AND worker_id = ?
       LIMIT 1`,
      [cityCode, dispatchTaskId, workerId],
    );
    return rows[0] ? mapDispatchOfferRow(rows[0]) : null;
  }

  async listOfferWorkerIdsForTask(
    context: RequestContext,
    cityCode: CityCode,
    dispatchTaskId: string,
  ): Promise<string[]> {
    const offers = await this.listOffersForTask(context, cityCode, dispatchTaskId);
    return offers.map((offer) => offer.workerId);
  }

  async listTimedOutOffers(
    context: RequestContext,
    cityCode: CityCode,
    cutoff: Date,
    limit = 100,
  ): Promise<DispatchOffer[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in dispatch offer query");
    }

    const [rows] = await this.pool.query<DispatchOfferRow[]>(
      `SELECT offer_id, dispatch_task_id, city_code, worker_id, status,
              distance_km, offered_at, responded_at
       FROM dispatch_offers
       WHERE city_code = ?
         AND status = 'offering'
         AND offered_at <= ?
       ORDER BY offered_at ASC, offer_id ASC
       LIMIT ?`,
      [cityCode, cutoff, limit],
    );
    return rows.map(mapDispatchOfferRow);
  }

  async listEventsByDispatchTask(
    context: RequestContext,
    cityCode: CityCode,
    dispatchTaskId: string,
  ): Promise<DispatchEvent[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in dispatch event query");
    }

    const [rows] = await this.pool.query<DispatchEventRow[]>(
      `SELECT dispatch_event_id, dispatch_task_id, city_code, event_type,
              worker_id, reason, created_at
       FROM dispatch_events
       WHERE city_code = ? AND dispatch_task_id = ?
       ORDER BY created_at ASC, dispatch_event_id ASC`,
      [cityCode, dispatchTaskId],
    );
    return rows.map(mapDispatchEventRow);
  }

  async findCandidateWorkers(
    context: RequestContext,
    cityCode: CityCode,
    skuId: string,
    excludeWorkerIds: string[],
    limit = 3,
  ): Promise<CandidateWorker[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in worker candidate query");
    }

    const exclusion =
      excludeWorkerIds.length > 0
        ? `AND wp.worker_id NOT IN (${excludeWorkerIds.map(() => "?").join(", ")})`
        : "";
    const [rows] = await this.pool.query<CandidateWorkerRow[]>(
      `SELECT wp.worker_id, wp.distance_km
       FROM worker_profiles wp
       INNER JOIN worker_city_bindings wcb
          ON wcb.worker_id = wp.worker_id
         AND wcb.city_code = ?
         AND wcb.is_enabled = 1
       INNER JOIN worker_online_status wos
          ON wos.worker_id = wp.worker_id
         AND wos.city_code = ?
         AND wos.is_online = 1
       INNER JOIN worker_qualifications wq
          ON wq.worker_id = wp.worker_id
         AND wq.city_code = ?
         AND wq.sku_id = ?
         AND wq.is_eligible = 1
       WHERE wp.status = 'active'
         AND wp.dispatch_status = 'available'
         AND wp.is_certified = 1
         ${exclusion}
       ORDER BY COALESCE(wp.distance_km, 9999.99) ASC, wp.worker_id ASC
       LIMIT ?`,
      [cityCode, cityCode, cityCode, skuId, ...excludeWorkerIds, limit],
    );

    return rows.map((row) => ({
      workerId: row.worker_id,
      distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    }));
  }
}

export const dispatchRepository = new DispatchRepository();
