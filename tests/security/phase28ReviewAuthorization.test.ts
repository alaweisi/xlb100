import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@xlb/types";
import {
  ReviewForbiddenError,
  ReviewModerationService,
  ReviewNotFoundError,
  ReviewStateConflictError,
} from "../../backend/src/review/reviewModerationService.js";
import {
  decodeReviewQueueCursor,
  encodeReviewQueueCursor,
  ReviewQueueCursorValidationError,
} from "../../backend/src/review/reviewQueueCursorPolicy.js";

const admin = (role: "admin" | "operator" | "auditor", userId = `${role}-1`): RequestContext => ({
  traceId: `trace-${role}`,
  requestStartedAt: "2026-07-13T00:00:00.000Z",
  appType: "admin",
  role,
  cityCode: "hangzhou",
  userId,
});

const worker: RequestContext = {
  traceId: "trace-worker-foreign",
  requestStartedAt: "2026-07-13T00:00:00.000Z",
  appType: "worker",
  role: "worker",
  cityCode: "hangzhou",
  userId: "worker-foreign",
};

function serviceFor(repository: Record<string, unknown>, outbox = { insertEvent: vi.fn() }) {
  const connection = {};
  const transaction = async <T>(callback: (value: typeof connection) => Promise<T>) => callback(connection);
  return {
    service: new ReviewModerationService(repository as never, transaction as never, outbox as never),
    connection,
    outbox,
  };
}

describe("Phase28 Review authorization, city scope and idempotency", () => {
  const appeal = {
    appealId: "appeal-1", cityCode: "hangzhou", reviewId: "review-1",
    moderationVersion: 1, subjectType: "customer" as const, subjectId: "customer-1",
    reason: "private appellant statement", status: "open" as const, version: 1,
    resolutionReason: null, openedAt: "2026-07-13T00:00:00.000Z",
    resolvedAt: null, resolvedByAdminId: null,
  };

  it.each(["admin", "operator", "auditor"] as const)(
    "keeps raw comments redacted for same-city %s and creates no content-access audit",
    async (role) => {
      const repository = {
        requireAdminScope: vi.fn().mockResolvedValue(role),
        listModerationQueue: vi.fn().mockResolvedValue([{
          reviewId: "review-1",
          cityCode: "hangzhou",
          orderId: "order-1",
          workerId: "worker-1",
          rating: 5,
          comment: null,
          commentRestricted: true,
          visibility: "pending_moderation",
          moderationVersion: 0,
          visibilityVersion: 1,
          createdAt: "2026-07-13T00:00:00.000Z",
        }]),
      };
      const { service, connection } = serviceFor(repository);
      const result = await service.listModeration(admin(role), { limit: "25" });
      expect(result.items[0]).toMatchObject({ comment: null, commentRestricted: true });
      expect(result.nextCursor).toBeNull();
      expect(repository.requireAdminScope).toHaveBeenCalledWith(
        connection,
        "hangzhou",
        `${role}-1`,
      );
      expect(repository.listModerationQueue).toHaveBeenCalledWith(
        connection,
        "hangzhou",
        null,
        26,
        false,
        undefined,
      );
    },
  );

  it("reads exactly one review comment through the scoped Admin detail path and audits it", async () => {
    const content = { reviewId: "review-1", comment: "protected content" };
    const repository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      findReviewContent: vi.fn().mockResolvedValue(content),
      recordModerationDetailAccess: vi.fn(),
    };
    const { service, connection } = serviceFor(repository);
    await expect(service.getModerationContent(admin("admin"), "review-1"))
      .resolves.toEqual(content);
    expect(repository.findReviewContent).toHaveBeenCalledWith(
      connection, "hangzhou", "review-1",
    );
    expect(repository.recordModerationDetailAccess).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({
        cityCode: "hangzhou",
        reviewId: "review-1",
        actorId: "admin-1",
        traceId: "trace-admin",
      }),
    );
  });

  it.each(["operator", "auditor"] as const)(
    "forbids %s from the raw review-content detail path with zero content/audit writes",
    async (role) => {
      const repository = {
        requireAdminScope: vi.fn(),
        findReviewContent: vi.fn(),
        recordModerationDetailAccess: vi.fn(),
      };
      const { service } = serviceFor(repository);
      await expect(service.getModerationContent(admin(role), "review-1"))
        .rejects.toBeInstanceOf(ReviewForbiddenError);
      expect(repository.findReviewContent).not.toHaveBeenCalled();
      expect(repository.recordModerationDetailAccess).not.toHaveBeenCalled();
    },
  );

  it.each(["operator", "auditor"] as const)(
    "returns an exact redacted appeal queue to read-only %s",
    async (role) => {
      const repository = {
        requireAdminScope: vi.fn().mockResolvedValue(role),
        listAppeals: vi.fn().mockResolvedValue([appeal]),
      };
      const { service } = serviceFor(repository);
      await expect(service.listAppeals(admin(role), { status: "open", limit: "25" }))
        .resolves.toEqual({ items: [{
          appealId: "appeal-1",
          reviewId: "review-1",
          moderationVersion: 1,
          subjectType: "customer",
          subjectId: null,
          reason: null,
          status: "open",
          version: 1,
          resolutionReason: null,
          openedAt: "2026-07-13T00:00:00.000Z",
          resolvedAt: null,
          resolvedByAdminId: null,
          detailsRestricted: true,
        }], nextCursor: null });
    },
  );

  it("maps the dedicated same-city Admin appeal-review path to full queue details", async () => {
    const repository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      listAppeals: vi.fn().mockResolvedValue([appeal]),
    };
    const { service } = serviceFor(repository);
    await expect(service.listAppeals(admin("admin"), { status: "open", limit: "25" }))
      .resolves.toEqual({ items: [expect.objectContaining({
          subjectId: "customer-1",
          reason: "private appellant statement",
          detailsRestricted: false,
        })], nextCursor: null });
  });

  it("rejects tampered and cross-scope Review queue cursors with 400 semantics", () => {
    const scope = {
      kind: "moderation" as const,
      cityCode: "hangzhou" as const,
      role: "admin" as const,
      filter: "pending_moderation",
    };
    const cursor = encodeReviewQueueCursor(scope, {
      createdAt: "2026-07-13T00:00:00.000Z",
      entityId: "review-1",
    });
    expect(decodeReviewQueueCursor(cursor, scope)).toEqual({
      createdAt: "2026-07-13T00:00:00.000Z",
      entityId: "review-1",
    });
    const envelope = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = envelope.lastIndexOf(".");
    expect(separator).toBeGreaterThan(0);
    const signature = envelope.slice(separator + 1);
    const tamperedSignature = `${signature.startsWith("x") ? "y" : "x"}${signature.slice(1)}`;
    const tampered = Buffer.from(
      `${envelope.slice(0, separator + 1)}${tamperedSignature}`,
      "utf8",
    ).toString("base64url");
    expect(() => decodeReviewQueueCursor(tampered, scope))
      .toThrow(ReviewQueueCursorValidationError);
    expect(() => decodeReviewQueueCursor(cursor, { ...scope, cityCode: "shanghai" }))
      .toThrow(ReviewQueueCursorValidationError);
    expect(() => decodeReviewQueueCursor(cursor, { ...scope, role: "auditor" }))
      .toThrow(ReviewQueueCursorValidationError);
    expect(() => decodeReviewQueueCursor(cursor, { ...scope, filter: "hidden" }))
      .toThrow(ReviewQueueCursorValidationError);
    expect(() => decodeReviewQueueCursor(cursor, { ...scope, kind: "appeal" }))
      .toThrow(ReviewQueueCursorValidationError);
    for (const invalid of [
      tampered,
      encodeReviewQueueCursor({ ...scope, cityCode: "shanghai" }, {
        createdAt: "2026-07-13T00:00:00.000Z", entityId: "review-1",
      }),
    ]) {
      try {
        decodeReviewQueueCursor(invalid, scope);
      } catch (error) {
        expect(error).toMatchObject({ statusCode: 400 });
      }
    }
  });

  it("returns a bounded next cursor and rejects reusing it with another queue filter", async () => {
    const rows = ["review-1", "review-2"].map((reviewId, index) => ({
      reviewId,
      cityCode: "hangzhou",
      orderId: `order-${index + 1}`,
      workerId: "worker-1",
      rating: 5,
      comment: null,
      commentRestricted: true,
      visibility: "pending_moderation" as const,
      moderationVersion: 0,
      visibilityVersion: 1,
      createdAt: `2026-07-13T00:00:0${index}.000Z`,
    }));
    const repository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      listModerationQueue: vi.fn().mockResolvedValue(rows),
    };
    const { service, connection } = serviceFor(repository);
    const firstPage = await service.listModeration(admin("admin"), {
      visibility: "pending_moderation",
      limit: "1",
    });
    expect(firstPage.items).toEqual([rows[0]]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(repository.listModerationQueue).toHaveBeenCalledWith(
      connection, "hangzhou", "pending_moderation", 2, false, undefined,
    );

    const secondRepository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      listModerationQueue: vi.fn().mockResolvedValue([]),
    };
    const { service: secondService, connection: secondConnection } = serviceFor(secondRepository);
    await expect(secondService.listModeration(admin("admin"), {
      visibility: "pending_moderation",
      limit: "1",
      cursor: firstPage.nextCursor,
    })).resolves.toEqual({ items: [], nextCursor: null });
    expect(secondRepository.listModerationQueue).toHaveBeenCalledWith(
      secondConnection,
      "hangzhou",
      "pending_moderation",
      2,
      false,
      { createdAt: rows[0].createdAt, entityId: rows[0].reviewId },
    );
    await expect(secondService.listModeration(admin("admin"), {
      visibility: "hidden",
      limit: "1",
      cursor: firstPage.nextCursor,
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("returns an idempotent moderation result without a second decision, event or target write", async () => {
    const request = {
      decision: "visible" as const,
      reasonCode: "content_valid",
      reason: "reviewed",
      expectedVersion: 1,
      idempotencyKey: "moderate-0001",
    };
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({
        reviewId: "review-1",
        decision: request.decision,
        reasonCode: request.reasonCode,
        reason: request.reason,
        expectedVersion: request.expectedVersion,
      }), "utf8")
      .digest("hex");
    const visibility = {
      reviewId: "review-1",
      visibility: "visible",
      moderationVersion: 1,
      version: 2,
      lastDecisionId: "decision-1",
      updatedAt: "2026-07-13T00:01:00.000Z",
    };
    const repository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      lockReviewForModeration: vi.fn().mockResolvedValue({
        review: {
          reviewId: "review-1", cityCode: "hangzhou", orderId: "order-1",
          customerId: "customer-1", workerId: "worker-1", fulfillmentId: "fulfillment-1",
          rating: 5, comment: "protected", status: "created",
          createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z",
        },
        visibility,
      }),
      findModerationByIdempotency: vi.fn().mockResolvedValue({
        reviewId: "review-1",
        fingerprint,
      }),
      findVisibility: vi.fn().mockResolvedValue(visibility),
      insertModerationDecision: vi.fn(),
      updateVisibilityCas: vi.fn(),
    };
    const { service, outbox } = serviceFor(repository);
    await expect(service.moderate(admin("admin"), "review-1", request)).resolves.toEqual({
      visibility,
      idempotent: true,
    });
    expect(repository.lockReviewForModeration).toHaveBeenCalledWith(
      expect.anything(), "hangzhou", "review-1",
    );
    expect(repository.insertModerationDecision).not.toHaveBeenCalled();
    expect(repository.updateVisibilityCas).not.toHaveBeenCalled();
    expect(outbox.insertEvent).not.toHaveBeenCalled();
  });

  it("rejects reuse of a moderation idempotency key with another fingerprint", async () => {
    const repository = {
      requireAdminScope: vi.fn().mockResolvedValue("admin"),
      lockReviewForModeration: vi.fn().mockResolvedValue({
        review: {
          reviewId: "review-1", cityCode: "hangzhou", orderId: "order-1",
          customerId: "customer-1", workerId: "worker-1", fulfillmentId: "fulfillment-1",
          rating: 5, comment: "protected", status: "created",
          createdAt: "2026-07-13T00:00:00.000Z", updatedAt: "2026-07-13T00:00:00.000Z",
        },
        visibility: {
          reviewId: "review-1", visibility: "pending_moderation", moderationVersion: 0,
          version: 1, lastDecisionId: null, updatedAt: "2026-07-13T00:00:00.000Z",
        },
      }),
      findModerationByIdempotency: vi.fn().mockResolvedValue({
        reviewId: "review-1",
        fingerprint: "0".repeat(64),
      }),
    };
    const { service, outbox } = serviceFor(repository);
    await expect(service.moderate(admin("admin"), "review-1", {
      decision: "visible",
      reasonCode: "content_valid",
      reason: "reviewed",
      expectedVersion: 1,
      idempotencyKey: "moderate-0001",
    })).rejects.toBeInstanceOf(ReviewStateConflictError);
    expect(outbox.insertEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["an existing foreign relationship", {
        review: {
          reviewId: "review-1",
          cityCode: "hangzhou",
          orderId: "order-1",
          customerId: "customer-1",
          workerId: "worker-owner",
          fulfillmentId: "fulfillment-1",
          rating: 5,
          comment: "protected",
          status: "created",
          createdAt: "2026-07-13T00:00:00.000Z",
          updatedAt: "2026-07-13T00:00:00.000Z",
        },
        visibility: {
          reviewId: "review-1",
          visibility: "hidden",
          moderationVersion: 1,
          version: 2,
          lastDecisionId: "decision-1",
          updatedAt: "2026-07-13T00:01:00.000Z",
        },
        decisionActorId: "admin-1",
      }],
    ["a nonexistent relationship", null],
  ] as const)("returns the same 404-style non-disclosure for %s with zero writes", async (_case, locked) => {
    const repository = {
      findAppealByIdempotency: vi.fn().mockResolvedValue(null),
      lockAppealableReview: vi.fn().mockResolvedValue(locked),
      findActiveAppeal: vi.fn(),
      insertAppeal: vi.fn(),
    };
    const { service } = serviceFor(repository);
    const result = service.createAppeal(worker, "review-1", {
      moderationVersion: 1,
      reason: "foreign relationship",
      idempotencyKey: "appeal-foreign-0001",
    });
    await expect(result).rejects.toBeInstanceOf(ReviewNotFoundError);
    await expect(result).rejects.toMatchObject({
      statusCode: 404,
      message: "review or moderation decision was not found",
    });
    expect(repository.findActiveAppeal).not.toHaveBeenCalled();
    expect(repository.insertAppeal).not.toHaveBeenCalled();
  });
});
