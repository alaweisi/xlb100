import { describe, expect, it, vi } from "vitest";
import {
  createAdminReviewApi,
  createWorkerReputationApi,
  validateAppealListResponse,
  validateModerationListResponse,
  validateReviewContentResponse,
  validateWorkerAppealTargetsResponse,
  validateWorkerReputationResponse,
} from "../../packages/api-client/src/reviewReputation";

const decidedAt = "2026-07-13T12:00:00.000Z";

function appealTarget(index = 1) {
  return {
    reviewId: `review-${index}`,
    visibility: "hidden" as const,
    moderationVersion: 1,
    decidedAt,
    activeAppealStatus: null,
  };
}

describe("Phase28 Review/Reputation API client contract", () => {
  it("uses the canonical Worker routes and preserves idempotent POST retry", async () => {
    const get = vi.fn().mockResolvedValue({ ok: true });
    const post = vi.fn().mockResolvedValue({ ok: true });
    const api = createWorkerReputationApi({ get, post } as never);

    await api.getMyReputation();
    await api.listReviewAppealTargets();
    await api.createReviewAppeal("review / 1", {
      moderationVersion: 2,
      reason: "Please review this decision",
      idempotencyKey: "worker-appeal-command-1",
    });

    expect(get.mock.calls.map((call) => call[0])).toEqual([
      "/api/worker/reputation",
      "/api/worker/review-appeal-targets",
    ]);
    expect(post.mock.calls[0][0]).toBe("/api/reviews/review%20%2F%201/appeals");
    expect(post.mock.calls[0][2]).toEqual(expect.objectContaining({
      retry: "idempotent",
      validate: expect.any(Function),
    }));
  });

  it("keeps the moderation queue redacted and requires an explicit content read", async () => {
    const get = vi.fn().mockResolvedValue({ ok: true });
    const post = vi.fn().mockResolvedValue({ ok: true });
    const api = createAdminReviewApi({ get, post } as never);

    await api.listReviewModeration("pending_moderation", 20, "cursor_1");
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toBe(
      "/api/admin/reviews/moderation?limit=20&visibility=pending_moderation&cursor=cursor_1",
    );

    await api.getReviewContent("review / 1");
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1][0]).toBe("/api/admin/reviews/review%20%2F%201/content");

    await api.listReviewAppeals("open", 10, "appeal_cursor_1");
    expect(get.mock.calls[2][0]).toBe(
      "/api/admin/review-appeals?limit=10&status=open&cursor=appeal_cursor_1",
    );

    await api.moderateReview("review-1", {
      decision: "hidden",
      reasonCode: "content_policy_violation",
      reason: "Policy review",
      expectedVersion: 1,
      idempotencyKey: "admin-review-command-1",
    });
    expect(post.mock.calls[0][2]).toEqual(expect.objectContaining({
      retry: "idempotent",
      validate: expect.any(Function),
    }));
  });

  it("rejects unknown and privacy-forbidden response fields", () => {
    expect(() => validateWorkerAppealTargetsResponse({
      ok: true,
      items: [{ ...appealTarget(), comment: "private content" }],
    })).toThrow(/unexpected response shape/i);

    expect(() => validateWorkerReputationResponse({
      ok: true,
      reputation: {
        workerId: "worker-1",
        cityCode: "hangzhou",
        ratingCount: 0,
        ratingSum: 0,
        ratingDistribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
        averageRating: null,
        sourceGenerationId: "generation-1",
        formulaRevision: "lifetime-visible-arithmetic-v1",
        sourceWatermark: null,
        updatedAt: decidedAt,
        customerId: "forbidden",
      },
    })).toThrow(/unexpected response shape/i);

    expect(() => validateReviewContentResponse({
      ok: true,
      content: { reviewId: "review-1", comment: "authorized", customerId: "forbidden" },
    })).toThrow(/unexpected response shape/i);
  });

  it("accepts only exact redacted appeal rows for read-only Admin roles", () => {
    const restricted = {
      appealId: "appeal-1",
      reviewId: "review-1",
      moderationVersion: 1,
      subjectType: "customer",
      subjectId: null,
      reason: null,
      status: "open",
      version: 1,
      resolutionReason: null,
      openedAt: decidedAt,
      resolvedAt: null,
      resolvedByAdminId: null,
      detailsRestricted: true,
    };
    expect(validateAppealListResponse({ ok: true, items: [restricted], nextCursor: null }).items)
      .toEqual([restricted]);
    expect(() => validateAppealListResponse({
      ok: true,
      items: [{ ...restricted, reason: "leaked appellant statement" }],
      nextCursor: null,
    })).toThrow(/must be redacted/i);
    expect(() => validateAppealListResponse({ ok: true, items: [restricted] }))
      .toThrow(/unexpected response shape/i);
  });

  it("enforces bounded arrays and queue redaction", () => {
    expect(() => validateWorkerAppealTargetsResponse({
      ok: true,
      items: Array.from({ length: 101 }, (_, index) => appealTarget(index)),
    })).toThrow(/bounded array/i);

    expect(() => validateModerationListResponse({
      ok: true,
      items: [{
        reviewId: "review-1",
        cityCode: "hangzhou",
        orderId: "order-1",
        workerId: "worker-1",
        rating: 5,
        comment: "must not be present in a queue row",
        commentRestricted: true,
        visibility: "pending_moderation",
        moderationVersion: 0,
        visibilityVersion: 1,
        createdAt: decidedAt,
      }],
      nextCursor: null,
    })).toThrow(/comments must remain redacted/i);
  });
});
