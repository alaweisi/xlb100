import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  CustomerOrderReviewView,
  OrderReview,
  ReviewAppeal,
  ReviewAppealStatus,
  ReviewAppealSubjectType,
  ReviewModerationQueueItem,
  ReviewVisibility,
  ReviewVisibilityState,
  WorkerReviewAppealTarget,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import type { ReviewQueueCursorPosition } from "./reviewQueueCursorPolicy.js";

type VisibilityRow = RowDataPacket & {
  review_id: string;
  visibility: ReviewVisibility;
  moderation_version: number;
  current_decision_id: string | null;
  row_version: number;
  updated_at: Date;
};

type AppealRow = RowDataPacket & {
  appeal_id: string;
  city_code: string;
  review_id: string;
  moderation_version: number;
  appellant_type: ReviewAppealSubjectType;
  appellant_id: string;
  reason: string;
  status: ReviewAppealStatus;
  row_version: number;
  resolution_reason: string | null;
  withdrawal_idempotency_key_hash: string | null;
  withdrawal_request_fingerprint: string | null;
  created_at: Date;
  resolved_at: Date | null;
  resolved_by_actor_id: string | null;
};

type ReviewRow = RowDataPacket & {
  review_id: string; city_code: string; order_id: string; customer_id: string;
  worker_id: string; fulfillment_id: string; rating: number; comment: string;
  status: "created"; created_at: Date; updated_at: Date;
};

export type ModerationLockedReview = {
  review: OrderReview;
  visibility: ReviewVisibilityState;
};

function mapReview(row: ReviewRow): OrderReview {
  return {
    reviewId: row.review_id,
    cityCode: row.city_code as CityCode,
    orderId: row.order_id,
    customerId: row.customer_id,
    workerId: row.worker_id,
    fulfillmentId: row.fulfillment_id,
    rating: Number(row.rating),
    comment: row.comment,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapVisibility(row: VisibilityRow): ReviewVisibilityState {
  return {
    reviewId: row.review_id,
    visibility: row.visibility,
    moderationVersion: Number(row.moderation_version),
    version: Number(row.row_version),
    lastDecisionId: row.current_decision_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapAppeal(row: AppealRow): ReviewAppeal {
  return {
    appealId: row.appeal_id,
    cityCode: row.city_code as CityCode,
    reviewId: row.review_id,
    moderationVersion: Number(row.moderation_version),
    subjectType: row.appellant_type,
    subjectId: row.appellant_id,
    reason: row.reason,
    status: row.status,
    version: Number(row.row_version),
    resolutionReason: row.resolution_reason,
    openedAt: row.created_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
    resolvedByAdminId: row.resolved_by_actor_id,
  };
}

const REVIEW_COLUMNS = `r.review_id,r.city_code,r.order_id,r.customer_id,r.worker_id,
  r.fulfillment_id,r.rating,r.comment,r.status,r.created_at,r.updated_at`;
const VISIBILITY_COLUMNS = `v.review_id,v.visibility,v.moderation_version,
  v.current_decision_id,v.row_version,v.updated_at`;
const APPEAL_COLUMNS = `a.appeal_id,a.city_code,a.review_id,a.moderation_version,
  a.appellant_type,a.appellant_id,a.reason,a.status,a.row_version,a.resolution_reason,
  a.created_at,a.resolved_at,a.resolved_by_actor_id,a.withdrawal_idempotency_key_hash,
  a.withdrawal_request_fingerprint`;

export class ReviewModerationRepository extends RepositoryBase {
  constructor(pool?: Pool) { super(pool); }

  async ensurePendingVisibility(
    connection: PoolConnection,
    input: { visibilityStateId: string; cityCode: CityCode; reviewId: string },
  ): Promise<void> {
    await connection.query(
      `INSERT INTO review_visibility_states
        (visibility_state_id,city_code,review_id,visibility,moderation_version,row_version)
       VALUES (?,?,?,'pending_moderation',0,1)
       ON DUPLICATE KEY UPDATE visibility_state_id=visibility_state_id`,
      [input.visibilityStateId, input.cityCode, input.reviewId],
    );
  }

  async findVisibility(
    connection: PoolConnection,
    cityCode: CityCode,
    reviewId: string,
    forUpdate = false,
  ): Promise<ReviewVisibilityState | null> {
    const [rows] = await connection.query<VisibilityRow[]>(
      `SELECT ${VISIBILITY_COLUMNS} FROM review_visibility_states v
        WHERE v.city_code=? AND v.review_id=? LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
      [cityCode, reviewId],
    );
    return rows[0] ? mapVisibility(rows[0]) : null;
  }

  async getCustomerOrderReview(
    cityCode: CityCode,
    orderId: string,
    customerId: string,
  ): Promise<CustomerOrderReviewView | null> {
    const [rows] = await this.pool.query<(ReviewRow & VisibilityRow)[]>(
      `SELECT ${REVIEW_COLUMNS},${VISIBILITY_COLUMNS}
         FROM order_reviews r
         INNER JOIN review_visibility_states v
           ON v.city_code=r.city_code AND v.review_id=r.review_id
        WHERE r.city_code=? AND r.order_id=? AND r.customer_id=? LIMIT 1`,
      [cityCode, orderId, customerId],
    );
    if (!rows[0]) return null;
    const [appeals] = await this.pool.query<AppealRow[]>(
      `SELECT ${APPEAL_COLUMNS} FROM review_appeals a
        WHERE a.city_code=? AND a.review_id=? AND a.appellant_type='customer'
          AND a.appellant_id=? ORDER BY a.created_at DESC`,
      [cityCode, rows[0].review_id, customerId],
    );
    return {
      review: mapReview(rows[0]),
      visibility: mapVisibility(rows[0]),
      appeals: appeals.map(mapAppeal),
    };
  }

  async listWorkerAppealTargets(
    cityCode: CityCode,
    workerId: string,
  ): Promise<WorkerReviewAppealTarget[]> {
    const [rows] = await this.pool.query<(RowDataPacket & {
      review_id: string; visibility: "visible" | "hidden";
      moderation_version: number; decided_at: Date;
      active_appeal_status: "open" | null;
    })[]>(
      `SELECT r.review_id,v.visibility,v.moderation_version,d.created_at AS decided_at,
        (SELECT a.status FROM review_appeals a
          WHERE a.city_code=r.city_code AND a.review_id=r.review_id
            AND a.moderation_version=v.moderation_version
            AND a.appellant_type='worker' AND a.appellant_id=?
            AND a.status='open'
          ORDER BY a.created_at DESC,a.appeal_id DESC LIMIT 1) AS active_appeal_status
       FROM order_reviews r
       INNER JOIN review_visibility_states v
         ON v.city_code=r.city_code AND v.review_id=r.review_id
       INNER JOIN review_moderation_decisions d
         ON d.city_code=v.city_code AND d.review_id=v.review_id
        AND d.moderation_decision_id=v.current_decision_id
       WHERE r.city_code=? AND r.worker_id=? AND v.visibility IN ('visible','hidden')
       ORDER BY d.created_at DESC,r.review_id DESC
       LIMIT 100`,
      [workerId, cityCode, workerId],
    );
    return rows.map((row) => ({
      reviewId: row.review_id,
      visibility: row.visibility,
      moderationVersion: Number(row.moderation_version),
      decidedAt: row.decided_at.toISOString(),
      activeAppealStatus: row.active_appeal_status,
    }));
  }

  async requireAdminScope(
    connection: PoolConnection,
    cityCode: CityCode,
    actorId: string,
  ): Promise<"admin" | "operator" | "auditor" | null> {
    const [rows] = await connection.query<(RowDataPacket & { role: string })[]>(
      `SELECT au.role FROM admin_users au
       INNER JOIN admin_city_scopes acs
         ON acs.admin_user_id=au.id AND (acs.city_code=? OR acs.city_code='__global__')
       WHERE au.id=? AND au.role IN ('admin','operator','auditor') LIMIT 1`,
      [cityCode, actorId],
    );
    const role = rows[0]?.role;
    return role === "admin" || role === "operator" || role === "auditor" ? role : null;
  }

  async listModerationQueue(
    connection: PoolConnection,
    cityCode: CityCode,
    visibility: ReviewVisibility | null,
    limit: number,
    _revealComment: false,
    cursor?: ReviewQueueCursorPosition,
  ): Promise<ReviewModerationQueueItem[]> {
    const params: unknown[] = [cityCode];
    const filter = visibility ? " AND v.visibility=?" : "";
    if (visibility) params.push(visibility);
    const cursorFilter = cursor
      ? " AND (r.created_at>? OR (r.created_at=? AND r.review_id>?))"
      : "";
    if (cursor) {
      const createdAt = new Date(cursor.createdAt);
      params.push(createdAt, createdAt, cursor.entityId);
    }
    params.push(limit);
    const [rows] = await connection.query<(RowDataPacket & {
      review_id: string; city_code: string; order_id: string; worker_id: string;
      rating: number; comment: string; visibility: ReviewVisibility;
      moderation_version: number; visibility_row_version: number; created_at: Date;
    })[]>(
       `SELECT r.review_id,r.city_code,r.order_id,r.worker_id,r.rating,
               v.visibility,v.moderation_version,v.row_version AS visibility_row_version,r.created_at
         FROM order_reviews r
         INNER JOIN review_visibility_states v
           ON v.city_code=r.city_code AND v.review_id=r.review_id
        WHERE r.city_code=?${filter}${cursorFilter}
        ORDER BY r.created_at ASC,r.review_id ASC LIMIT ?`,
      params,
    );
    return rows.map((row) => ({
      reviewId: row.review_id,
      cityCode: row.city_code as CityCode,
      orderId: row.order_id,
      workerId: row.worker_id,
      rating: Number(row.rating),
       comment: null,
       commentRestricted: true,
      visibility: row.visibility,
      moderationVersion: Number(row.moderation_version),
      visibilityVersion: Number(row.visibility_row_version),
      createdAt: row.created_at.toISOString(),
    }));
  }

  async findReviewContent(
    connection: PoolConnection,
    cityCode: CityCode,
    reviewId: string,
  ): Promise<{ reviewId: string; comment: string } | null> {
    const [rows] = await connection.query<(RowDataPacket & {
      review_id: string; comment: string;
    })[]>(
      `SELECT review_id,comment FROM order_reviews
        WHERE city_code=? AND review_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, reviewId],
    );
    return rows[0] ? { reviewId: rows[0].review_id, comment: rows[0].comment } : null;
  }

  async recordModerationDetailAccess(
    connection: PoolConnection,
    input: { accessAuditId: string; cityCode: CityCode; reviewId: string;
      actorId: string; traceId: string | null; accessPurpose: "moderation_detail" },
  ): Promise<void> {
    await connection.query(
      `INSERT INTO review_content_access_audits
        (access_audit_id,city_code,review_id,actor_id,actor_role,access_purpose,trace_id)
       VALUES (?,?,?,?,'admin',?,?)`,
      [input.accessAuditId, input.cityCode, input.reviewId, input.actorId,
        input.accessPurpose, input.traceId],
    );
  }

  async lockReviewForModeration(
    connection: PoolConnection,
    cityCode: CityCode,
    reviewId: string,
  ): Promise<ModerationLockedReview | null> {
    const [reviews] = await connection.query<ReviewRow[]>(
      `SELECT ${REVIEW_COLUMNS} FROM order_reviews r
        WHERE r.city_code=? AND r.review_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, reviewId],
    );
    if (!reviews[0]) return null;
    const visibility = await this.findVisibility(connection, cityCode, reviewId, true);
    return visibility ? { review: mapReview(reviews[0]), visibility } : null;
  }

  async findModerationByIdempotency(
    connection: PoolConnection,
    cityCode: CityCode,
    actorId: string,
    idempotencyHash: string,
  ): Promise<{ reviewId: string; fingerprint: string } | null> {
    const [rows] = await connection.query<(RowDataPacket & {
      review_id: string; request_fingerprint: string;
    })[]>(
      `SELECT review_id,request_fingerprint FROM review_moderation_decisions
        WHERE city_code=? AND actor_id=? AND idempotency_key_hash=? LIMIT 1 FOR UPDATE`,
      [cityCode, actorId, idempotencyHash],
    );
    return rows[0]
      ? { reviewId: rows[0].review_id, fingerprint: rows[0].request_fingerprint }
      : null;
  }

  async insertModerationDecision(
    connection: PoolConnection,
    input: {
      decisionId: string; cityCode: CityCode; reviewId: string; moderationVersion: number;
      decision: "visible" | "hidden"; reasonCode: string; reason: string; actorId: string;
      idempotencyHash: string; fingerprint: string; traceId: string | null;
    },
  ): Promise<void> {
    await connection.query(
      `INSERT INTO review_moderation_decisions
        (moderation_decision_id,city_code,review_id,moderation_version,decision,
         reason_code,reason,actor_id,idempotency_key_hash,request_fingerprint,trace_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [input.decisionId, input.cityCode, input.reviewId, input.moderationVersion,
        input.decision, input.reasonCode, input.reason, input.actorId,
        input.idempotencyHash, input.fingerprint, input.traceId],
    );
  }

  async updateVisibilityCas(
    connection: PoolConnection,
    input: { cityCode: CityCode; reviewId: string; expectedVersion: number;
      visibility: "visible" | "hidden"; moderationVersion: number; decisionId: string },
  ): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE review_visibility_states
          SET visibility=?,moderation_version=?,current_decision_id=?,row_version=row_version+1
        WHERE city_code=? AND review_id=? AND row_version=?`,
      [input.visibility, input.moderationVersion, input.decisionId,
        input.cityCode, input.reviewId, input.expectedVersion],
    );
    return result.affectedRows === 1;
  }

  async lockAppealableReview(
    connection: PoolConnection,
    cityCode: CityCode,
    reviewId: string,
  ): Promise<(ModerationLockedReview & { decisionActorId: string }) | null> {
    const locked = await this.lockReviewForModeration(connection, cityCode, reviewId);
    if (!locked?.visibility.lastDecisionId) return null;
    const [rows] = await connection.query<(RowDataPacket & { actor_id: string })[]>(
      `SELECT actor_id FROM review_moderation_decisions
        WHERE city_code=? AND review_id=? AND moderation_decision_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, reviewId, locked.visibility.lastDecisionId],
    );
    return rows[0] ? { ...locked, decisionActorId: rows[0].actor_id } : null;
  }

  async findAppealByIdempotency(
    connection: PoolConnection,
    input: { cityCode: CityCode; subjectType: ReviewAppealSubjectType; subjectId: string;
      idempotencyHash: string },
  ): Promise<{ appeal: ReviewAppeal; fingerprint: string } | null> {
    const [rows] = await connection.query<(AppealRow & { submitted_request_fingerprint: string })[]>(
      `SELECT ${APPEAL_COLUMNS},a.submitted_request_fingerprint FROM review_appeals a
        WHERE a.city_code=? AND a.appellant_type=? AND a.appellant_id=?
          AND a.submitted_idempotency_key_hash=? LIMIT 1 FOR UPDATE`,
      [input.cityCode, input.subjectType, input.subjectId, input.idempotencyHash],
    );
    return rows[0]
      ? { appeal: mapAppeal(rows[0]), fingerprint: rows[0].submitted_request_fingerprint }
      : null;
  }

  async findAppealByWithdrawalIdempotency(
    connection: PoolConnection,
    input: { cityCode: CityCode; subjectType: ReviewAppealSubjectType;
      subjectId: string; idempotencyHash: string },
  ): Promise<{ appeal: ReviewAppeal; fingerprint: string } | null> {
    const [rows] = await connection.query<AppealRow[]>(
      `SELECT ${APPEAL_COLUMNS} FROM review_appeals a
        WHERE a.city_code=? AND a.appellant_type=? AND a.appellant_id=?
          AND a.withdrawal_idempotency_key_hash=? LIMIT 1 FOR UPDATE`,
      [input.cityCode, input.subjectType, input.subjectId, input.idempotencyHash],
    );
    return rows[0]?.withdrawal_request_fingerprint
      ? { appeal: mapAppeal(rows[0]), fingerprint: rows[0].withdrawal_request_fingerprint }
      : null;
  }

  async findActiveAppeal(
    connection: PoolConnection,
    input: { cityCode: CityCode; reviewId: string; moderationVersion: number;
      subjectType: ReviewAppealSubjectType; subjectId: string },
  ): Promise<ReviewAppeal | null> {
    const [rows] = await connection.query<AppealRow[]>(
      `SELECT ${APPEAL_COLUMNS} FROM review_appeals a
        WHERE a.city_code=? AND a.review_id=? AND a.moderation_version=?
          AND a.appellant_type=? AND a.appellant_id=?
          AND a.status='open'
        LIMIT 1 FOR UPDATE`,
      [input.cityCode, input.reviewId, input.moderationVersion,
        input.subjectType, input.subjectId],
    );
    return rows[0] ? mapAppeal(rows[0]) : null;
  }

  async findAppealLocator(connection: PoolConnection, cityCode: CityCode, appealId: string): Promise<{ reviewId: string } | null> {
    const [rows] = await connection.query<(RowDataPacket & { review_id: string })[]>(
      `SELECT review_id FROM review_appeals WHERE city_code=? AND appeal_id=? LIMIT 1`,
      [cityCode, appealId],
    );
    return rows[0] ? { reviewId: rows[0].review_id } : null;
  }

  async findResolutionByIdempotency(connection: PoolConnection, cityCode: CityCode, actorId: string, idempotencyHash: string) {
    const [rows] = await connection.query<(AppealRow & { resolution_request_fingerprint: string | null })[]>(
      `SELECT ${APPEAL_COLUMNS},a.resolution_request_fingerprint FROM review_appeals a
       WHERE a.city_code=? AND a.resolved_by_actor_id=? AND a.resolution_idempotency_key_hash=? LIMIT 1 FOR UPDATE`,
      [cityCode, actorId, idempotencyHash],
    );
    return rows[0]?.resolution_request_fingerprint
      ? { appeal: mapAppeal(rows[0]), fingerprint: rows[0].resolution_request_fingerprint }
      : null;
  }

  async hasOpenAppeal(connection: PoolConnection, cityCode: CityCode, reviewId: string, moderationVersion: number, excludeAppealId?: string): Promise<boolean> {
    const params: unknown[] = [cityCode, reviewId, moderationVersion];
    const exclude = excludeAppealId ? " AND appeal_id<>?" : "";
    if (excludeAppealId) params.push(excludeAppealId);
    const [rows] = await connection.query<(RowDataPacket & { appeal_id: string })[]>(
      `SELECT appeal_id FROM review_appeals WHERE city_code=? AND review_id=?
       AND moderation_version=? AND status='open'${exclude} ORDER BY appeal_id ASC LIMIT 1 FOR UPDATE`, params,
    );
    return rows.length > 0;
  }

  async insertAppeal(
    connection: PoolConnection,
    input: { appealId: string; cityCode: CityCode; reviewId: string; decisionId: string;
      moderationVersion: number; subjectType: ReviewAppealSubjectType; subjectId: string;
      reason: string; idempotencyHash: string; fingerprint: string },
  ): Promise<ReviewAppeal> {
    await connection.query(
      `INSERT INTO review_appeals
        (appeal_id,city_code,review_id,moderation_decision_id,moderation_version,
         appellant_type,appellant_id,reason,status,submitted_idempotency_key_hash,
         submitted_request_fingerprint,row_version)
       VALUES (?,?,?,?,?,?,?,?,'open',?,?,1)`,
      [input.appealId, input.cityCode, input.reviewId, input.decisionId,
        input.moderationVersion, input.subjectType, input.subjectId, input.reason,
        input.idempotencyHash, input.fingerprint],
    );
    return (await this.findAppealForUpdate(connection, input.cityCode, input.appealId))!.appeal;
  }

  async listAppeals(
    connection: PoolConnection,
    cityCode: CityCode,
    status: ReviewAppealStatus | null,
    limit: number,
    cursor?: ReviewQueueCursorPosition,
  ): Promise<ReviewAppeal[]> {
    const params: unknown[] = [cityCode];
    const filter = status ? " AND a.status=?" : "";
    if (status) params.push(status);
    const cursorFilter = cursor
      ? " AND (a.created_at>? OR (a.created_at=? AND a.appeal_id>?))"
      : "";
    if (cursor) {
      const createdAt = new Date(cursor.createdAt);
      params.push(createdAt, createdAt, cursor.entityId);
    }
    params.push(limit);
    const [rows] = await connection.query<AppealRow[]>(
      `SELECT ${APPEAL_COLUMNS} FROM review_appeals a
        WHERE a.city_code=?${filter}${cursorFilter}
        ORDER BY a.created_at ASC,a.appeal_id ASC LIMIT ?`,
      params,
    );
    return rows.map(mapAppeal);
  }

  async withdrawAppeal(
    connection: PoolConnection,
    input: { cityCode: CityCode; appealId: string; subjectType: ReviewAppealSubjectType;
      subjectId: string; expectedVersion: number; idempotencyHash: string; fingerprint: string },
  ): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE review_appeals SET status='withdrawn',withdrawal_idempotency_key_hash=?,
         withdrawal_request_fingerprint=?,withdrawn_at=CURRENT_TIMESTAMP(3),row_version=row_version+1
       WHERE city_code=? AND appeal_id=? AND appellant_type=? AND appellant_id=?
         AND status='open' AND row_version=?`,
      [input.idempotencyHash, input.fingerprint, input.cityCode, input.appealId,
        input.subjectType, input.subjectId, input.expectedVersion],
    );
    return result.affectedRows === 1;
  }

  async findAppealForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    appealId: string,
  ): Promise<{ appeal: ReviewAppeal; moderationActorId: string;
    moderationDecisionId: string; resolutionFingerprint: string | null;
    resolutionIdempotencyHash: string | null } | null> {
    const [rows] = await connection.query<(AppealRow & {
      moderation_actor_id: string; resolution_request_fingerprint: string | null;
      resolution_idempotency_key_hash: string | null; moderation_decision_id: string;
    })[]>(
      `SELECT ${APPEAL_COLUMNS},a.moderation_decision_id,d.actor_id AS moderation_actor_id,
              a.resolution_request_fingerprint,a.resolution_idempotency_key_hash
         FROM review_appeals a
         INNER JOIN review_moderation_decisions d
           ON d.city_code=a.city_code AND d.review_id=a.review_id
          AND d.moderation_decision_id=a.moderation_decision_id
        WHERE a.city_code=? AND a.appeal_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, appealId],
    );
    return rows[0] ? {
      appeal: mapAppeal(rows[0]),
      moderationActorId: rows[0].moderation_actor_id,
      moderationDecisionId: rows[0].moderation_decision_id,
      resolutionFingerprint: rows[0].resolution_request_fingerprint,
      resolutionIdempotencyHash: rows[0].resolution_idempotency_key_hash,
    } : null;
  }

  async resolveAppealCas(
    connection: PoolConnection,
    input: { cityCode: CityCode; appealId: string; expectedVersion: number;
      resolution: "upheld" | "rejected"; reason: string; actorId: string;
      idempotencyHash: string; fingerprint: string },
  ): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE review_appeals SET status=?,resolution_reason=?,resolved_by_actor_id=?,
         resolution_idempotency_key_hash=?,resolution_request_fingerprint=?,
         resolved_at=CURRENT_TIMESTAMP(3),row_version=row_version+1
       WHERE city_code=? AND appeal_id=? AND status='open' AND row_version=?`,
      [input.resolution, input.reason, input.actorId, input.idempotencyHash,
        input.fingerprint, input.cityCode, input.appealId, input.expectedVersion],
    );
    return result.affectedRows === 1;
  }
}

export const reviewModerationRepository = new ReviewModerationRepository();
