import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@xlb/types";
import {
  ReviewForbiddenError,
  ReviewModerationService,
  ReviewStateConflictError,
} from "../../backend/src/review/reviewModerationService.js";
import { ReviewModerationRepository } from "../../backend/src/review/reviewModerationRepository.js";

const admin: RequestContext = {
  traceId: "trace-admin", requestStartedAt: "2026-07-13T00:00:00.000Z",
  appType: "admin", role: "admin", cityCode: "hangzhou", userId: "admin-1",
};
const customer: RequestContext = {
  traceId: "trace-customer", requestStartedAt: "2026-07-13T00:00:00.000Z",
  appType: "customer", role: "customer", cityCode: "hangzhou", userId: "customer-1",
};
const worker: RequestContext = {
  traceId: "trace-worker", requestStartedAt: "2026-07-13T00:00:00.000Z",
  appType: "worker", role: "worker", cityCode: "hangzhou", userId: "worker-1",
};
const review = {
  reviewId: "review-1", cityCode: "hangzhou", orderId: "order-1",
  customerId: "customer-1", workerId: "worker-1", fulfillmentId: "fulfillment-1",
  rating: 4, comment: "content", status: "created",
  createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z",
} as const;

function serviceFor(repository: Record<string, unknown>, outbox = { insertEvent: vi.fn() }) {
  const connection = {};
  const transaction = async <T>(callback: (c: typeof connection) => Promise<T>) => callback(connection);
  const defaults = {
    hasOpenAppeal: vi.fn().mockResolvedValue(false),
    findResolutionByIdempotency: vi.fn().mockResolvedValue(null),
    findAppealLocator: vi.fn().mockResolvedValue({ reviewId: "review-1" }),
    lockAppealableReview: vi.fn().mockResolvedValue({
      review,
      visibility: { reviewId: "review-1", visibility: "hidden", moderationVersion: 1,
        version: 2, lastDecisionId: "decision-1", updatedAt: "2026-07-13T00:00:00.000Z" },
      decisionActorId: "original-admin",
    }),
  };
  return { service: new ReviewModerationService({ ...defaults, ...repository } as never, transaction as never, outbox as never), outbox };
}

describe("Phase28 Review moderation and appeal", () => {
  it("takes the review-domain lock before every command idempotency current-read", async () => {
    const moderationOrder: string[] = [];
    const visibility = { reviewId: "review-1", visibility: "visible" as const,
      moderationVersion: 1, version: 2, lastDecisionId: "decision-1",
      updatedAt: "2026-07-13T00:00:00.000Z" };
    const moderationRepository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      lockReviewForModeration: vi.fn(async () => {
        moderationOrder.push("review");
        return { review, visibility: { ...visibility, visibility: "pending_moderation" as const,
          moderationVersion: 0, version: 1, lastDecisionId: null } };
      }),
      findModerationByIdempotency: vi.fn(async () => {
        moderationOrder.push("idempotency");
        return { reviewId: "review-1", fingerprint: "mismatch" };
      }),
    };
    await expect(serviceFor(moderationRepository).service.moderate(admin, "review-1", {
      decision: "visible", reasonCode: "content_valid", reason: "reviewed",
      expectedVersion: 1, idempotencyKey: "moderate-order-1",
    })).rejects.toBeInstanceOf(ReviewStateConflictError);
    expect(moderationOrder).toEqual(["review", "idempotency"]);

    const appealOrder: string[] = [];
    const appealRepository = {
      lockAppealableReview: vi.fn(async () => {
        appealOrder.push("review");
        return { review, visibility, decisionActorId: "admin-2" };
      }),
      findAppealByIdempotency: vi.fn(async () => {
        appealOrder.push("idempotency");
        return { appeal: { reviewId: "other-review" }, fingerprint: "mismatch" };
      }),
    };
    await expect(serviceFor(appealRepository).service.createAppeal(customer, "review-1", {
      moderationVersion: 1, reason: "please reconsider", idempotencyKey: "appeal-order-1",
    })).rejects.toBeInstanceOf(ReviewStateConflictError);
    expect(appealOrder).toEqual(["review", "idempotency"]);

    const withdrawalOrder: string[] = [];
    const withdrawalRepository = {
      lockAppealableReview: vi.fn(async () => {
        withdrawalOrder.push("review");
        return { review, visibility, decisionActorId: "admin-2" };
      }),
      findAppealByWithdrawalIdempotency: vi.fn(async () => {
        withdrawalOrder.push("idempotency");
        return { appeal: { reviewId: "other-review", moderationVersion: 1 }, fingerprint: "mismatch" };
      }),
    };
    await expect(serviceFor(withdrawalRepository).service.withdrawAppeal(worker, "review-1", {
      moderationVersion: 1, idempotencyKey: "withdraw-order-1",
    })).rejects.toBeInstanceOf(ReviewStateConflictError);
    expect(withdrawalOrder).toEqual(["review", "idempotency"]);

    const resolutionOrder: string[] = [];
    const resolutionRepository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      findAppealLocator: vi.fn().mockResolvedValue({ reviewId: "review-1" }),
      lockAppealableReview: vi.fn(async () => {
        resolutionOrder.push("review");
        return { review, visibility, decisionActorId: "admin-2" };
      }),
      findResolutionByIdempotency: vi.fn(async () => {
        resolutionOrder.push("idempotency");
        return { appeal: { appealId: "other-appeal" }, fingerprint: "mismatch" };
      }),
      findAppealForUpdate: vi.fn(async () => {
        resolutionOrder.push("appeal");
        return null;
      }),
    };
    await expect(serviceFor(resolutionRepository).service.resolveAppeal(admin, "appeal-1", {
      resolution: "rejected", reason: "confirmed", expectedVersion: 1,
      idempotencyKey: "resolve-order-1",
    })).rejects.toBeInstanceOf(ReviewStateConflictError);
    expect(resolutionOrder).toEqual(["review", "idempotency"]);
    expect(resolutionRepository.findAppealForUpdate).not.toHaveBeenCalled();
  });

  it("retries an InnoDB idempotency deadlock once and returns the canonical command", async () => {
    let storedFingerprint = "";
    let transactionCount = 0;
    const canonicalVisibility = { reviewId: "review-1", visibility: "visible" as const,
      moderationVersion: 1, version: 2, lastDecisionId: "decision-1",
      updatedAt: "2026-07-13T00:01:00.000Z" };
    const repository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      lockReviewForModeration: vi.fn().mockResolvedValue({
        review,
        visibility: { ...canonicalVisibility, visibility: "pending_moderation" as const,
          moderationVersion: 0, version: 1, lastDecisionId: null },
      }),
      findModerationByIdempotency: vi.fn()
        .mockResolvedValueOnce(null)
        .mockImplementation(async () => ({ reviewId: "review-1", fingerprint: storedFingerprint })),
      insertModerationDecision: vi.fn(async (_connection, input) => {
        storedFingerprint = input.fingerprint;
        throw Object.assign(new Error("deadlock"), { errno: 1213, code: "ER_LOCK_DEADLOCK" });
      }),
      findVisibility: vi.fn().mockResolvedValue(canonicalVisibility),
    };
    const runner = async <T>(callback: (connection: object) => Promise<T>) => {
      transactionCount += 1;
      return callback({});
    };
    const service = new ReviewModerationService(repository as never, runner as never,
      { insertEvent: vi.fn() } as never);
    await expect(service.moderate(admin, "review-1", {
      decision: "visible", reasonCode: "content_valid", reason: "reviewed",
      expectedVersion: 1, idempotencyKey: "moderate-deadlock-1",
    })).resolves.toEqual({ visibility: canonicalVisibility, idempotent: true });
    expect(transactionCount).toBe(2);
    expect(repository.insertModerationDecision).toHaveBeenCalledTimes(1);
  });

  it("writes an append-only moderation decision and strict visibility.changed v1 in one transaction", async () => {
    const repository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      findModerationByIdempotency: vi.fn().mockResolvedValue(null),
      lockReviewForModeration: vi.fn().mockResolvedValue({
        review,
        visibility: { reviewId: "review-1", visibility: "pending_moderation",
          moderationVersion: 0, version: 1, lastDecisionId: null,
          updatedAt: "2026-07-13T00:00:00.000Z" },
      }),
      insertModerationDecision: vi.fn(),
      updateVisibilityCas: vi.fn().mockResolvedValue(true),
      findVisibility: vi.fn().mockResolvedValue({ reviewId: "review-1", visibility: "visible",
        moderationVersion: 1, version: 2, lastDecisionId: "decision-1",
        updatedAt: "2026-07-13T00:01:00.000Z" }),
    };
    const { service, outbox } = serviceFor(repository);
    const result = await service.moderate(admin, "review-1", {
      decision: "visible", reasonCode: "content_valid", reason: "reviewed",
      expectedVersion: 1, idempotencyKey: "moderate-0001",
    });
    expect(result.idempotent).toBe(false);
    expect(repository.insertModerationDecision).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ moderationVersion: 1, decision: "visible" }));
    const event = outbox.insertEvent.mock.calls[0][1];
    expect(event).toMatchObject({ eventType: "review.visibility.changed", eventMajorVersion: 1,
      aggregateType: "order_review" });
    expect(Object.keys(event.payload).sort()).toEqual([
      "fromVisibility", "moderationVersion", "occurredAt", "rating", "reviewId",
      "toVisibility", "workerId",
    ].sort());
  });

  it("allows Customer appeals only against the latest hidden decision", async () => {
    const repository = {
      findAppealByIdempotency: vi.fn().mockResolvedValue(null),
      lockAppealableReview: vi.fn().mockResolvedValue({
        review,
        visibility: { reviewId: "review-1", visibility: "visible", moderationVersion: 1,
          version: 2, lastDecisionId: "decision-1", updatedAt: "2026-07-13T00:00:00.000Z" },
        decisionActorId: "admin-2",
      }),
    };
    const { service } = serviceFor(repository);
    await expect(service.createAppeal(customer, "review-1", {
      moderationVersion: 1, reason: "please reconsider", idempotencyKey: "appeal-0001",
    })).rejects.toBeInstanceOf(ReviewStateConflictError);
  });

  it("withdraws the owning subject's active appeal idempotently", async () => {
    const activeAppeal = {
      appealId: "appeal-1", cityCode: "hangzhou", reviewId: "review-1",
      moderationVersion: 1, subjectType: "worker", subjectId: "worker-1",
      reason: "reason", status: "open", version: 1, resolutionReason: null,
      openedAt: "2026-07-13T00:00:00.000Z", resolvedAt: null, resolvedByAdminId: null,
    } as const;
    const withdrawnAppeal = { ...activeAppeal, status: "withdrawn" as const, version: 2 };
    const repository = {
      findAppealByWithdrawalIdempotency: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ appeal: withdrawnAppeal, fingerprint: expect.any(String) }),
      lockAppealableReview: vi.fn().mockResolvedValue({
        review,
        visibility: { reviewId: "review-1", visibility: "hidden", moderationVersion: 1,
          version: 2, lastDecisionId: "decision-1", updatedAt: "2026-07-13T00:00:00.000Z" },
        decisionActorId: "admin-2",
      }),
      findActiveAppeal: vi.fn().mockResolvedValue(activeAppeal),
      withdrawAppeal: vi.fn().mockResolvedValue(true),
    };
    const { service } = serviceFor(repository);
    const result = await service.withdrawAppeal(worker, "review-1", {
      moderationVersion: 1,
      idempotencyKey: "withdraw-0001",
    });
    expect(result).toEqual({ appeal: withdrawnAppeal, idempotent: false });
    expect(repository.withdrawAppeal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      appealId: "appeal-1", subjectType: "worker", subjectId: "worker-1", expectedVersion: 1,
    }));
  });

  it("rejects a no-op visibility decision without a decision row or event", async () => {
    const repository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      findModerationByIdempotency: vi.fn().mockResolvedValue(null),
      lockReviewForModeration: vi.fn().mockResolvedValue({
        review,
        visibility: { reviewId: "review-1", visibility: "visible",
          moderationVersion: 1, version: 2, lastDecisionId: "decision-1",
          updatedAt: "2026-07-13T00:00:00.000Z" },
      }),
      insertModerationDecision: vi.fn(),
      updateVisibilityCas: vi.fn(),
    };
    const { service, outbox } = serviceFor(repository);
    await expect(service.moderate(admin, "review-1", {
      decision: "visible", reasonCode: "content_valid", reason: "same state",
      expectedVersion: 2, idempotencyKey: "moderate-noop-0001",
    })).rejects.toBeInstanceOf(ReviewStateConflictError);
    expect(repository.insertModerationDecision).not.toHaveBeenCalled();
    expect(repository.updateVisibilityCas).not.toHaveBeenCalled();
    expect(outbox.insertEvent).not.toHaveBeenCalled();
  });

  it("blocks ordinary moderation while the current decision has an open appeal", async () => {
    const repository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      findModerationByIdempotency: vi.fn().mockResolvedValue(null),
      lockReviewForModeration: vi.fn().mockResolvedValue({
        review,
        visibility: { reviewId: "review-1", visibility: "hidden",
          moderationVersion: 1, version: 2, lastDecisionId: "decision-1",
          updatedAt: "2026-07-13T00:00:00.000Z" },
      }),
      hasOpenAppeal: vi.fn().mockResolvedValue(true),
      insertModerationDecision: vi.fn(),
      updateVisibilityCas: vi.fn(),
    };
    const { service, outbox } = serviceFor(repository);
    await expect(service.moderate(admin, "review-1", {
      decision: "visible", reasonCode: "content_valid", reason: "must wait",
      expectedVersion: 2, idempotencyKey: "moderate-open-appeal-1",
    })).rejects.toBeInstanceOf(ReviewStateConflictError);
    expect(repository.insertModerationDecision).not.toHaveBeenCalled();
    expect(repository.updateVisibilityCas).not.toHaveBeenCalled();
    expect(outbox.insertEvent).not.toHaveBeenCalled();
  });

  it("forbids the original moderator from resolving the appeal", async () => {
    const repository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      findAppealForUpdate: vi.fn().mockResolvedValue({
        appeal: { appealId: "appeal-1", cityCode: "hangzhou", reviewId: "review-1",
          moderationVersion: 1, subjectType: "customer", subjectId: "customer-1",
          reason: "reason", status: "open", version: 1, resolutionReason: null,
          openedAt: "2026-07-13T00:00:00.000Z", resolvedAt: null, resolvedByAdminId: null },
        moderationActorId: "admin-1", moderationDecisionId: "decision-1",
        resolutionFingerprint: null, resolutionIdempotencyHash: null,
      }),
    };
    const { service } = serviceFor(repository);
    await expect(service.resolveAppeal(admin, "appeal-1", {
      resolution: "rejected", reason: "confirmed", expectedVersion: 1,
      idempotencyKey: "resolve-0001",
    })).rejects.toBeInstanceOf(ReviewForbiddenError);
  });

  it("upholds an appeal by reversing visibility and emitting v1 before resolving in one transaction", async () => {
    const order: string[] = [];
    const openAppeal = { appealId: "appeal-1", cityCode: "hangzhou", reviewId: "review-1",
      moderationVersion: 1, subjectType: "customer", subjectId: "customer-1",
      reason: "reason", status: "open", version: 1, resolutionReason: null,
      openedAt: "2026-07-13T00:00:00.000Z", resolvedAt: null, resolvedByAdminId: null } as const;
    const resolvedAppeal = { ...openAppeal, status: "upheld" as const, version: 2,
      resolutionReason: "appeal accepted", resolvedAt: "2026-07-13T00:02:00.000Z",
      resolvedByAdminId: "admin-1" };
    const repository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      findAppealForUpdate: vi.fn()
        .mockImplementationOnce(async () => { order.push("appeal-lock"); return { appeal: openAppeal, moderationActorId: "admin-2",
          moderationDecisionId: "decision-1", resolutionFingerprint: null,
          resolutionIdempotencyHash: null }; })
        .mockResolvedValueOnce({ appeal: resolvedAppeal, moderationActorId: "admin-2",
          moderationDecisionId: "decision-1", resolutionFingerprint: "hash",
          resolutionIdempotencyHash: "hash" }),
      lockAppealableReview: vi.fn(async () => { order.push("review-lock"); return {
        review,
        visibility: { reviewId: "review-1", visibility: "hidden", moderationVersion: 1,
          version: 2, lastDecisionId: "decision-1",
          updatedAt: "2026-07-13T00:01:00.000Z" },
        decisionActorId: "admin-2",
      }; }),
      insertModerationDecision: vi.fn(async () => { order.push("decision"); }),
      updateVisibilityCas: vi.fn(async () => { order.push("visibility"); return true; }),
      resolveAppealCas: vi.fn(async () => { order.push("resolve"); return true; }),
    };
    const outbox = { insertEvent: vi.fn(async () => { order.push("event"); }) };
    const { service } = serviceFor(repository, outbox);
    await expect(service.resolveAppeal(admin, "appeal-1", {
      resolution: "upheld", reason: "appeal accepted", expectedVersion: 1,
      idempotencyKey: "resolve-upheld-0001",
    })).resolves.toEqual({ appeal: resolvedAppeal, idempotent: false });
    expect(repository.insertModerationDecision).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ decision: "visible", moderationVersion: 2,
        reasonCode: "appeal_upheld" }),
    );
    expect(outbox.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "review.visibility.changed",
      eventMajorVersion: 1,
      payload: expect.objectContaining({
        fromVisibility: "hidden", toVisibility: "visible", moderationVersion: 2,
      }),
    }));
    expect(order).toEqual([
      "review-lock", "appeal-lock", "decision", "visibility", "event", "resolve",
    ]);
  });

  it("does not uphold while another appeal for the same decision remains open", async () => {
    const openAppeal = { appealId: "appeal-1", cityCode: "hangzhou", reviewId: "review-1",
      moderationVersion: 1, subjectType: "customer", subjectId: "customer-1",
      reason: "reason", status: "open", version: 1, resolutionReason: null,
      openedAt: "2026-07-13T00:00:00.000Z", resolvedAt: null, resolvedByAdminId: null } as const;
    const repository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      findAppealForUpdate: vi.fn().mockResolvedValue({ appeal: openAppeal,
        moderationActorId: "admin-2", moderationDecisionId: "decision-1",
        resolutionFingerprint: null, resolutionIdempotencyHash: null }),
      lockAppealableReview: vi.fn().mockResolvedValue({
        review,
        visibility: { reviewId: "review-1", visibility: "hidden", moderationVersion: 1,
          version: 2, lastDecisionId: "decision-1",
          updatedAt: "2026-07-13T00:01:00.000Z" },
        decisionActorId: "admin-2",
      }),
      hasOpenAppeal: vi.fn().mockResolvedValue(true),
      insertModerationDecision: vi.fn(),
      updateVisibilityCas: vi.fn(),
      resolveAppealCas: vi.fn(),
    };
    const { service, outbox } = serviceFor(repository);
    await expect(service.resolveAppeal(admin, "appeal-1", {
      resolution: "upheld", reason: "appeal accepted", expectedVersion: 1,
      idempotencyKey: "resolve-other-open-1",
    })).rejects.toBeInstanceOf(ReviewStateConflictError);
    expect(repository.insertModerationDecision).not.toHaveBeenCalled();
    expect(repository.updateVisibilityCas).not.toHaveBeenCalled();
    expect(repository.resolveAppealCas).not.toHaveBeenCalled();
    expect(outbox.insertEvent).not.toHaveBeenCalled();
  });

  it("returns Worker self appeal targets with metadata only", async () => {
    const pool = { query: vi.fn().mockResolvedValue([[
      { review_id: "review-1", visibility: "hidden", moderation_version: 2,
        decided_at: new Date("2026-07-13T00:00:00.000Z"), active_appeal_status: "open",
        comment: "must-not-leak", rating: 1, customer_id: "customer-1" },
    ]]) };
    const repository = new ReviewModerationRepository(pool as never);
    const service = new ReviewModerationService(repository, (async <T>(callback: (c: object) => Promise<T>) => callback({})) as never,
      { insertEvent: vi.fn() } as never);
    const items = await service.listWorkerAppealTargets(worker);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("r.worker_id=?"),
      ["worker-1", "hangzhou", "worker-1"]);
    expect(pool.query.mock.calls[0]?.[0]).toContain("LIMIT 100");
    expect(items).toEqual([{ reviewId: "review-1", visibility: "hidden",
      moderationVersion: 2, decidedAt: "2026-07-13T00:00:00.000Z",
      activeAppealStatus: "open" }]);
    expect(Object.keys(items[0]).sort()).toEqual([
      "activeAppealStatus", "decidedAt", "moderationVersion", "reviewId", "visibility",
    ]);
  });
});
