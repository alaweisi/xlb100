import type {
  CreateReviewAppealRequest,
  CustomerOrderReviewView,
  ModerateReviewRequest,
  ResolveReviewAppealRequest,
  ReviewAppeal,
  ReviewAppealListResponse,
  ReviewModerationListResponse,
  ReviewVisibility,
  ReviewVisibilityState,
  WorkerReputation,
  WorkerReviewAppealTarget,
  WithdrawReviewAppealRequest,
} from "@xlb/types";
import type { ApiClient } from "./createApiClient.js";

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as JsonObject;
}

function exactKeys(value: JsonObject, label: string, keys: readonly string[]): void {
  const allowed = new Set(keys);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !allowed.has(key))) {
    throw new TypeError(`${label} has an unexpected response shape`);
  }
}

function okResponse(value: unknown, label: string): JsonObject {
  const response = object(value, label);
  if (response.ok !== true) throw new TypeError(`${label}.ok must be true`);
  return response;
}

function boundedString(value: unknown, label: string, max = 1_000): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max) {
    throw new TypeError(`${label} must be a bounded non-empty string`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return value as number;
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = nonNegativeInteger(value, label);
  if (parsed < 1) throw new TypeError(`${label} must be a positive integer`);
  return parsed;
}

function integerBetween(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new TypeError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value as number;
}

function nullableBoundedString(value: unknown, label: string, max = 1_000): string | null {
  if (value === null) return null;
  return boundedString(value, label, max);
}

function isoTimestamp(value: unknown, label: string): string {
  const timestamp = boundedString(value, label, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)
    || Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError(`${label} must be an ISO timestamp`);
  }
  return timestamp;
}

function validateOrderReview(value: unknown): void {
  const review = object(value, "customer order review source");
  exactKeys(review, "customer order review source", [
    "reviewId", "cityCode", "orderId", "customerId", "workerId", "fulfillmentId",
    "rating", "comment", "status", "createdAt", "updatedAt",
  ]);
  boundedString(review.reviewId, "reviewId", 64);
  boundedString(review.cityCode, "cityCode", 64);
  boundedString(review.orderId, "orderId", 64);
  boundedString(review.customerId, "customerId", 64);
  boundedString(review.workerId, "workerId", 64);
  boundedString(review.fulfillmentId, "fulfillmentId", 64);
  integerBetween(review.rating, "rating", 1, 5);
  boundedString(review.comment, "comment", 500);
  if (review.status !== "created") throw new TypeError("review status is unsupported");
  isoTimestamp(review.createdAt, "createdAt");
  isoTimestamp(review.updatedAt, "updatedAt");
}

function validateAppeal(value: unknown): ReviewAppeal {
  const appeal = object(value, "review appeal");
  exactKeys(appeal, "review appeal", [
    "appealId", "cityCode", "reviewId", "moderationVersion", "subjectType", "subjectId",
    "reason", "status", "version", "resolutionReason", "openedAt", "resolvedAt",
    "resolvedByAdminId",
  ]);
  boundedString(appeal.appealId, "appealId", 64);
  boundedString(appeal.cityCode, "cityCode", 64);
  boundedString(appeal.reviewId, "reviewId", 64);
  positiveInteger(appeal.moderationVersion, "moderationVersion");
  if (appeal.subjectType !== "customer" && appeal.subjectType !== "worker") {
    throw new TypeError("review appeal subjectType is unsupported");
  }
  if (!["open", "upheld", "rejected", "withdrawn"].includes(String(appeal.status))) {
    throw new TypeError("review appeal status is unsupported");
  }
  boundedString(appeal.subjectId, "subjectId", 64);
  boundedString(appeal.reason, "reason", 1_000);
  positiveInteger(appeal.version, "appeal version");
  nullableBoundedString(appeal.resolutionReason, "resolutionReason", 1_000);
  isoTimestamp(appeal.openedAt, "openedAt");
  if (appeal.resolvedAt !== null) isoTimestamp(appeal.resolvedAt, "resolvedAt");
  nullableBoundedString(appeal.resolvedByAdminId, "resolvedByAdminId", 64);
  return appeal as unknown as ReviewAppeal;
}

function validateVisibility(value: unknown): ReviewVisibilityState {
  const visibility = object(value, "review visibility");
  exactKeys(visibility, "review visibility", [
    "reviewId", "visibility", "moderationVersion", "version", "lastDecisionId", "updatedAt",
  ]);
  boundedString(visibility.reviewId, "reviewId", 64);
  if (!["pending_moderation", "visible", "hidden"].includes(String(visibility.visibility))) {
    throw new TypeError("review visibility is unsupported");
  }
  positiveInteger(visibility.version, "review visibility version");
  nonNegativeInteger(visibility.moderationVersion, "review moderation version");
  nullableBoundedString(visibility.lastDecisionId, "lastDecisionId", 64);
  isoTimestamp(visibility.updatedAt, "visibility updatedAt");
  return visibility as unknown as ReviewVisibilityState;
}

export function validateCustomerOrderReviewResponse(
  value: unknown,
): { ok: true; review: CustomerOrderReviewView | null } {
  const response = okResponse(value, "customer order review response");
  exactKeys(response, "customer order review response", ["ok", "review"]);
  if (response.review === null) return response as { ok: true; review: null };
  const view = object(response.review, "customer order review");
  exactKeys(view, "customer order review", ["review", "visibility", "appeals"]);
  validateOrderReview(view.review);
  validateVisibility(view.visibility);
  if (!Array.isArray(view.appeals) || view.appeals.length > 100) {
    throw new TypeError("customer order review appeals must be a bounded array");
  }
  view.appeals.forEach(validateAppeal);
  return response as unknown as { ok: true; review: CustomerOrderReviewView };
}

export function validateReviewAppealMutationResponse(
  value: unknown,
): { ok: true; appeal: ReviewAppeal; idempotent: boolean } {
  const response = okResponse(value, "review appeal mutation response");
  exactKeys(response, "review appeal mutation response", ["ok", "appeal", "idempotent"]);
  validateAppeal(response.appeal);
  if (typeof response.idempotent !== "boolean") throw new TypeError("idempotent must be boolean");
  return response as unknown as { ok: true; appeal: ReviewAppeal; idempotent: boolean };
}

export function validateWorkerReputationResponse(
  value: unknown,
): { ok: true; reputation: WorkerReputation | null } {
  const response = okResponse(value, "worker reputation response");
  exactKeys(response, "worker reputation response", ["ok", "reputation"]);
  if (response.reputation === null) return response as { ok: true; reputation: null };
  const reputation = object(response.reputation, "worker reputation");
  exactKeys(reputation, "worker reputation", [
    "workerId", "cityCode", "ratingCount", "ratingSum", "ratingDistribution",
    "averageRating", "sourceGenerationId", "formulaRevision", "sourceWatermark", "updatedAt",
  ]);
  boundedString(reputation.workerId, "workerId", 64);
  boundedString(reputation.cityCode, "cityCode", 64);
  nonNegativeInteger(reputation.ratingCount, "ratingCount");
  nonNegativeInteger(reputation.ratingSum, "ratingSum");
  const distribution = object(reputation.ratingDistribution, "ratingDistribution");
  exactKeys(distribution, "ratingDistribution", ["1", "2", "3", "4", "5"]);
  for (const rating of ["1", "2", "3", "4", "5"] as const) {
    nonNegativeInteger(distribution[rating], `ratingDistribution.${rating}`);
  }
  if (reputation.averageRating !== null &&
      (typeof reputation.averageRating !== "number" || reputation.averageRating < 1 || reputation.averageRating > 5)) {
    throw new TypeError("averageRating must be null or between 1 and 5");
  }
  const distributionCount = ["1", "2", "3", "4", "5"].reduce(
    (sum, rating) => sum + Number(distribution[rating]), 0,
  );
  const distributionSum = [1, 2, 3, 4, 5].reduce(
    (sum, rating) => sum + rating * Number(distribution[String(rating)]), 0,
  );
  if (distributionCount !== reputation.ratingCount || distributionSum !== reputation.ratingSum) {
    throw new TypeError("worker reputation aggregate is internally inconsistent");
  }
  if ((reputation.ratingCount === 0) !== (reputation.averageRating === null)) {
    throw new TypeError("averageRating nullability must match ratingCount");
  }
  if (reputation.averageRating !== null) {
    const expectedAverage = Number((Number(reputation.ratingSum) / Number(reputation.ratingCount)).toFixed(2));
    if (Math.abs(reputation.averageRating - expectedAverage) > 0.001) {
      throw new TypeError("averageRating does not match the visible rating aggregate");
    }
  }
  boundedString(reputation.sourceGenerationId, "sourceGenerationId", 64);
  boundedString(reputation.formulaRevision, "formulaRevision", 64);
  nullableBoundedString(reputation.sourceWatermark, "sourceWatermark", 128);
  isoTimestamp(reputation.updatedAt, "reputation updatedAt");
  return response as unknown as { ok: true; reputation: WorkerReputation };
}

export function validateWorkerAppealTargetsResponse(
  value: unknown,
): { ok: true; items: WorkerReviewAppealTarget[] } {
  const response = okResponse(value, "worker review appeal targets response");
  exactKeys(response, "worker review appeal targets response", ["ok", "items"]);
  if (!Array.isArray(response.items) || response.items.length > 100) {
    throw new TypeError("worker review appeal targets must be a bounded array");
  }
  for (const candidate of response.items) {
    const item = object(candidate, "worker review appeal target");
    exactKeys(item, "worker review appeal target", [
      "reviewId", "visibility", "moderationVersion", "decidedAt", "activeAppealStatus",
    ]);
    boundedString(item.reviewId, "reviewId", 64);
    if (item.visibility !== "visible" && item.visibility !== "hidden") {
      throw new TypeError("worker appeal target visibility is unsupported");
    }
    positiveInteger(item.moderationVersion, "moderationVersion");
    isoTimestamp(item.decidedAt, "decidedAt");
    if (item.activeAppealStatus !== null && item.activeAppealStatus !== "open") {
      throw new TypeError("worker appeal target activeAppealStatus is unsupported");
    }
  }
  return response as unknown as { ok: true; items: WorkerReviewAppealTarget[] };
}

export function validateModerationListResponse(
  value: unknown,
): ReviewModerationListResponse {
  const response = okResponse(value, "review moderation list response");
  exactKeys(response, "review moderation list response", ["ok", "items", "nextCursor"]);
  if (!Array.isArray(response.items) || response.items.length > 100) {
    throw new TypeError("review moderation items must be a bounded array");
  }
  for (const candidate of response.items) {
    const item = object(candidate, "review moderation item");
    exactKeys(item, "review moderation item", [
      "reviewId", "cityCode", "orderId", "workerId", "rating", "comment",
      "commentRestricted", "visibility", "moderationVersion", "visibilityVersion", "createdAt",
    ]);
    boundedString(item.reviewId, "reviewId", 64);
    boundedString(item.cityCode, "cityCode", 64);
    boundedString(item.orderId, "orderId", 64);
    boundedString(item.workerId, "workerId", 64);
    integerBetween(item.rating, "rating", 1, 5);
    if (!["pending_moderation", "visible", "hidden"].includes(String(item.visibility))) {
      throw new TypeError("review moderation visibility is unsupported");
    }
    if (item.commentRestricted !== true || item.comment !== null) {
      throw new TypeError("moderation queue comments must remain redacted");
    }
    nonNegativeInteger(item.moderationVersion, "moderationVersion");
    positiveInteger(item.visibilityVersion, "visibilityVersion");
    isoTimestamp(item.createdAt, "createdAt");
  }
  if (response.nextCursor !== null) boundedString(response.nextCursor, "nextCursor", 2_048);
  return response as unknown as ReviewModerationListResponse;
}

export function validateModerationMutationResponse(
  value: unknown,
): { ok: true; visibility: ReviewVisibilityState; idempotent: boolean } {
  const response = okResponse(value, "review moderation mutation response");
  exactKeys(response, "review moderation mutation response", ["ok", "visibility", "idempotent"]);
  validateVisibility(response.visibility);
  if (typeof response.idempotent !== "boolean") throw new TypeError("idempotent must be boolean");
  return response as unknown as { ok: true; visibility: ReviewVisibilityState; idempotent: boolean };
}

export function validateReviewContentResponse(
  value: unknown,
): { ok: true; content: { reviewId: string; comment: string } } {
  const response = okResponse(value, "review content response");
  exactKeys(response, "review content response", ["ok", "content"]);
  const content = object(response.content, "review content");
  exactKeys(content, "review content", ["reviewId", "comment"]);
  boundedString(content.reviewId, "reviewId", 64);
  boundedString(content.comment, "comment", 500);
  return response as { ok: true; content: { reviewId: string; comment: string } };
}

export function validateAppealListResponse(
  value: unknown,
): ReviewAppealListResponse {
  const response = okResponse(value, "review appeal list response");
  exactKeys(response, "review appeal list response", ["ok", "items", "nextCursor"]);
  if (!Array.isArray(response.items) || response.items.length > 100) {
    throw new TypeError("review appeal items must be a bounded array");
  }
  for (const candidate of response.items) {
    const item = object(candidate, "review appeal queue item");
    exactKeys(item, "review appeal queue item", [
      "appealId", "reviewId", "moderationVersion", "subjectType", "subjectId", "reason",
      "status", "version", "resolutionReason", "openedAt", "resolvedAt",
      "resolvedByAdminId", "detailsRestricted",
    ]);
    boundedString(item.appealId, "appealId", 64);
    boundedString(item.reviewId, "reviewId", 64);
    positiveInteger(item.moderationVersion, "moderationVersion");
    if (item.subjectType !== "customer" && item.subjectType !== "worker") {
      throw new TypeError("review appeal queue subjectType is unsupported");
    }
    if (!["open", "upheld", "rejected", "withdrawn"].includes(String(item.status))) {
      throw new TypeError("review appeal queue status is unsupported");
    }
    positiveInteger(item.version, "appeal version");
    isoTimestamp(item.openedAt, "openedAt");
    if (item.resolvedAt !== null) isoTimestamp(item.resolvedAt, "resolvedAt");
    if (typeof item.detailsRestricted !== "boolean") {
      throw new TypeError("detailsRestricted must be boolean");
    }
    if (item.detailsRestricted) {
      if (item.subjectId !== null || item.reason !== null || item.resolutionReason !== null
        || item.resolvedByAdminId !== null) {
        throw new TypeError("restricted appeal queue details must be redacted");
      }
    } else {
      boundedString(item.subjectId, "subjectId", 64);
      boundedString(item.reason, "reason", 1_000);
      nullableBoundedString(item.resolutionReason, "resolutionReason", 1_000);
      nullableBoundedString(item.resolvedByAdminId, "resolvedByAdminId", 64);
    }
  }
  if (response.nextCursor !== null) boundedString(response.nextCursor, "nextCursor", 2_048);
  return response as unknown as ReviewAppealListResponse;
}

export function createCustomerReviewApi(client: ApiClient) {
  return {
    getOrderReview(orderId: string) {
      return client.get<{ ok: true; review: CustomerOrderReviewView | null }>(
        `/api/orders/${encodeURIComponent(orderId)}/review`,
        { validate: validateCustomerOrderReviewResponse },
      );
    },
    createReviewAppeal(reviewId: string, body: CreateReviewAppealRequest) {
      return client.post<{ ok: true; appeal: ReviewAppeal; idempotent: boolean }>(
        `/api/reviews/${encodeURIComponent(reviewId)}/appeals`,
        body,
        { retry: "idempotent", validate: validateReviewAppealMutationResponse },
      );
    },
    withdrawReviewAppeal(reviewId: string, body: WithdrawReviewAppealRequest) {
      return client.post<{ ok: true; appeal: ReviewAppeal; idempotent: boolean }>(
        `/api/reviews/${encodeURIComponent(reviewId)}/appeals/withdraw`,
        body,
        { retry: "idempotent", validate: validateReviewAppealMutationResponse },
      );
    },
  };
}

export function createWorkerReputationApi(client: ApiClient) {
  return {
    getMyReputation() {
      return client.get<{ ok: true; reputation: WorkerReputation | null }>(
        "/api/worker/reputation",
        { validate: validateWorkerReputationResponse },
      );
    },
    listReviewAppealTargets() {
      return client.get<{ ok: true; items: WorkerReviewAppealTarget[] }>(
        "/api/worker/review-appeal-targets",
        { validate: validateWorkerAppealTargetsResponse },
      );
    },
    createReviewAppeal(reviewId: string, body: CreateReviewAppealRequest) {
      return client.post<{ ok: true; appeal: ReviewAppeal; idempotent: boolean }>(
        `/api/reviews/${encodeURIComponent(reviewId)}/appeals`,
        body,
        { retry: "idempotent", validate: validateReviewAppealMutationResponse },
      );
    },
    withdrawReviewAppeal(reviewId: string, body: WithdrawReviewAppealRequest) {
      return client.post<{ ok: true; appeal: ReviewAppeal; idempotent: boolean }>(
        `/api/reviews/${encodeURIComponent(reviewId)}/appeals/withdraw`,
        body,
        { retry: "idempotent", validate: validateReviewAppealMutationResponse },
      );
    },
  };
}

function reviewListPath(visibility?: ReviewVisibility, limit = 50, cursor?: string): string {
  const query = new URLSearchParams({ limit: String(limit) });
  if (visibility) query.set("visibility", visibility);
  if (cursor) query.set("cursor", cursor);
  return `/api/admin/reviews/moderation?${query.toString()}`;
}

export function createAdminReviewApi(client: ApiClient) {
  return {
    listReviewModeration(visibility?: ReviewVisibility, limit = 50, cursor?: string) {
      return client.get<ReviewModerationListResponse>(
        reviewListPath(visibility, limit, cursor),
        { validate: validateModerationListResponse },
      );
    },
    getReviewContent(reviewId: string) {
      return client.get<{ ok: true; content: { reviewId: string; comment: string } }>(
        `/api/admin/reviews/${encodeURIComponent(reviewId)}/content`,
        { validate: validateReviewContentResponse },
      );
    },
    moderateReview(reviewId: string, body: ModerateReviewRequest) {
      return client.post<{ ok: true; visibility: ReviewVisibilityState; idempotent: boolean }>(
        `/api/admin/reviews/${encodeURIComponent(reviewId)}/moderation`,
        body,
        { retry: "idempotent", validate: validateModerationMutationResponse },
      );
    },
    listReviewAppeals(status?: ReviewAppeal["status"], limit = 50, cursor?: string) {
      const query = new URLSearchParams({ limit: String(limit) });
      if (status) query.set("status", status);
      if (cursor) query.set("cursor", cursor);
      return client.get<ReviewAppealListResponse>(
        `/api/admin/review-appeals?${query.toString()}`,
        { validate: validateAppealListResponse },
      );
    },
    resolveReviewAppeal(appealId: string, body: ResolveReviewAppealRequest) {
      return client.post<{ ok: true; appeal: ReviewAppeal; idempotent: boolean }>(
        `/api/admin/review-appeals/${encodeURIComponent(appealId)}/resolve`,
        body,
        { retry: "idempotent", validate: validateReviewAppealMutationResponse },
      );
    },
  };
}
