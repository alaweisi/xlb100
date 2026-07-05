import type { RowDataPacket } from "mysql2/promise";
import { randomBytes } from "node:crypto";
import type { RequestContext } from "@xlb/types";
import type {
  GovernanceReviewRecord,
  SubmitReviewRequest,
  ReviewDecisionRequest,
} from "@xlb/types";
import { getMysqlPool } from "../dal/mysqlPool.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

const generateReviewId = (): string => `gr_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;

type ReviewRow = RowDataPacket & {
  id: string; city_code: string; intent_id: string;
  review_status: string; review_decision: string | null;
  submitted_by_admin_id: string; reviewed_by_admin_id: string | null;
  review_note: string | null; rejection_reason: string | null;
  changes_requested_note: string | null;
  submitted_at: Date; reviewed_at: Date | null;
  created_at: Date; updated_at: Date;
};

function mapReview(row: ReviewRow): GovernanceReviewRecord {
  return {
    id: row.id,
    cityCode: row.city_code,
    intentId: row.intent_id,
    reviewStatus: row.review_status as GovernanceReviewRecord["reviewStatus"],
    reviewDecision: row.review_decision as GovernanceReviewRecord["reviewDecision"],
    submittedByAdminId: row.submitted_by_admin_id,
    reviewedByAdminId: row.reviewed_by_admin_id,
    reviewNote: row.review_note,
    rejectionReason: row.rejection_reason,
    changesRequestedNote: row.changes_requested_note,
    submittedAt: row.submitted_at.toISOString(),
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

class GovernanceReviewService {
  private pool = getMysqlPool();

  async submitReview(
    context: RequestContext,
    req: SubmitReviewRequest,
  ): Promise<GovernanceReviewRecord> {
    const cityCode = assertCityScopedContext(context);
    const id = generateReviewId();
    const now = new Date();
    await this.pool.query(
      `INSERT INTO settlement_action_governance_reviews
        (id, city_code, intent_id, review_status,
         submitted_by_admin_id, review_note, submitted_at, created_at, updated_at)
       VALUES (?, ?, ?, 'pending_review', ?, ?, ?, ?, ?)`,
      [id, cityCode, req.intentId, req.submittedByAdminId, req.reviewNote ?? null, now, now, now],
    );
    return (await this.getReview(context, id))!;
  }

  async getReview(context: RequestContext, id: string): Promise<GovernanceReviewRecord | null> {
    const cityCode = assertCityScopedContext(context);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const [rows] = await this.pool.query<ReviewRow[]>(
      `SELECT * FROM settlement_action_governance_reviews WHERE id = ? AND ${clause}`,
      [id, ...params],
    );
    if (rows.length === 0) return null;
    return mapReview(rows[0]);
  }

  async listReviews(context: RequestContext, intentId?: string): Promise<GovernanceReviewRecord[]> {
    const cityCode = assertCityScopedContext(context);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const conditions = [clause];
    const queryParams: unknown[] = [...params];
    if (intentId) {
      conditions.push("intent_id = ?");
      queryParams.push(intentId);
    }
    const [rows] = await this.pool.query<ReviewRow[]>(
      `SELECT * FROM settlement_action_governance_reviews
       WHERE ${conditions.join(" AND ")} ORDER BY submitted_at DESC LIMIT 50`,
      queryParams,
    );
    return rows.map(mapReview);
  }

  async approveReview(
    context: RequestContext,
    reviewId: string,
    req: ReviewDecisionRequest,
  ): Promise<GovernanceReviewRecord | null> {
    const cityCode = assertCityScopedContext(context);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const now = new Date();
    const [result] = await this.pool.query(
      `UPDATE settlement_action_governance_reviews
       SET review_status = 'approved_for_governance', review_decision = 'approve_governance',
           reviewed_by_admin_id = ?, review_note = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ? AND ${clause} AND review_status = 'pending_review'`,
      [req.reviewedByAdminId, req.reviewNote ?? null, now, now, reviewId, ...params],
    );
    if ((result as { affectedRows: number }).affectedRows === 0) return null;
    return this.getReview(context, reviewId);
  }

  async rejectReview(
    context: RequestContext,
    reviewId: string,
    req: ReviewDecisionRequest,
  ): Promise<GovernanceReviewRecord | null> {
    const cityCode = assertCityScopedContext(context);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const now = new Date();
    const [result] = await this.pool.query(
      `UPDATE settlement_action_governance_reviews
       SET review_status = 'rejected_for_governance', review_decision = 'reject_governance',
           reviewed_by_admin_id = ?, rejection_reason = ?, review_note = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ? AND ${clause} AND review_status = 'pending_review'`,
      [req.reviewedByAdminId, req.rejectionReason ?? null, req.reviewNote ?? null, now, now, reviewId, ...params],
    );
    if ((result as { affectedRows: number }).affectedRows === 0) return null;
    return this.getReview(context, reviewId);
  }

  async requestChanges(
    context: RequestContext,
    reviewId: string,
    req: ReviewDecisionRequest,
  ): Promise<GovernanceReviewRecord | null> {
    const cityCode = assertCityScopedContext(context);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const now = new Date();
    const [result] = await this.pool.query(
      `UPDATE settlement_action_governance_reviews
       SET review_status = 'changes_requested', review_decision = 'request_changes',
           reviewed_by_admin_id = ?, changes_requested_note = ?, review_note = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ? AND ${clause} AND review_status = 'pending_review'`,
      [req.reviewedByAdminId, req.changesRequestedNote ?? null, req.reviewNote ?? null, now, now, reviewId, ...params],
    );
    if ((result as { affectedRows: number }).affectedRows === 0) return null;
    return this.getReview(context, reviewId);
  }
}

export const governanceReviewService = new GovernanceReviewService();
