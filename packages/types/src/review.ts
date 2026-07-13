import type { CityCode } from "./city.js";

export type OrderReviewStatus = "created";
export type ReviewVisibility = "pending_moderation" | "visible" | "hidden";
export type ReviewAppealStatus = "open" | "upheld" | "rejected" | "withdrawn";
export type ReviewAppealSubjectType = "customer" | "worker";

export interface OrderReview {
  reviewId: string;
  cityCode: CityCode;
  orderId: string;
  customerId: string;
  workerId: string;
  fulfillmentId: string;
  rating: number;
  comment: string;
  status: OrderReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderReview {
  rating: number;
  comment: string;
}

export interface ReviewVisibilityState {
  reviewId: string;
  visibility: ReviewVisibility;
  moderationVersion: number;
  version: number;
  lastDecisionId: string | null;
  updatedAt: string;
}

export interface ReviewAppeal {
  appealId: string;
  cityCode: CityCode;
  reviewId: string;
  moderationVersion: number;
  subjectType: ReviewAppealSubjectType;
  subjectId: string;
  reason: string;
  status: ReviewAppealStatus;
  version: number;
  resolutionReason: string | null;
  openedAt: string;
  resolvedAt: string | null;
  resolvedByAdminId: string | null;
}

/** Admin appeal work queue. Sensitive appellant/reason fields are null for read-only roles. */
export interface ReviewAppealQueueItem {
  appealId: string;
  reviewId: string;
  moderationVersion: number;
  subjectType: ReviewAppealSubjectType;
  subjectId: string | null;
  reason: string | null;
  status: ReviewAppealStatus;
  version: number;
  resolutionReason: string | null;
  openedAt: string;
  resolvedAt: string | null;
  resolvedByAdminId: string | null;
  detailsRestricted: boolean;
}

export interface CustomerOrderReviewView {
  review: OrderReview;
  visibility: ReviewVisibilityState;
  appeals: ReviewAppeal[];
}

export interface ReviewModerationQueueItem {
  reviewId: string;
  cityCode: CityCode;
  orderId: string;
  workerId: string;
  rating: number;
  comment: string | null;
  commentRestricted: boolean;
  visibility: ReviewVisibility;
  moderationVersion: number;
  visibilityVersion: number;
  createdAt: string;
}

export interface ReviewModerationListQuery {
  visibility?: ReviewVisibility;
  limit?: number;
  cursor?: string;
}

export interface ReviewModerationListResponse {
  ok: true;
  items: ReviewModerationQueueItem[];
  nextCursor: string | null;
}

export interface ReviewAppealListQuery {
  status?: ReviewAppealStatus;
  limit?: number;
  cursor?: string;
}

export interface ReviewAppealListResponse {
  ok: true;
  items: ReviewAppealQueueItem[];
  nextCursor: string | null;
}

export interface ReputationRatingDistribution {
  "1": number;
  "2": number;
  "3": number;
  "4": number;
  "5": number;
}

export interface WorkerReputation {
  workerId: string;
  cityCode: CityCode;
  ratingCount: number;
  ratingSum: number;
  ratingDistribution: ReputationRatingDistribution;
  averageRating: number | null;
  sourceGenerationId: string;
  formulaRevision: string;
  sourceWatermark: string | null;
  updatedAt: string;
}

/** Privacy-minimized metadata required for Worker self appeal; never contains review content. */
export interface WorkerReviewAppealTarget {
  reviewId: string;
  visibility: Extract<ReviewVisibility, "visible" | "hidden">;
  moderationVersion: number;
  decidedAt: string;
  activeAppealStatus: "open" | null;
}

export interface CreateReviewAppealRequest {
  moderationVersion: number;
  reason: string;
  idempotencyKey: string;
}

export interface ModerateReviewRequest {
  decision: Extract<ReviewVisibility, "visible" | "hidden">;
  reasonCode: string;
  reason: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface ResolveReviewAppealRequest {
  resolution: Extract<ReviewAppealStatus, "upheld" | "rejected">;
  reason: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface WithdrawReviewAppealRequest {
  moderationVersion: number;
  idempotencyKey: string;
}
