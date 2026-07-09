import type { CityCode } from "./city.js";

// ══════════════════════════════════════════════════════════════════
// Phase 10D — Governance Review Workflow Types
// Governance-only review/approval. No execution, no money movement.
// ══════════════════════════════════════════════════════════════════

/**
 * Allowed governance review statuses.
 * These are governance workflow states — NOT execution outcomes.
 */
export type GovernanceReviewStatus =
  | "pending_review"
  | "approved_for_governance"
  | "rejected_for_governance"
  | "changes_requested"
  | "cancelled"
  | "archived";

/**
 * Allowed governance review decisions.
 * These are governance decisions — NOT execution commands.
 */
export type GovernanceReviewDecision =
  | "approve_governance"
  | "reject_governance"
  | "request_changes"
  | "cancel_review"
  | "archive_review";

/**
 * Governance Review Record — persisted review of a governance intent.
 */
export interface GovernanceReviewRecord {
  id: string;
  cityCode: CityCode;
  intentId: string;
  reviewStatus: GovernanceReviewStatus;
  reviewDecision: GovernanceReviewDecision | null;
  submittedByAdminId: string;
  reviewedByAdminId: string | null;
  reviewNote: string | null;
  rejectionReason: string | null;
  changesRequestedNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request to submit an intent for governance review.
 */
export interface SubmitReviewRequest {
  cityCode: CityCode;
  intentId: string;
  submittedByAdminId?: string;
  reviewNote?: string | null;
}

/**
 * Request to approve/reject/request-changes on a governance review.
 */
export interface ReviewDecisionRequest {
  reviewDecision: GovernanceReviewDecision;
  reviewedByAdminId?: string;
  reviewNote?: string | null;
  rejectionReason?: string | null;
  changesRequestedNote?: string | null;
}

/**
 * Response for governance review operations.
 */
export interface GovernanceReviewResponse {
  ok: true;
  review: GovernanceReviewRecord;
}

export interface GovernanceReviewListResponse {
  ok: true;
  reviews: GovernanceReviewRecord[];
}
