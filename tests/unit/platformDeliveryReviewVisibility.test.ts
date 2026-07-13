import { describe, expect, it, vi } from "vitest";
import { canonicalPayloadHash } from "../../backend/src/events/platformEventCompatibility.js";
import {
  PlatformDeliveryService,
} from "../../backend/src/events/platformDeliveryService.js";

const identity = {
  identityKind: "platform_service",
  credentialKind: "internal_domain_contract",
  serviceId: "reputation-projector-service",
  subscriberId: "reputation-projector",
  cityCode: "hangzhou",
} as const;

const request = {
  subscriptionId: "review-visibility-v1-sub",
  deliveryId: "review-visibility-delivery",
  owner: "reputation-projector-worker",
  leaseToken: "7e1b6e91-cd47-4cca-baf7-84b591219ab3",
  expectedRowVersion: 2,
};

const payload = {
  reviewId: "review-1",
  workerId: "worker-1",
  rating: 5,
  fromVisibility: "pending_moderation",
  toVisibility: "visible",
  moderationVersion: 1,
  occurredAt: "2026-07-13T08:00:00.000Z",
} as const;

const subscription = {
  subscriptionId: request.subscriptionId,
  cityCode: "hangzhou",
  subscriberId: identity.subscriberId,
  eventType: "review.visibility.changed",
  eventMajorVersion: 1,
  compatibilityHandlerRevision: "review-visibility-changed-v1-r1",
  retentionClass: "R2",
  status: "active",
  leaseSeconds: 30,
  maxAttempts: 5,
  rowVersion: 1,
  liveStartCreatedAt: new Date("2026-07-13T00:00:00.000Z"),
  liveStartEventId: "evt-live-start",
} as const;

const source = {
  delivery_id: request.deliveryId,
  city_code: "hangzhou",
  subscriber_id: identity.subscriberId,
  subscription_id: request.subscriptionId,
  event_id: "evt-review-visibility-1",
  event_type: "review.visibility.changed",
  event_major_version: 1,
  payload_hash: canonicalPayloadHash(payload),
  aggregate_type: "order_review",
  aggregate_id: payload.reviewId,
  aggregate_version: payload.moderationVersion,
  aggregate_sequence: payload.moderationVersion,
  compatibility_handler_revision: subscription.compatibilityHandlerRevision,
  payload_json: payload,
  source_snapshot_consistent: true,
};

describe("Platform Delivery review visibility projection", () => {
  it("projects and transactionally revalidates the exact v1 claim", async () => {
    const repository = {
      findActiveSubscription: vi.fn().mockResolvedValue(subscription),
      readClaimCompatibilitySource: vi.fn().mockResolvedValue(source),
    };
    const service = new PlatformDeliveryService(repository as never);
    const projected = await service.projectClaimForReviewVisibilityChanged(identity, request);
    expect(projected).toMatchObject({
      eventType: "review.visibility.changed",
      eventMajorVersion: 1,
      ...payload,
    });
    await expect(service.revalidateReviewVisibilityChangedProjectionClaim(
      identity,
      request,
      projected!,
      {} as never,
    )).resolves.toBeUndefined();
    expect(repository.readClaimCompatibilitySource).toHaveBeenLastCalledWith(
      identity,
      request,
      {},
      true,
    );
  });

  it("fails closed when the locked source snapshot changed", async () => {
    const repository = {
      findActiveSubscription: vi.fn().mockResolvedValue(subscription),
      readClaimCompatibilitySource: vi.fn()
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce({ ...source, source_snapshot_consistent: false }),
    };
    const service = new PlatformDeliveryService(repository as never);
    const projected = await service.projectClaimForReviewVisibilityChanged(identity, request);
    await expect(service.revalidateReviewVisibilityChangedProjectionClaim(
      identity,
      request,
      projected!,
      {} as never,
    )).rejects.toThrow("event payload does not exactly match");
  });
});
