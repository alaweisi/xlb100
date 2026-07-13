import { describe, expect, it, vi } from "vitest";
import type { PlatformEventSubscription } from "@xlb/types";
import { PlatformDeliveryRepository } from "../../backend/src/events/platformDeliveryRepository.js";

const subscription: PlatformEventSubscription & {
  liveStartCreatedAt: Date;
  liveStartEventId: string;
} = {
  subscriptionId: "sub-review-v1",
  cityCode: "hangzhou",
  subscriberId: "reputation-projector",
  eventType: "review.created",
  eventMajorVersion: 1,
  compatibilityHandlerRevision: "review-created-v1-r1",
  retentionClass: "R2",
  status: "active",
  leaseSeconds: 30,
  maxAttempts: 5,
  rowVersion: 1,
  liveStartCreatedAt: new Date("2026-07-13T08:00:00.000Z"),
  liveStartEventId: "evt-live-start",
};

describe("Platform Delivery versioned source selection", () => {
  it("filters candidate and reconciliation scans by exact source major", async () => {
    const query = vi.fn().mockResolvedValue([[]]);
    const repository = new PlatformDeliveryRepository({ query } as never);

    await repository.listCandidateSourceEvents(subscription, 10);
    await repository.listReconciliationGaps(subscription, 10);
    await repository.hasReconciliationGap(subscription);

    expect(query).toHaveBeenCalledTimes(3);
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain("e.event_major_version=?");
      expect(params).toContain("review.created");
      expect(params).toContain(1);
    }
  });

  it("uses the same exact-major filter for visibility transitions", async () => {
    const query = vi.fn().mockResolvedValue([[]]);
    const repository = new PlatformDeliveryRepository({ query } as never);
    await repository.listCandidateSourceEvents({
      ...subscription,
      eventType: "review.visibility.changed",
    }, 10);
    expect(query.mock.calls[0]?.[0]).toContain("e.event_major_version=?");
    expect(query.mock.calls[0]?.[1]).toContain("review.visibility.changed");
    expect(query.mock.calls[0]?.[1]).toContain(1);
  });

  it.each([
    ["review.created", {
      reviewId: "review-1", orderId: "order-1", workerId: "worker-1", rating: 5,
      visibility: "pending_moderation", occurredAt: "2026-07-13T08:00:00.000Z",
    }, 1],
    ["review.visibility.changed", {
      reviewId: "review-1", workerId: "worker-1", rating: 5,
      fromVisibility: "visible", toVisibility: "hidden", moderationVersion: 3,
      occurredAt: "2026-07-13T09:00:00.000Z",
    }, 3],
  ] as const)("persists exact aggregate version/sequence for %s", async (eventType, payload, version) => {
    const source = {
      event_id: `event-${version}`,
      event_type: eventType,
      event_major_version: 1,
      aggregate_type: "order_review",
      aggregate_id: "review-1",
      city_code: "hangzhou",
      payload_json: payload,
      created_at: new Date("2026-07-13T09:00:00.000Z"),
    };
    const versionedSubscription = { ...subscription, eventType };
    const repository = {
      findActiveSubscription: vi.fn().mockResolvedValue(versionedSubscription),
      listCandidateSourceEvents: vi.fn().mockResolvedValue([source]),
      insertDelivery: vi.fn().mockResolvedValue(true),
      advanceCandidateCheckpoint: vi.fn(),
      recordMaterializationRejection: vi.fn(),
    };
    const { PlatformDeliveryService } = await import(
      "../../backend/src/events/platformDeliveryService.js"
    );
    const service = new PlatformDeliveryService(repository as never);
    await expect(service.materializeCandidateBatch({
      identityKind: "platform_service",
      credentialKind: "internal_domain_contract",
      serviceId: "reputation-service",
      subscriberId: "reputation-projector",
      cityCode: "hangzhou",
    }, versionedSubscription.subscriptionId, 10)).resolves.toMatchObject({ inserted: 1, rejected: 0 });
    expect(repository.insertDelivery).toHaveBeenCalledWith(
      versionedSubscription,
      source,
      expect.stringMatching(/^[a-f0-9]{64}$/),
      "reputation-service",
      "materialized",
      version,
      version,
    );
  });
});
