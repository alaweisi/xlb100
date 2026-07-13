import { randomUUID } from "node:crypto";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { CityCode } from "@xlb/types";
import type { EventOutbox, OutboxEventType } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";
import {
  OUTBOX_DEFAULT_LEASE_SECONDS,
  retryDelaySeconds,
  sanitizeOutboxError,
  outboxErrorCode,
} from "./outboxDeliveryPolicy.js";

type OutboxRow = RowDataPacket & {
  event_id: string;
  event_type: string;
  event_major_version: number;
  aggregate_type: string;
  aggregate_id: string;
  city_code: string;
  payload_json: string | Record<string, unknown>;
  status: string;
  created_at: Date;
  published_at: Date | null;
  processing_started_at: Date | null;
  lease_owner: string | null;
  lease_token: string | null;
  lease_expires_at: Date | null;
  attempt_count: number;
  max_attempts: number;
  available_at: Date;
  last_error_code: string | null;
  last_error_message: string | null;
  last_failed_at: Date | null;
  dead_lettered_at: Date | null;
  updated_at: Date;
};

function mapOutboxRow(row: OutboxRow): EventOutbox {
  const payload =
    typeof row.payload_json === "string"
      ? (JSON.parse(row.payload_json) as Record<string, unknown>)
      : row.payload_json;
  return {
    eventId: row.event_id,
    eventType: row.event_type as EventOutbox["eventType"],
    eventMajorVersion: Number(row.event_major_version),
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    cityCode: row.city_code as CityCode,
    payload,
    status: row.status as EventOutbox["status"],
    createdAt: row.created_at.toISOString(),
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
    processingStartedAt: row.processing_started_at?.toISOString() ?? null,
    leaseOwner: row.lease_owner,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at?.toISOString() ?? null,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at.toISOString(),
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    lastFailedAt: row.last_failed_at?.toISOString() ?? null,
    deadLetteredAt: row.dead_lettered_at?.toISOString() ?? null,
    updatedAt: row.updated_at.toISOString(),
  };
}

const OUTBOX_COLUMNS = `e.event_id, e.event_type, e.event_major_version, e.aggregate_type, e.aggregate_id,
  e.city_code, e.payload_json, e.status, e.created_at, e.published_at,
  e.processing_started_at, e.lease_owner, e.lease_token, e.lease_expires_at,
  e.attempt_count, e.max_attempts, e.available_at, e.last_error_code,
  e.last_error_message, e.last_failed_at, e.dead_lettered_at, e.updated_at`;

export type OutboxClaim = Omit<EventOutbox, "status" | "leaseOwner" | "leaseToken" | "leaseExpiresAt" | "attemptCount" | "maxAttempts"> & {
  status: "processing";
  leaseOwner: string;
  leaseToken: string;
  leaseExpiresAt: string;
  attemptCount: number;
  maxAttempts: number;
};

type ClaimKind = "dispatch" | "fulfillment-ledger" | "event-type";

export type InsertOutboxEventInput = {
  eventId: string;
  eventType: OutboxEventType;
  eventMajorVersion?: number;
  aggregateType: string;
  aggregateId: string;
  cityCode: CityCode;
  payload: Record<string, unknown>;
};

export class EventOutboxRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  private async claim(
    context: RequestContext,
    cityCode: CityCode,
    owner: string,
    eventType: OutboxEventType,
    kind: ClaimKind,
    limit = 25,
    leaseSeconds = OUTBOX_DEFAULT_LEASE_SECONDS,
  ): Promise<OutboxClaim[]> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) throw new Error("city_code mismatch in outbox claim");
    if (!owner || owner.length > 128) throw new Error("outbox lease owner is invalid");
    const safeLimit = Math.max(1, Math.min(25, Math.trunc(limit)));
    const safeLease = Math.max(5, Math.min(3600, Math.trunc(leaseSeconds)));
    const token = randomUUID();
    const connection = await this.pool.getConnection();
    try {
      // READ COMMITTED avoids REPEATABLE READ next-key range locks causing one
      // claimant to monopolize the whole eligible queue range. Row locks plus
      // SKIP LOCKED still guarantee that each event belongs to one claimant.
      await connection.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await connection.beginTransaction();
      const joins = kind === "dispatch"
        ? "INNER JOIN orders o ON o.city_code=e.city_code AND o.order_id=e.aggregate_id"
        : kind === "fulfillment-ledger"
          ? `INNER JOIN fulfillments f ON f.city_code=e.city_code AND f.fulfillment_id=e.aggregate_id
             INNER JOIN orders o ON o.city_code=f.city_code AND o.order_id=f.order_id
             INNER JOIN payment_orders p ON p.city_code=o.city_code AND p.order_id=o.order_id AND p.status='paid'`
          : "";
      const eligibility = kind === "dispatch"
        ? "AND o.status='pending_dispatch'"
        : kind === "fulfillment-ledger"
          ? "AND f.status='completed' AND o.status='paid'"
          : "";
      const locked: (RowDataPacket & { event_id: string })[] = [];
      // Exact status scans preserve the typed-claim index order. A combined
      // status IN (...) scan requires a merge/filesort and can lock rows beyond
      // LIMIT, starving otherwise independent SKIP LOCKED consumers.
      for (const status of ["pending", "retry_wait"] as const) {
        const remaining = safeLimit - locked.length;
        if (remaining === 0) break;
        const [statusRows] = await connection.query<(RowDataPacket & { event_id: string })[]>(
          `SELECT e.event_id FROM event_outbox e FORCE INDEX (idx_event_outbox_typed_claim) ${joins}
           WHERE e.city_code=? AND e.event_type=? AND e.status=?
             AND e.available_at<=CURRENT_TIMESTAMP(3)
             AND e.attempt_count<e.max_attempts
             ${eligibility}
           ORDER BY e.available_at ASC, e.created_at ASC
           LIMIT ? FOR UPDATE SKIP LOCKED`,
          [cityCode, eventType, status, remaining],
        );
        locked.push(...statusRows);
      }
      if (locked.length === 0) {
        await connection.commit();
        return [];
      }
      const ids = locked.map((row) => row.event_id);
      const placeholders = ids.map(() => "?").join(",");
      await connection.query(
        `UPDATE event_outbox SET status='processing', processing_started_at=CURRENT_TIMESTAMP(3),
          lease_owner=?, lease_token=?, lease_expires_at=TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(3)),
          attempt_count=attempt_count+1, last_error_code=NULL, last_error_message=NULL
         WHERE city_code=? AND event_id IN (${placeholders})
           AND status IN ('pending','retry_wait')`,
        [owner, token, safeLease, cityCode, ...ids],
      );
      const [rows] = await connection.query<OutboxRow[]>(
        `SELECT ${OUTBOX_COLUMNS} FROM event_outbox e
         WHERE e.city_code=? AND e.event_id IN (${placeholders})
           AND e.status='processing' AND e.lease_owner=? AND e.lease_token=?
         ORDER BY e.created_at ASC`,
        [cityCode, ...ids, owner, token],
      );
      await connection.commit();
      return rows.map(mapOutboxRow) as OutboxClaim[];
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  claimOrderCreatedForDispatch(context: RequestContext, cityCode: CityCode, owner: string, limit = 25) {
    return this.claim(context, cityCode, owner, "order.created", "dispatch", limit);
  }

  claimFulfillmentCompletedForLedger(context: RequestContext, cityCode: CityCode, owner: string, limit = 25) {
    return this.claim(context, cityCode, owner, "fulfillment.completed", "fulfillment-ledger", limit);
  }

  claimEventsByType(context: RequestContext, cityCode: CityCode, eventType: OutboxEventType, owner: string, limit = 25) {
    return this.claim(context, cityCode, owner, eventType, "event-type", limit);
  }

  async acknowledgeClaim(connection: PoolConnection, claim: OutboxClaim): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE event_outbox SET status='published', published_at=CURRENT_TIMESTAMP(3),
        lease_owner=NULL, lease_token=NULL, lease_expires_at=NULL,
        last_error_code=NULL, last_error_message=NULL
       WHERE event_id=? AND city_code=? AND status='processing' AND lease_owner=? AND lease_token=?
         AND lease_expires_at>CURRENT_TIMESTAMP(3)`,
      [claim.eventId, claim.cityCode, claim.leaseOwner, claim.leaseToken],
    );
    return result.affectedRows === 1;
  }

  async renewClaim(claim: OutboxClaim, leaseSeconds = OUTBOX_DEFAULT_LEASE_SECONDS): Promise<boolean> {
    const safeLease = Math.max(5, Math.min(3600, Math.trunc(leaseSeconds)));
    const [result] = await this.pool.query<ResultSetHeader>(
      `UPDATE event_outbox SET lease_expires_at=TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(3))
       WHERE event_id=? AND city_code=? AND status='processing' AND lease_owner=? AND lease_token=?
         AND lease_expires_at>CURRENT_TIMESTAMP(3)`,
      [safeLease, claim.eventId, claim.cityCode, claim.leaseOwner, claim.leaseToken],
    );
    return result.affectedRows === 1;
  }

  async failClaim(claim: OutboxClaim, error: unknown, maxAttempts = claim.maxAttempts): Promise<"retry_wait" | "dead_letter" | "lost"> {
    const effectiveMax = Math.max(1, Math.min(claim.maxAttempts, maxAttempts));
    const deadLetter = claim.attemptCount >= effectiveMax;
    const nextStatus = deadLetter ? "dead_letter" : "retry_wait";
    const delay = retryDelaySeconds(claim.attemptCount);
    const [result] = await this.pool.query<ResultSetHeader>(
      `UPDATE event_outbox SET status=?, available_at=TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(3)),
        last_error_code=?, last_error_message=?, last_failed_at=CURRENT_TIMESTAMP(3),
        dead_lettered_at=IF(?='dead_letter', CURRENT_TIMESTAMP(3), dead_lettered_at),
        lease_owner=NULL, lease_token=NULL, lease_expires_at=NULL
       WHERE event_id=? AND city_code=? AND status='processing' AND lease_owner=? AND lease_token=?
         AND lease_expires_at>CURRENT_TIMESTAMP(3)`,
      [nextStatus, delay, outboxErrorCode(error), sanitizeOutboxError(error), nextStatus,
        claim.eventId, claim.cityCode, claim.leaseOwner, claim.leaseToken],
    );
    return result.affectedRows === 1 ? nextStatus : "lost";
  }

  async reapExpiredLeases(cityCode: CityCode, limit = 500): Promise<number> {
    const safeLimit = Math.max(1, Math.min(5000, Math.trunc(limit)));
    const params: unknown[] = [cityCode, safeLimit];
    const [result] = await this.pool.query<ResultSetHeader>(
      `UPDATE event_outbox SET status=IF(attempt_count>=max_attempts, 'dead_letter', 'retry_wait'),
         available_at=CURRENT_TIMESTAMP(3), last_error_code='LEASE_EXPIRED',
         last_error_message='outbox processing lease expired', last_failed_at=CURRENT_TIMESTAMP(3),
         dead_lettered_at=IF(attempt_count>=max_attempts, CURRENT_TIMESTAMP(3), dead_lettered_at),
         lease_owner=NULL, lease_token=NULL, lease_expires_at=NULL
       WHERE city_code=? AND status='processing' AND lease_expires_at<=CURRENT_TIMESTAMP(3)
       ORDER BY lease_expires_at ASC LIMIT ?`,
      params,
    );
    return result.affectedRows;
  }

  async insertEvent(
    connection: PoolConnection,
    input: InsertOutboxEventInput,
  ): Promise<void> {
    const eventMajorVersion = input.eventMajorVersion ?? 0;
    if (
      !Number.isInteger(eventMajorVersion) ||
      eventMajorVersion < 0 ||
      eventMajorVersion > 65535
    ) {
      throw new Error("outbox event major version is invalid");
    }
    if (
      (input.eventType === "review.created" || input.eventType === "review.visibility.changed") &&
      input.eventMajorVersion !== 1
    ) {
      throw new Error(`${input.eventType} requires explicit event major version 1`);
    }
    await connection.query(
      `INSERT INTO event_outbox
        (event_id, event_type, event_major_version, aggregate_type, aggregate_id, city_code, payload_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        input.eventId,
        input.eventType,
        eventMajorVersion,
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
      `SELECT ${OUTBOX_COLUMNS}
       FROM event_outbox e
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
      `SELECT ${OUTBOX_COLUMNS}
       FROM event_outbox e
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
      `SELECT ${OUTBOX_COLUMNS}
       FROM event_outbox e
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
      `SELECT ${OUTBOX_COLUMNS}
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
      `SELECT ${OUTBOX_COLUMNS}
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

}

export const eventOutboxRepository = new EventOutboxRepository();
