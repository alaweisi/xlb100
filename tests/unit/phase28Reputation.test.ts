import { describe, expect, it, vi } from "vitest";
import type { PlatformDeliveryClaim, RequestContext } from "@xlb/types";
import { ReputationService } from "../../backend/src/review/reputationService.js";
import {
  ReputationProjectionConflictError,
  ReputationRepository,
} from "../../backend/src/review/reputationRepository.js";

const workerContext: RequestContext = {
  traceId: "trace-worker", requestStartedAt: "2026-07-13T00:00:00.000Z",
  appType: "worker", role: "worker", cityCode: "hangzhou", userId: "worker-1",
};

describe("Phase28 Reputation event/read-model boundary", () => {
  it("returns only the authenticated worker's active-generation aggregate", async () => {
    const expected = { workerId: "worker-1", cityCode: "hangzhou", ratingCount: 1,
      ratingSum: 5, ratingDistribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
      averageRating: 5, sourceGenerationId: "generation-1",
      formulaRevision: "visible_arithmetic_mean_v1", sourceWatermark: "event-1",
      updatedAt: "2026-07-13T00:00:00.000Z" } as const;
    const repository = { findWorkerReputation: vi.fn().mockResolvedValue(expected) };
    const service = new ReputationService(repository as never, {} as never, {} as never);
    await expect(service.getWorkerSelf(workerContext)).resolves.toEqual(expected);
    expect(repository.findWorkerReputation).toHaveBeenCalledWith("hangzhou", "worker-1");
  });

  it("revalidates an exact visibility.changed v1 claim inside the projection transaction", async () => {
    const projection = { deliveryId: "delivery-1", cityCode: "hangzhou",
      subscriberId: "reputation", subscriptionId: "sub-1", eventId: "event-1",
      eventType: "review.visibility.changed", eventMajorVersion: 1,
      payloadHash: "a".repeat(64), compatibilityHandlerRevision: "review-v1-r1",
      aggregateVersion: 1, aggregateSequence: 1,
      reviewId: "review-1", workerId: "worker-1", rating: 5,
      fromVisibility: "pending_moderation", toVisibility: "visible",
      moderationVersion: 1, occurredAt: "2026-07-13T00:00:00.000Z" } as const;
    const claim = { ...projection, aggregateType: "order_review", aggregateId: "review-1",
      aggregateVersion: 1, aggregateSequence: 1, status: "processing",
      availableAt: projection.occurredAt, leaseOwner: "worker",
      leaseToken: "00000000-0000-4000-8000-000000000001",
      leaseExpiresAt: projection.occurredAt, attemptCount: 1, maxAttempts: 5,
      rowVersion: 2, createdAt: projection.occurredAt, updatedAt: projection.occurredAt,
      deliveredAt: null, deadLetteredAt: null, lastErrorCode: null,
      lastErrorMessage: null, lastFailedAt: null } as unknown as PlatformDeliveryClaim;
    const order: string[] = [];
    const platform = {
      projectClaimForReviewVisibilityChanged: vi.fn(async () => projection),
      revalidateReviewVisibilityChangedProjectionClaim: vi.fn(async () => { order.push("revalidate"); }),
    };
    const repository = {
      materializeVisibilityChanged: vi.fn(async () => { order.push("materialize"); return "applied" as const; }),
    };
    const transaction = async <T>(callback: (connection: object) => Promise<T>) => callback({});
    const service = new ReputationService(repository as never, platform as never, transaction as never);
    await expect(service.materializeClaim({ identityKind: "platform_service",
      credentialKind: "internal_domain_contract", serviceId: "reputation-service",
      subscriberId: "reputation", cityCode: "hangzhou" }, claim))
      .resolves.toEqual({ outcome: "applied" });
    expect(order).toEqual(["revalidate", "materialize"]);
  });

  it("rejects review.created when its order identity conflicts with the canonical review", async () => {
    const query = vi.fn(async (sqlValue: unknown) => {
      const sql = String(sqlValue);
      if (sql.includes("FROM reputation_projection_pointers")) {
        return [[{ active_generation_id: "generation-1" }], []];
      }
      if (sql.includes("FROM reputation_projection_receipts")) return [[], []];
      if (sql.includes("FROM order_reviews r")) {
        return [[{ order_id: "another-order", worker_id: "worker-1", rating: 5 }], []];
      }
      return [{ affectedRows: 1 }, []];
    });
    const repository = new ReputationRepository({} as never);
    await expect(repository.materializeCreated({ query } as never, {
      deliveryId: "delivery-created", cityCode: "hangzhou", subscriberId: "reputation",
      subscriptionId: "sub-created", eventId: "event-created", eventType: "review.created",
      eventMajorVersion: 1, payloadHash: "a".repeat(64),
      compatibilityHandlerRevision: "review-created-v1",
      aggregateVersion: 1, aggregateSequence: 1, reviewId: "review-1",
      orderId: "order-1", workerId: "worker-1", rating: 5,
      visibility: "pending_moderation", occurredAt: "2026-07-13T00:00:00.000Z",
    }, "service")).rejects.toBeInstanceOf(ReputationProjectionConflictError);
    expect(query.mock.calls.some(([sql]) => String(sql).includes(
      "INSERT INTO reputation_review_contributions",
    ))).toBe(false);
  });

  it("retries visibility-before-created without aggregate drift and recovers once the source contribution exists", async () => {
    let contribution: { visibility: string; version: number } | null = null;
    let aggregateCount = 0;
    const receipts = new Map<string, { generation_id: string; review_id: string;
      payload_hash: string; event_major_version: number }>();
    const connection = {
      query: vi.fn(async (sqlValue: unknown, params: unknown[] = []) => {
        const sql = String(sqlValue);
        if (sql.includes("FROM reputation_projection_pointers")) {
          return [[{ active_generation_id: "generation-1" }], []];
        }
        if (sql.includes("FROM reputation_projection_receipts")) {
          return [[receipts.get(String(params[1]))].filter(Boolean), []];
        }
        if (sql.includes("INNER JOIN review_moderation_decisions d")) {
          const version = Number(params[0]);
          return [[version === 1
            ? { worker_id: "worker-1", rating: 5, decision: "visible", previous_decision: null }
            : { worker_id: "worker-1", rating: 5, decision: "hidden", previous_decision: "visible" }], []];
        }
        if (sql.includes("FROM order_reviews r")) {
          return [[{ order_id: "order-1", worker_id: "worker-1", rating: 5 }], []];
        }
        if (sql.includes("INSERT INTO reputation_review_contributions")) {
          contribution = { visibility: "pending_moderation", version: 0 };
          return [{ affectedRows: 1 }, []];
        }
        if (sql.includes("SELECT contribution_id")) {
          return [contribution ? [{ contribution_id: "contribution-1", worker_id: "worker-1",
            rating: 5, visibility: contribution.visibility,
            source_moderation_version: contribution.version }] : [], []];
        }
        if (sql.includes("INSERT INTO reputation_worker_aggregates")) {
          aggregateCount += 1;
          return [{ affectedRows: 1 }, []];
        }
        if (sql.includes("UPDATE reputation_worker_aggregates")) {
          aggregateCount -= 1;
          return [{ affectedRows: 1 }, []];
        }
        if (sql.includes("UPDATE reputation_review_contributions")) {
          contribution = { visibility: String(params[0]), version: Number(params[2]) };
          return [{ affectedRows: 1 }, []];
        }
        if (sql.includes("INSERT INTO reputation_projection_receipts")) {
          receipts.set(String(params[4]), { generation_id: String(params[2]),
            review_id: String(params[5]), payload_hash: String(params[6]), event_major_version: 1 });
          return [{ affectedRows: 1 }, []];
        }
        return [{ affectedRows: 1 }, []];
      }),
    };
    const repository = new ReputationRepository({} as never);
    const created = { deliveryId: "delivery-created", cityCode: "hangzhou",
      subscriberId: "reputation", subscriptionId: "sub-created", eventId: "event-created",
      eventType: "review.created", eventMajorVersion: 1, payloadHash: "a".repeat(64),
      compatibilityHandlerRevision: "review-created-v1",
      aggregateVersion: 1, aggregateSequence: 1, reviewId: "review-1",
      orderId: "order-1", workerId: "worker-1", rating: 5,
      visibility: "pending_moderation", occurredAt: "2026-07-13T00:00:00.000Z" } as const;
    const changed = { deliveryId: "delivery-changed", cityCode: "hangzhou",
      subscriberId: "reputation", subscriptionId: "sub-changed", eventId: "event-changed",
      eventType: "review.visibility.changed", eventMajorVersion: 1,
      payloadHash: "b".repeat(64), compatibilityHandlerRevision: "review-visibility-v1",
      aggregateVersion: 1, aggregateSequence: 1,
      reviewId: "review-1", workerId: "worker-1", rating: 5,
      fromVisibility: "pending_moderation", toVisibility: "visible",
      moderationVersion: 1, occurredAt: "2026-07-13T00:01:00.000Z" } as const;
    const hidden = { ...changed, deliveryId: "delivery-hidden", eventId: "event-hidden",
      payloadHash: "c".repeat(64), fromVisibility: "visible" as const,
      toVisibility: "hidden" as const, moderationVersion: 2,
      aggregateVersion: 2, aggregateSequence: 2,
      occurredAt: "2026-07-13T00:02:00.000Z" } as const;
    const staleDuplicate = { ...changed, deliveryId: "delivery-stale", eventId: "event-stale",
      payloadHash: "d".repeat(64), occurredAt: "2026-07-13T00:03:00.000Z" } as const;

    await expect(repository.materializeVisibilityChanged(connection as never, changed, "service"))
      .rejects.toBeInstanceOf(ReputationProjectionConflictError);
    expect(aggregateCount).toBe(0);
    await expect(repository.materializeCreated(connection as never, created, "service"))
      .resolves.toBe("applied");
    await expect(repository.materializeVisibilityChanged(connection as never, hidden, "service"))
      .rejects.toBeInstanceOf(ReputationProjectionConflictError);
    expect(aggregateCount).toBe(0);
    await expect(repository.materializeVisibilityChanged(connection as never, changed, "service"))
      .resolves.toBe("applied");
    expect(aggregateCount).toBe(1);
    await expect(repository.materializeVisibilityChanged(connection as never, hidden, "service"))
      .resolves.toBe("applied");
    expect(aggregateCount).toBe(0);
    await expect(repository.materializeVisibilityChanged(connection as never, changed, "service"))
      .resolves.toBe("reused");
    expect(aggregateCount).toBe(0);
    await expect(repository.materializeVisibilityChanged(
      connection as never, staleDuplicate, "service",
    )).resolves.toBe("reused");
    expect(aggregateCount).toBe(0);
  });
});
