import { describe, expect, it } from "vitest";
import {
  parsePlatformCompatibilityPayload,
  parseVersionedPlatformCompatibilityPayload,
  platformDeliveryClaimRequestSchema,
  platformDeliveryMutationRequestSchema,
  platformDeliveryStatusSchema,
  platformEventMajorVersionSchema,
  platformEventSubscriptionSchema,
  platformServiceIdentitySchema,
} from "@xlb/validators";

const identity = {
  identityKind: "platform_service",
  credentialKind: "internal_domain_contract",
  serviceId: "platform-materializer-test",
  subscriberId: "subscriber-test",
  cityCode: "hangzhou",
} as const;

describe("Platform Delivery contract", () => {
  it("accepts exact non-negative major versions and rejects invalid/range forms", () => {
    expect(platformEventMajorVersionSchema.parse(0)).toBe(0);
    expect(platformEventMajorVersionSchema.parse(1)).toBe(1);
    for (const invalid of [-1, 1.5, "0", { min: 0, max: 1 }]) {
      expect(platformEventMajorVersionSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("requires a real-city non-human service identity and rejects bearer-role impersonation", () => {
    expect(platformServiceIdentitySchema.parse(identity)).toEqual(identity);
    expect(platformServiceIdentitySchema.safeParse({ ...identity, cityCode: "__global__" }).success).toBe(false);
    for (const role of ["customer", "worker", "admin", "operator", "auditor"]) {
      expect(platformServiceIdentitySchema.safeParse({ ...identity, role, appType: role }).success).toBe(false);
    }
  });

  it("validates subscriber/subscription state, exact city and explicit policy", () => {
    const base = {
      subscriptionId: "subscription-test",
      cityCode: "hangzhou",
      subscriberId: "subscriber-test",
      eventType: "order.created",
      eventMajorVersion: 0,
      compatibilityHandlerRevision: "implicit-v0-order-created-r1",
      retentionClass: "R1",
      status: "active",
      leaseSeconds: 30,
      maxAttempts: 5,
      rowVersion: 1,
    };
    expect(platformEventSubscriptionSchema.parse(base)).toEqual(base);
    expect(platformEventSubscriptionSchema.safeParse({ ...base, status: "unknown" }).success).toBe(false);
    expect(platformEventSubscriptionSchema.safeParse({ ...base, cityCode: "__global__" }).success).toBe(false);
    expect(platformEventSubscriptionSchema.safeParse({ ...base, minVersion: 0, maxVersion: 1 }).success).toBe(false);
  });

  it("validates delivery lifecycle states and lease owner/token CAS requests", () => {
    for (const status of ["pending", "processing", "retry_wait", "delivered", "dead_letter"]) {
      expect(platformDeliveryStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(platformDeliveryStatusSchema.safeParse("published").success).toBe(false);
    expect(platformDeliveryClaimRequestSchema.safeParse({
      subscriptionId: "subscription-test",
      owner: "worker-a",
      leaseSeconds: 30,
      limit: 10,
    }).success).toBe(true);
    expect(platformDeliveryMutationRequestSchema.safeParse({
      subscriptionId: "subscription-test",
      deliveryId: "delivery-test",
      owner: "worker-a",
      leaseToken: "not-a-uuid",
      expectedRowVersion: 2,
    }).success).toBe(false);
  });

  it("strictly validates the complete order.created raw shape", () => {
    const payload = {
      orderId: "ord-1",
      cityCode: "hangzhou",
      customerId: "customer-1",
      skuId: "sku-1",
      totalAmount: 88,
      createdAt: "2026-07-13T08:00:00.000Z",
    };
    expect(parsePlatformCompatibilityPayload("order.created", payload)).toEqual(payload);
    expect(() => parsePlatformCompatibilityPayload("order.created", { ...payload, phone: "secret" })).toThrow();
    const { skuId: _missing, ...missing } = payload;
    expect(() => parsePlatformCompatibilityPayload("order.created", missing)).toThrow();
    expect(() => parsePlatformCompatibilityPayload("order.created", { ...payload, totalAmount: "88" })).toThrow();
  });

  it("strictly validates resolved same-role requester shape and rejects unknown fields", () => {
    const payload = {
      ticketId: "ticket-1",
      cityCode: "hangzhou",
      source: "worker",
      type: "order_question",
      priority: "normal",
      status: "resolved",
      requesterId: "worker-1",
      actorId: null,
      version: 2,
      occurredAt: "2026-07-13T08:00:00.000Z",
    };
    expect(parsePlatformCompatibilityPayload("support.ticket.resolved", payload)).toEqual(payload);
    expect(() => parsePlatformCompatibilityPayload("support.ticket.resolved", { ...payload, source: "admin" })).toThrow();
    expect(() => parsePlatformCompatibilityPayload("support.ticket.resolved", { ...payload, resolutionNote: "private" })).toThrow();
    expect(() => parsePlatformCompatibilityPayload("support.ticket.assigned", payload)).toThrow(/UNSUPPORTED_EVENT_TYPE/);
  });

  it("accepts only the exact privacy-minimized review.created v1 payload", () => {
    const payload = {
      reviewId: "review-1",
      orderId: "order-1",
      workerId: "worker-1",
      rating: 5,
      visibility: "pending_moderation",
      occurredAt: "2026-07-13T08:00:00.000Z",
    };
    expect(parseVersionedPlatformCompatibilityPayload("review.created", 1, payload)).toEqual(payload);
    expect(() => parseVersionedPlatformCompatibilityPayload(
      "review.created",
      1,
      { ...payload, comment: "private comment" },
    )).toThrow();
    expect(() => parseVersionedPlatformCompatibilityPayload(
      "review.created",
      1,
      { ...payload, customerId: "customer-1" },
    )).toThrow();
    expect(() => parseVersionedPlatformCompatibilityPayload("review.created", 0, payload))
      .toThrow(/UNSUPPORTED_EVENT_VERSION/);
    expect(() => parseVersionedPlatformCompatibilityPayload("review.created", 2, payload))
      .toThrow(/UNSUPPORTED_EVENT_VERSION/);
  });

  it("accepts only the exact privacy-minimized review.visibility.changed v1 payload", () => {
    const payload = {
      reviewId: "review-1",
      workerId: "worker-1",
      rating: 5,
      fromVisibility: "pending_moderation",
      toVisibility: "visible",
      moderationVersion: 1,
      occurredAt: "2026-07-13T08:00:00.000Z",
    };
    expect(parseVersionedPlatformCompatibilityPayload(
      "review.visibility.changed",
      1,
      payload,
    )).toEqual(payload);
    for (const forbidden of [
      { comment: "private" },
      { customerId: "customer-1" },
      { cityCode: "hangzhou" },
      { decisionId: "decision-1" },
      { reasonCode: "approved" },
    ]) {
      expect(() => parseVersionedPlatformCompatibilityPayload(
        "review.visibility.changed",
        1,
        { ...payload, ...forbidden },
      )).toThrow();
    }
    expect(() => parseVersionedPlatformCompatibilityPayload(
      "review.visibility.changed",
      1,
      { ...payload, toVisibility: "pending_moderation" },
    )).toThrow();
    expect(() => parseVersionedPlatformCompatibilityPayload(
      "review.visibility.changed",
      1,
      { ...payload, fromVisibility: "visible", toVisibility: "visible" },
    )).toThrow();
    expect(() => parseVersionedPlatformCompatibilityPayload(
      "review.visibility.changed",
      2,
      payload,
    )).toThrow(/UNSUPPORTED_EVENT_VERSION/);
  });
});
