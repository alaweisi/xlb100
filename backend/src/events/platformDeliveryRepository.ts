import { createHash, randomUUID } from "node:crypto";
import type {
  PlatformDeliveryClaim,
  PlatformDeliveryClaimRequest,
  PlatformDeliveryMutationRequest,
  PlatformDeliveryMutationResult,
  PlatformEventDelivery,
  PlatformEventSubscription,
  PlatformServiceIdentity,
} from "@xlb/types";
import type { OutboxEventType } from "@xlb/types";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../dal/mysqlPool.js";
import {
  PLATFORM_DELIVERY_CANONICAL_ERRORS,
  platformRetryDelaySeconds,
  projectPlatformDeliveryError,
  type PlatformDeliveryErrorProjection,
} from "./platformDeliveryPolicy.js";

type SubscriptionRow = RowDataPacket & {
  subscription_id: string;
  city_code: string;
  subscriber_id: string;
  event_type: OutboxEventType;
  event_major_version: number;
  compatibility_handler_revision: string;
  retention_class: "R1" | "R2" | "R3" | "R4";
  status: "proposed" | "active" | "paused" | "revoked";
  lease_seconds: number;
  max_attempts: number;
  row_version: number;
  live_start_created_at: Date | null;
  live_start_event_id: string | null;
};

export type PlatformSourceEventRow = RowDataPacket & {
  event_id: string;
  event_type: OutboxEventType;
  event_major_version: number;
  aggregate_type: string;
  aggregate_id: string;
  city_code: string;
  payload_json: unknown;
  created_at: Date;
  commit_skew_risk?: number;
};

type DeliveryRow = RowDataPacket & {
  delivery_id: string;
  city_code: string;
  subscriber_id: string;
  subscription_id: string;
  event_id: string;
  event_type: OutboxEventType;
  event_major_version: number;
  payload_hash: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number | null;
  aggregate_sequence: number | null;
  status: PlatformEventDelivery["status"];
  available_at: Date;
  lease_owner: string | null;
  lease_token: string | null;
  lease_expires_at: Date | null;
  attempt_count: number;
  max_attempts: number;
  last_error_code: string | null;
  last_error_message: string | null;
  delivered_at: Date | null;
  dead_lettered_at: Date | null;
  row_version: number;
};

export type PlatformClaimCompatibilitySourceRow = RowDataPacket & {
  delivery_id: string;
  city_code: string;
  subscriber_id: string;
  subscription_id: string;
  event_id: string;
  event_type: OutboxEventType;
  event_major_version: number;
  payload_hash: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number | null;
  aggregate_sequence: number | null;
  compatibility_handler_revision: string;
  payload_json: unknown;
  source_snapshot_consistent?: boolean;
};

const DELIVERY_COLUMNS = `d.delivery_id,d.city_code,d.subscriber_id,d.subscription_id,
  d.event_id,d.event_type,d.event_major_version,d.payload_hash,d.aggregate_type,d.aggregate_id,
  d.aggregate_version,d.aggregate_sequence,
  d.status,d.available_at,d.lease_owner,d.lease_token,d.lease_expires_at,d.attempt_count,
  d.max_attempts,d.last_error_code,d.last_error_message,d.delivered_at,d.dead_lettered_at,d.row_version`;

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function parsePayload(value: unknown): unknown {
  if (typeof value === "string") return JSON.parse(value);
  if (Buffer.isBuffer(value)) return JSON.parse(value.toString("utf8"));
  return value;
}

function mapSubscription(row: SubscriptionRow): PlatformEventSubscription {
  return {
    subscriptionId: row.subscription_id,
    cityCode: row.city_code,
    subscriberId: row.subscriber_id,
    eventType: row.event_type,
    eventMajorVersion: Number(row.event_major_version),
    compatibilityHandlerRevision: row.compatibility_handler_revision,
    retentionClass: row.retention_class,
    status: row.status,
    leaseSeconds: Number(row.lease_seconds),
    maxAttempts: Number(row.max_attempts),
    rowVersion: Number(row.row_version),
  };
}

function mapDelivery(row: DeliveryRow): PlatformEventDelivery {
  return {
    deliveryId: row.delivery_id,
    cityCode: row.city_code,
    subscriberId: row.subscriber_id,
    subscriptionId: row.subscription_id,
    eventId: row.event_id,
    eventType: row.event_type,
    eventMajorVersion: Number(row.event_major_version),
    payloadHash: row.payload_hash,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version === null ? null : Number(row.aggregate_version),
    aggregateSequence: row.aggregate_sequence === null ? null : Number(row.aggregate_sequence),
    status: row.status,
    availableAt: row.available_at.toISOString(),
    leaseOwner: row.lease_owner,
    leaseToken: row.lease_token,
    leaseExpiresAt: iso(row.lease_expires_at),
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    deliveredAt: iso(row.delivered_at),
    deadLetteredAt: iso(row.dead_lettered_at),
    rowVersion: Number(row.row_version),
  };
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export class PlatformDeliveryRepository {
  constructor(private readonly pool: Pool = getMysqlPool()) {}

  async findActiveSubscription(
    identity: PlatformServiceIdentity,
    subscriptionId: string,
  ): Promise<(PlatformEventSubscription & { liveStartCreatedAt: Date; liveStartEventId: string }) | null> {
    const [rows] = await this.pool.query<SubscriptionRow[]>(
      `SELECT s.* FROM platform_event_subscriptions s
       INNER JOIN platform_event_subscribers p ON p.subscriber_id=s.subscriber_id
       WHERE s.subscription_id=? AND s.city_code=? AND s.subscriber_id=?
         AND s.status='active' AND p.status='active'
         AND s.live_start_created_at IS NOT NULL AND s.live_start_event_id IS NOT NULL
       LIMIT 1`,
      [subscriptionId, identity.cityCode, identity.subscriberId],
    );
    const row = rows[0];
    if (!row?.live_start_created_at || !row.live_start_event_id) return null;
    return {
      ...mapSubscription(row),
      liveStartCreatedAt: row.live_start_created_at,
      liveStartEventId: row.live_start_event_id,
    };
  }

  /**
   * Reads raw source payload only inside the Events boundary and only for the
   * caller's exact, currently leased delivery. Notification never receives
   * this row; the service immediately validates and narrows it.
   */
  async readClaimCompatibilitySource(
    identity: PlatformServiceIdentity,
    request: PlatformDeliveryMutationRequest,
    connection?: PoolConnection,
    lockForUpdate = false,
  ): Promise<PlatformClaimCompatibilitySourceRow | null> {
    const executor = connection ?? this.pool;
    const eventProjection = lockForUpdate ? "NULL AS payload_json" : "e.payload_json";
    const eventJoin = lockForUpdate
      ? ""
      : `INNER JOIN event_outbox e ON e.city_code=d.city_code AND e.event_id=d.event_id
           AND e.event_type=d.event_type AND e.event_major_version=d.event_major_version
           AND e.aggregate_type=d.aggregate_type AND e.aggregate_id=d.aggregate_id`;
    const [rows] = await executor.query<PlatformClaimCompatibilitySourceRow[]>(
      `SELECT d.delivery_id,d.city_code,d.subscriber_id,d.subscription_id,d.event_id,
         d.event_type,d.event_major_version,d.payload_hash,d.aggregate_type,d.aggregate_id,
         d.aggregate_version,d.aggregate_sequence,s.compatibility_handler_revision,
         ${eventProjection}
       FROM platform_event_deliveries d
       INNER JOIN platform_event_subscriptions s
         ON s.city_code=d.city_code AND s.subscription_id=d.subscription_id
        AND s.subscriber_id=d.subscriber_id AND s.event_type=d.event_type
        AND s.event_major_version=d.event_major_version
       INNER JOIN platform_event_subscribers p ON p.subscriber_id=d.subscriber_id
       ${eventJoin}
       WHERE d.delivery_id=? AND d.city_code=? AND d.subscriber_id=? AND d.subscription_id=?
         AND d.status='processing' AND d.lease_owner=? AND d.lease_token=?
         AND d.lease_expires_at>CURRENT_TIMESTAMP(3) AND d.row_version=?
         AND s.status='active' AND p.status='active'
         AND s.live_start_created_at IS NOT NULL AND s.live_start_event_id IS NOT NULL
       LIMIT 1${lockForUpdate ? " FOR UPDATE" : ""}`,
      [
        request.deliveryId,
        identity.cityCode,
        identity.subscriberId,
        request.subscriptionId,
        request.owner,
        request.leaseToken,
        request.expectedRowVersion,
      ],
    );
    const row = rows[0];
    if (!row) return null;
    if (lockForUpdate) {
      const [snapshotRows] = await executor.query<(RowDataPacket & {
        payload_json: unknown; event_major_version: number; aggregate_type: string; aggregate_id: string;
      })[]>(
        `SELECT payload_json,event_major_version,aggregate_type,aggregate_id FROM event_outbox
         WHERE city_code=? AND event_id=? LIMIT 1`,
        [row.city_code, row.event_id],
      );
      const [lockedRows] = await executor.query<(RowDataPacket & {
        payload_json: unknown; event_major_version: number; aggregate_type: string; aggregate_id: string;
      })[]>(
        `SELECT payload_json,event_major_version,aggregate_type,aggregate_id FROM event_outbox
         WHERE city_code=? AND event_id=? LIMIT 1 FOR UPDATE`,
        [row.city_code, row.event_id],
      );
      const [committedRows] = await this.pool.query<(RowDataPacket & {
        payload_json: unknown; event_major_version: number; aggregate_type: string; aggregate_id: string;
      })[]>(
        `SELECT payload_json,event_major_version,aggregate_type,aggregate_id FROM event_outbox
         WHERE city_code=? AND event_id=? LIMIT 1`,
        [row.city_code, row.event_id],
      );
      if (!snapshotRows[0] || !lockedRows[0] || !committedRows[0]) return null;
      const snapshotPayload = parsePayload(snapshotRows[0].payload_json);
      const lockedPayload = parsePayload(lockedRows[0].payload_json);
      const committedPayload = parsePayload(committedRows[0].payload_json);
      return {
        ...row,
        payload_json: lockedPayload,
        source_snapshot_consistent:
          Number(snapshotRows[0].event_major_version) === Number(row.event_major_version) &&
          Number(lockedRows[0].event_major_version) === Number(row.event_major_version) &&
          Number(committedRows[0].event_major_version) === Number(row.event_major_version) &&
          snapshotRows[0].aggregate_type === row.aggregate_type &&
          lockedRows[0].aggregate_type === row.aggregate_type &&
          committedRows[0].aggregate_type === row.aggregate_type &&
          snapshotRows[0].aggregate_id === row.aggregate_id &&
          lockedRows[0].aggregate_id === row.aggregate_id &&
          committedRows[0].aggregate_id === row.aggregate_id &&
          JSON.stringify(snapshotPayload) === JSON.stringify(lockedPayload) &&
          JSON.stringify(committedPayload) === JSON.stringify(lockedPayload),
      };
    }
    return { ...row, payload_json: parsePayload(row.payload_json) };
  }

  async listCandidateSourceEvents(
    subscription: PlatformEventSubscription & { liveStartCreatedAt: Date; liveStartEventId: string },
    limit: number,
  ): Promise<PlatformSourceEventRow[]> {
    const [rows] = await this.pool.query<PlatformSourceEventRow[]>(
      `SELECT e.event_id,e.event_type,e.event_major_version,e.aggregate_type,e.aggregate_id,e.city_code,e.payload_json,e.created_at
       FROM event_outbox e
       LEFT JOIN platform_event_materialization_checkpoints c
         ON c.city_code=? AND c.subscription_id=?
       WHERE e.city_code=? AND e.event_type=? AND e.event_major_version=?
         AND (e.created_at>? OR (e.created_at=? AND e.event_id>=?))
         AND (c.candidate_created_at IS NULL OR e.created_at>c.candidate_created_at
           OR (e.created_at=c.candidate_created_at AND e.event_id>c.candidate_event_id))
       ORDER BY e.created_at ASC,e.event_id ASC LIMIT ?`,
      [
        subscription.cityCode,
        subscription.subscriptionId,
        subscription.cityCode,
        subscription.eventType,
        subscription.eventMajorVersion,
        subscription.liveStartCreatedAt,
        subscription.liveStartCreatedAt,
        subscription.liveStartEventId,
        limit,
      ],
    );
    return rows.map((row) => ({ ...row, payload_json: parsePayload(row.payload_json) })) as PlatformSourceEventRow[];
  }

  async listReconciliationGaps(
    subscription: PlatformEventSubscription & { liveStartCreatedAt: Date; liveStartEventId: string },
    limit: number,
  ): Promise<PlatformSourceEventRow[]> {
    const [rows] = await this.pool.query<PlatformSourceEventRow[]>(
      `SELECT e.event_id,e.event_type,e.event_major_version,e.aggregate_type,e.aggregate_id,e.city_code,e.payload_json,e.created_at,
         CASE WHEN c.candidate_created_at IS NOT NULL
           AND (e.created_at<c.candidate_created_at
             OR (e.created_at=c.candidate_created_at AND e.event_id<=c.candidate_event_id))
           THEN 1 ELSE 0 END AS commit_skew_risk
       FROM event_outbox e
       LEFT JOIN platform_event_deliveries d
         ON d.subscriber_id=? AND d.event_id=e.event_id
       LEFT JOIN platform_event_delivery_actions r
         ON r.city_code=e.city_code AND r.subscription_id_copy=? AND r.subscriber_id_copy=?
           AND r.event_id_copy=e.event_id AND r.compatibility_handler_revision_copy=?
           AND r.action_kind='materialization_rejected'
       LEFT JOIN platform_event_materialization_checkpoints c
         ON c.city_code=? AND c.subscription_id=?
       WHERE e.city_code=? AND e.event_type=? AND e.event_major_version=?
         AND d.delivery_id IS NULL AND r.action_id IS NULL
         AND (e.created_at>? OR (e.created_at=? AND e.event_id>=?))
       ORDER BY e.created_at ASC,e.event_id ASC LIMIT ?`,
      [
        subscription.subscriberId,
        subscription.subscriptionId,
        subscription.subscriberId,
        subscription.compatibilityHandlerRevision,
        subscription.cityCode,
        subscription.subscriptionId,
        subscription.cityCode,
        subscription.eventType,
        subscription.eventMajorVersion,
        subscription.liveStartCreatedAt,
        subscription.liveStartCreatedAt,
        subscription.liveStartEventId,
        limit,
      ],
    );
    return rows.map((row) => ({
      ...row,
      payload_json: parsePayload(row.payload_json),
      commit_skew_risk: Number(row.commit_skew_risk ?? 0),
    })) as PlatformSourceEventRow[];
  }

  async hasReconciliationGap(
    subscription: PlatformEventSubscription & { liveStartCreatedAt: Date; liveStartEventId: string },
  ): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT e.event_id
       FROM event_outbox e
       LEFT JOIN platform_event_deliveries d
         ON d.subscriber_id=? AND d.event_id=e.event_id
       LEFT JOIN platform_event_delivery_actions r
         ON r.city_code=e.city_code AND r.subscription_id_copy=? AND r.subscriber_id_copy=?
           AND r.event_id_copy=e.event_id AND r.compatibility_handler_revision_copy=?
           AND r.action_kind='materialization_rejected'
       WHERE e.city_code=? AND e.event_type=? AND e.event_major_version=?
         AND d.delivery_id IS NULL AND r.action_id IS NULL
         AND (e.created_at>? OR (e.created_at=? AND e.event_id>=?))
       ORDER BY e.created_at ASC,e.event_id ASC LIMIT 1`,
      [
        subscription.subscriberId,
        subscription.subscriptionId,
        subscription.subscriberId,
        subscription.compatibilityHandlerRevision,
        subscription.cityCode,
        subscription.eventType,
        subscription.eventMajorVersion,
        subscription.liveStartCreatedAt,
        subscription.liveStartCreatedAt,
        subscription.liveStartEventId,
      ],
    );
    return rows.length > 0;
  }

  async insertDelivery(
    subscription: PlatformEventSubscription,
    source: PlatformSourceEventRow,
    payloadHash: string,
    actorServiceId: string,
    reason: "materialized" | "reconciliation_repair",
    aggregateVersion: number | null,
    aggregateSequence: number | null,
  ): Promise<boolean> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const deliveryId = id("pdl");
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO platform_event_deliveries
          (delivery_id,city_code,subscriber_id,subscription_id,event_id,event_type,event_major_version,
           payload_hash,aggregate_type,aggregate_id,aggregate_version,aggregate_sequence,status,max_attempts)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)
         ON DUPLICATE KEY UPDATE delivery_id=delivery_id`,
        [
          deliveryId,
          subscription.cityCode,
          subscription.subscriberId,
          subscription.subscriptionId,
          source.event_id,
          source.event_type,
          subscription.eventMajorVersion,
          payloadHash,
          source.aggregate_type,
          source.aggregate_id,
          aggregateVersion,
          aggregateSequence,
          subscription.maxAttempts,
        ],
      );
      const inserted = result.affectedRows === 1;
      if (inserted) {
        await connection.query(
          `INSERT INTO platform_event_delivery_actions
            (action_id,city_code,delivery_id_copy,event_id_copy,subscriber_id_copy,payload_hash_copy,
             action_kind,actor_type,actor_id,reason_code,reason,actual_row_version)
           VALUES (?,?,?,?,?, ?,?,'platform_service',?,?,?,1)`,
          [
            id("pda"), subscription.cityCode, deliveryId, source.event_id, subscription.subscriberId,
            payloadHash, reason, actorServiceId,
            reason === "materialized" ? "CANDIDATE_SCAN" : "ANTI_JOIN_REPAIR",
            reason === "materialized"
              ? "candidate scan materialized an eligible retained source event"
              : "retained-source anti-join repaired a missing subscriber delivery",
          ],
        );
      }
      await connection.commit();
      return inserted;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async recordMaterializationRejection(
    subscription: PlatformEventSubscription,
    source: PlatformSourceEventRow,
    payloadHash: string,
    actorServiceId: string,
    failure: PlatformDeliveryErrorProjection,
  ): Promise<boolean> {
    const [result] = await this.pool.query<ResultSetHeader>(
      `INSERT INTO platform_event_delivery_actions
        (action_id,city_code,event_id_copy,subscription_id_copy,subscriber_id_copy,
         compatibility_handler_revision_copy,payload_hash_copy,action_kind,
         actor_type,actor_id,reason_code,reason,change_reference)
       VALUES (?,?,?,?,?,?,?,'materialization_rejected','platform_service',?,?,?,?)
       ON DUPLICATE KEY UPDATE action_id=action_id`,
      [
        id("pda"), subscription.cityCode, source.event_id, subscription.subscriptionId,
        subscription.subscriberId, subscription.compatibilityHandlerRevision, payloadHash,
        actorServiceId, failure.code, failure.message,
        `${subscription.subscriptionId}:${subscription.compatibilityHandlerRevision}`.slice(0, 255),
      ],
    );
    return result.affectedRows === 1;
  }

  async advanceCandidateCheckpoint(
    subscription: PlatformEventSubscription,
    source: PlatformSourceEventRow,
    scanCount: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO platform_event_materialization_checkpoints
        (checkpoint_id,city_code,subscription_id,candidate_created_at,candidate_event_id,last_scan_at,last_scan_count)
       VALUES (?,?,?,?,?,CURRENT_TIMESTAMP(3),?)
       ON DUPLICATE KEY UPDATE
         candidate_created_at=VALUES(candidate_created_at),candidate_event_id=VALUES(candidate_event_id),
         last_scan_at=CURRENT_TIMESTAMP(3),last_scan_count=VALUES(last_scan_count),row_version=row_version+1`,
      [id("pmc"), subscription.cityCode, subscription.subscriptionId, source.created_at, source.event_id, scanCount],
    );
  }

  async recordPartialReconciliation(
    subscription: PlatformEventSubscription,
    gapEventIds: string[],
  ): Promise<void> {
    const hash = createHash("sha256").update([...gapEventIds].sort().join("\n"), "utf8").digest("hex");
    await this.pool.query(
      `INSERT INTO platform_event_materialization_checkpoints
        (checkpoint_id,city_code,subscription_id,last_reconciliation_started_at,
         last_reconciliation_completed_at,last_reconciliation_count,last_reconciliation_hash,last_reconciliation_result)
       VALUES (?,?,?,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),?,?,'partial')
       ON DUPLICATE KEY UPDATE
         last_reconciliation_started_at=CURRENT_TIMESTAMP(3),
         last_reconciliation_completed_at=CURRENT_TIMESTAMP(3),
         last_reconciliation_count=VALUES(last_reconciliation_count),
         last_reconciliation_hash=VALUES(last_reconciliation_hash),
         last_reconciliation_result=VALUES(last_reconciliation_result),row_version=row_version+1`,
      [
        id("pmc"), subscription.cityCode, subscription.subscriptionId,
        gapEventIds.length, hash,
      ],
    );
  }

  async claim(
    identity: PlatformServiceIdentity,
    subscription: PlatformEventSubscription,
    request: PlatformDeliveryClaimRequest,
  ): Promise<PlatformDeliveryClaim[]> {
    const connection = await this.pool.getConnection();
    const limit = Math.max(1, Math.min(100, request.limit ?? 25));
    const leaseSeconds = Math.max(5, Math.min(subscription.leaseSeconds, request.leaseSeconds ?? subscription.leaseSeconds));
    try {
      await connection.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await connection.beginTransaction();
      const locked: (RowDataPacket & { delivery_id: string })[] = [];
      for (const status of ["pending", "retry_wait"] as const) {
        const remaining = limit - locked.length;
        if (remaining === 0) break;
        const [rows] = await connection.query<(RowDataPacket & { delivery_id: string })[]>(
          `SELECT d.delivery_id FROM platform_event_deliveries d
           WHERE d.city_code=? AND d.subscriber_id=? AND d.subscription_id=? AND d.status=?
             AND d.available_at<=CURRENT_TIMESTAMP(3) AND d.attempt_count<d.max_attempts
           ORDER BY d.available_at ASC,d.created_at ASC
           LIMIT ? FOR UPDATE SKIP LOCKED`,
          [identity.cityCode, identity.subscriberId, subscription.subscriptionId, status, remaining],
        );
        locked.push(...rows);
      }
      const claims: PlatformDeliveryClaim[] = [];
      for (const lockedRow of locked) {
        const token = randomUUID();
        await connection.query(
          `UPDATE platform_event_deliveries
           SET status='processing',lease_owner=?,lease_token=?,
             lease_expires_at=TIMESTAMPADD(SECOND,?,CURRENT_TIMESTAMP(3)),
             attempt_count=attempt_count+1,last_error_code=NULL,last_error_message=NULL,row_version=row_version+1
           WHERE delivery_id=? AND city_code=? AND subscriber_id=?
             AND status IN ('pending','retry_wait')`,
          [request.owner, token, leaseSeconds, lockedRow.delivery_id, identity.cityCode, identity.subscriberId],
        );
        const [rows] = await connection.query<DeliveryRow[]>(
          `SELECT ${DELIVERY_COLUMNS} FROM platform_event_deliveries d WHERE d.delivery_id=?`,
          [lockedRow.delivery_id],
        );
        const delivery = rows[0];
        if (!delivery) continue;
        await connection.query(
          `INSERT INTO platform_event_delivery_attempts
            (attempt_id,city_code,delivery_id,attempt_number,lease_owner,lease_token_hash,outcome)
           VALUES (?,?,?,?,?,?,'processing')`,
          [id("pat"), identity.cityCode, delivery.delivery_id, delivery.attempt_count, request.owner, tokenHash(token)],
        );
        claims.push(mapDelivery(delivery) as PlatformDeliveryClaim);
      }
      await connection.commit();
      return claims;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async acknowledge(
    identity: PlatformServiceIdentity,
    request: PlatformDeliveryMutationRequest,
  ): Promise<PlatformDeliveryMutationResult> {
    return this.finishClaim(identity, request, null);
  }

  async fail(
    identity: PlatformServiceIdentity,
    request: PlatformDeliveryMutationRequest,
    error: unknown,
  ): Promise<PlatformDeliveryMutationResult> {
    return this.finishClaim(identity, request, error);
  }

  private async finishClaim(
    identity: PlatformServiceIdentity,
    request: PlatformDeliveryMutationRequest,
    error: unknown | null,
  ): Promise<PlatformDeliveryMutationResult> {
    const connection = await this.pool.getConnection();
    const hash = tokenHash(request.leaseToken);
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<DeliveryRow[]>(
        `SELECT ${DELIVERY_COLUMNS} FROM platform_event_deliveries d
         WHERE d.delivery_id=? AND d.city_code=? AND d.subscriber_id=? AND d.subscription_id=?
         LIMIT 1 FOR UPDATE`,
        [request.deliveryId, identity.cityCode, identity.subscriberId, request.subscriptionId],
      );
      const row = rows[0];
      if (!row) {
        await connection.commit();
        return { outcome: "conflict" };
      }
      const duplicateOutcome = error === null ? "delivered" : row.status;
      if (row.status !== "processing") {
        const [attempts] = await connection.query<RowDataPacket[]>(
          `SELECT a.attempt_id FROM platform_event_delivery_attempts a
           INNER JOIN platform_event_deliveries d
             ON d.city_code=a.city_code AND d.delivery_id=a.delivery_id
           WHERE a.city_code=? AND a.delivery_id=? AND d.subscription_id=?
             AND a.lease_owner=? AND a.lease_token_hash=? AND a.outcome=? LIMIT 1`,
          [
            identity.cityCode, request.deliveryId, request.subscriptionId,
            request.owner, hash, duplicateOutcome,
          ],
        );
        await connection.commit();
        return attempts.length > 0
          ? { outcome: "already_applied", status: row.status, rowVersion: Number(row.row_version) }
          : { outcome: "conflict", status: row.status, rowVersion: Number(row.row_version) };
      }
      if (
        row.lease_owner !== request.owner || row.lease_token !== request.leaseToken ||
        Number(row.row_version) !== request.expectedRowVersion
      ) {
        await connection.commit();
        return { outcome: "conflict", status: row.status, rowVersion: Number(row.row_version) };
      }

      const targetStatus = error === null
        ? "delivered"
        : row.attempt_count >= row.max_attempts ? "dead_letter" : "retry_wait";
      const delay = platformRetryDelaySeconds(row.attempt_count);
      const failure = error === null ? null : projectPlatformDeliveryError(error);
      const [update] = await connection.query<ResultSetHeader>(
        `UPDATE platform_event_deliveries SET status=?,available_at=IF(?='retry_wait',
           TIMESTAMPADD(SECOND,?,CURRENT_TIMESTAMP(3)),available_at),
           lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,
           last_error_code=?,last_error_message=?,last_failed_at=IF(? IS NULL,last_failed_at,CURRENT_TIMESTAMP(3)),
           delivered_at=IF(?='delivered',CURRENT_TIMESTAMP(3),delivered_at),
           dead_lettered_at=IF(?='dead_letter',CURRENT_TIMESTAMP(3),dead_lettered_at),row_version=row_version+1
         WHERE delivery_id=? AND city_code=? AND subscriber_id=? AND subscription_id=?
           AND status='processing'
           AND lease_owner=? AND lease_token=? AND lease_expires_at>CURRENT_TIMESTAMP(3) AND row_version=?`,
        [
          targetStatus, targetStatus, delay,
          failure?.code ?? null,
          failure?.message ?? null,
          failure === null ? null : "failed",
          targetStatus, targetStatus,
          request.deliveryId, identity.cityCode, identity.subscriberId, request.subscriptionId,
          request.owner, request.leaseToken, request.expectedRowVersion,
        ],
      );
      if (update.affectedRows !== 1) {
        await connection.rollback();
        return { outcome: "conflict", status: row.status, rowVersion: Number(row.row_version) };
      }
      await connection.query(
        `UPDATE platform_event_delivery_attempts a
         INNER JOIN platform_event_deliveries d
           ON d.city_code=a.city_code AND d.delivery_id=a.delivery_id
         SET a.outcome=?,a.error_code=?,a.error_message=?,a.finished_at=CURRENT_TIMESTAMP(3)
         WHERE a.city_code=? AND a.delivery_id=? AND d.subscription_id=?
           AND a.attempt_number=? AND a.lease_owner=? AND a.lease_token_hash=?
           AND a.outcome='processing'`,
        [
          targetStatus,
          failure?.code ?? null,
          failure?.message ?? null,
          identity.cityCode, request.deliveryId, request.subscriptionId,
          row.attempt_count, request.owner, hash,
        ],
      );
      await connection.commit();
      return { outcome: "applied", status: targetStatus, rowVersion: Number(row.row_version) + 1 };
    } catch (caught) {
      await connection.rollback();
      throw caught;
    } finally {
      connection.release();
    }
  }

  async reapExpired(
    identity: PlatformServiceIdentity,
    subscriptionId: string,
    limit = 100,
  ): Promise<number> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<DeliveryRow[]>(
        `SELECT ${DELIVERY_COLUMNS} FROM platform_event_deliveries d
         WHERE d.city_code=? AND d.subscriber_id=? AND d.subscription_id=?
           AND d.status='processing' AND d.lease_expires_at<=CURRENT_TIMESTAMP(3)
         ORDER BY d.lease_expires_at ASC LIMIT ? FOR UPDATE SKIP LOCKED`,
        [identity.cityCode, identity.subscriberId, subscriptionId, Math.max(1, Math.min(1000, limit))],
      );
      for (const row of rows) {
        const target = row.attempt_count >= row.max_attempts ? "dead_letter" : "retry_wait";
        const leaseExpired = PLATFORM_DELIVERY_CANONICAL_ERRORS.LEASE_EXPIRED;
        await connection.query(
          `UPDATE platform_event_deliveries SET status=?,available_at=CURRENT_TIMESTAMP(3),
             lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,last_error_code=?,
             last_error_message=?,last_failed_at=CURRENT_TIMESTAMP(3),
             dead_lettered_at=IF(?='dead_letter',CURRENT_TIMESTAMP(3),dead_lettered_at),row_version=row_version+1
           WHERE delivery_id=? AND city_code=? AND subscriber_id=? AND status='processing' AND row_version=?`,
          [
            target,
            "LEASE_EXPIRED",
            leaseExpired,
            target,
            row.delivery_id,
            identity.cityCode,
            identity.subscriberId,
            row.row_version,
          ],
        );
        await connection.query(
          `UPDATE platform_event_delivery_attempts
           SET outcome='lease_expired',error_code=?,error_message=?,finished_at=CURRENT_TIMESTAMP(3)
           WHERE city_code=? AND delivery_id=? AND attempt_number=? AND outcome='processing'`,
          ["LEASE_EXPIRED", leaseExpired, identity.cityCode, row.delivery_id, row.attempt_count],
        );
        await connection.query(
          `INSERT INTO platform_event_delivery_actions
            (action_id,city_code,delivery_id_copy,event_id_copy,subscriber_id_copy,payload_hash_copy,
             action_kind,actor_type,actor_id,reason_code,reason,expected_row_version,actual_row_version)
           VALUES (?,?,?,?,?,?,'lease_reaped','platform_service',?,'LEASE_EXPIRED',?,?,?)`,
          [
            id("pda"), identity.cityCode, row.delivery_id, row.event_id, identity.subscriberId,
            row.payload_hash, identity.serviceId, "expired delivery lease recovered", row.row_version,
            Number(row.row_version) + 1,
          ],
        );
      }
      await connection.commit();
      return rows.length;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export const platformDeliveryRepository = new PlatformDeliveryRepository();
