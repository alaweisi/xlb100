import { describe, expect, it, vi } from "vitest";
import { MarketingService } from "../../backend/src/marketing/marketingService.js";
import { PlatformDeliveryService } from "../../backend/src/events/platformDeliveryService.js";
import { canonicalPayloadHash } from "../../backend/src/events/platformEventCompatibility.js";

const now = new Date("2026-07-14T03:00:00.000Z");
const expiresAt = "2026-08-13T03:00:00.000Z";

const identity = {
  identityKind: "platform_service",
  credentialKind: "internal_domain_contract",
  serviceId: "marketing-compensation-v1",
  subscriberId: "marketing-compensation-subscriber",
  cityCode: "hangzhou",
} as const;

const claim = {
  subscriptionId: "marketing-cancel-v0",
  deliveryId: "delivery-1",
  cityCode: "hangzhou",
  subscriberId: identity.subscriberId,
  eventId: "event-1",
  eventType: "order.reverse.applied",
  eventMajorVersion: 0,
  payloadHash: "a".repeat(64),
  aggregateType: "order_reverse",
  aggregateId: "reverse-1",
  aggregateVersion: null,
  aggregateSequence: null,
  status: "processing",
  availableAt: now.toISOString(),
  leaseOwner: "unit-worker",
  leaseToken: "123e4567-e89b-42d3-a456-426614174000",
  leaseExpiresAt: "2026-07-14T03:01:00.000Z",
  attemptCount: 1,
  maxAttempts: 5,
  lastErrorCode: null,
  lastErrorMessage: null,
  deliveredAt: null,
  deadLetteredAt: null,
  rowVersion: 2,
} as const;

const projection = {
  deliveryId: claim.deliveryId,
  cityCode: "hangzhou",
  subscriberId: identity.subscriberId,
  subscriptionId: claim.subscriptionId,
  eventId: claim.eventId,
  eventType: "order.reverse.applied",
  eventMajorVersion: 0,
  payloadHash: claim.payloadHash,
  compatibilityHandlerRevision: "marketing-compensation-v1",
  triggerType: "order_cancellation",
  triggerId: "reverse-1",
  orderId: "order-1",
  customerId: null,
  refundAmount: null,
  refundCurrency: null,
  occurredAt: null,
} as const;

const campaign = {
  marketingCampaignId: "campaign-1", cityCode: "hangzhou", name: "campaign",
  status: "ended", activeRuleRevisionId: "rule-1",
  startAt: "2026-01-01T00:00:00.000Z", endAt: "2026-06-01T00:00:00.000Z",
  reviewedBy: "admin-2", reviewedAt: "2026-01-01T00:00:00.000Z", version: 6,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
} as const;
const ruleRevision = {
  ruleRevisionId: "rule-1", marketingCampaignId: campaign.marketingCampaignId,
  cityCode: "hangzhou", revision: 1, status: "published", allowedSkuIds: ["sku-1"],
  createdBy: "admin-1", reviewedBy: "admin-2", reviewedAt: "2026-01-01T00:00:00.000Z",
  publishedBy: "admin-3", publishedAt: "2026-01-01T00:00:00.000Z", version: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
} as const;
const definition = {
  couponDefinitionId: "definition-1", marketingCampaignId: campaign.marketingCampaignId,
  ruleRevisionId: ruleRevision.ruleRevisionId, cityCode: "hangzhou", name: "fixed-10",
  status: "expired", currency: "CNY", faceValueMinor: 1_000, minSpendMinor: 2_000,
  issuanceCap: 100, issuedCount: 20, compensationCap: 10, compensationIssuedCount: 1,
  validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2026-06-01T00:00:00.000Z",
  version: 8, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z",
} as const;
const sourceGrant = {
  couponGrantId: "source-grant-1", couponDefinitionId: definition.couponDefinitionId,
  marketingCampaignId: campaign.marketingCampaignId, ruleRevisionId: ruleRevision.ruleRevisionId,
  cityCode: "hangzhou", customerId: "customer-1", status: "redeemed",
  issuanceReason: "admin_manual", issuanceRef: "manual-1",
  availableAt: "2026-05-01T00:00:00.000Z", expiresAt: "2026-06-01T00:00:00.000Z",
  version: 3, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-02T00:00:00.000Z",
} as const;
const redemption = {
  couponRedemptionId: "redemption-1", couponReservationId: "reservation-1",
  couponGrantId: sourceGrant.couponGrantId, discountDecisionId: "decision-1", orderId: "order-1",
  cityCode: "hangzhou", customerId: "customer-1", currency: "CNY",
  discountAmountMinor: 1_000, redeemedAt: "2026-05-02T00:00:00.000Z",
} as const;
const source = {
  grant: sourceGrant, definition, ruleRevision, campaign, ruleContentHash: "b".repeat(64),
  redemption, orderTotalDecimal: "100.00", orderStatus: "cancelled",
};

function fixture(overrides: Record<string, unknown> = {}) {
  const grantedCompensation = {
    compensationId: "compensation-1", cityCode: "hangzhou", customerId: "customer-1",
    sourceCouponRedemptionId: redemption.couponRedemptionId, triggerType: "order_cancellation",
    triggerId: "reverse-1", status: "granted", currency: "CNY", amountMinor: 1_000,
    resultingCouponGrantId: "compensation-grant-1", decisionReason: null, expiresAt, version: 2,
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  } as const;
  const compensationGrant = {
    ...sourceGrant,
    couponGrantId: "compensation-grant-1",
    status: "available",
    issuanceReason: "order_cancellation",
    issuanceRef: "reverse-1",
    expiresAt,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version: 1,
  } as const;
  const repository = {
    findCompensationByDeliveryForUpdate: vi.fn().mockResolvedValue(null),
    loadCompensationSourceForUpdate: vi.fn().mockResolvedValue(source),
    findCompensationByTriggerForUpdate: vi.fn().mockResolvedValue(null),
    incrementCompensationIssuance: vi.fn().mockResolvedValue(true),
    insertCompensation: vi.fn().mockResolvedValue(undefined),
    insertGrant: vi.fn().mockResolvedValue(undefined),
    markCompensationGranted: vi.fn().mockResolvedValue(true),
    findCompensationForUpdate: vi.fn().mockResolvedValue(grantedCompensation),
    findGrantForUpdate: vi.fn().mockResolvedValue(compensationGrant),
    insertAudit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const platform = {
    projectClaimForMarketingCompensation: vi.fn().mockResolvedValue(projection),
    revalidateMarketingCompensationProjectionClaim: vi.fn().mockResolvedValue(undefined),
  };
  const transaction = async <T>(callback: (connection: object) => Promise<T>) => callback({});
  const service = new MarketingService(
    repository as never,
    transaction as never,
    () => now,
    {} as never,
    platform as never,
  );
  return { service, repository, platform, grantedCompensation, compensationGrant };
}

describe("Phase29 dormant Marketing compensation", () => {
  it("atomically grants the original fixed discount for exactly 30 days using only compensation cap", async () => {
    const { service, repository, platform } = fixture();
    const result = await service.materializeCompensationClaim(identity, claim as never);

    expect(result.outcome).toBe("granted");
    expect(platform.revalidateMarketingCompensationProjectionClaim).toHaveBeenCalledTimes(1);
    expect(repository.incrementCompensationIssuance).toHaveBeenCalledWith(
      expect.anything(), "hangzhou", definition.couponDefinitionId, definition.version,
    );
    expect(repository.insertGrant).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      customerId: redemption.customerId,
      definition,
      issuanceReason: "order_cancellation",
      issuanceRef: "reverse-1",
      expiresAt: new Date(expiresAt),
    }));
    expect(repository.insertCompensation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      amountMinor: redemption.discountAmountMinor,
      deliveryId: claim.deliveryId,
      eventId: claim.eventId,
      payloadHash: claim.payloadHash,
      status: "pending",
    }));
  });

  it("fails closed on partial refund and creates no grant or capacity mutation", async () => {
    const refundProjection = {
      ...projection,
      eventType: "refund.approved",
      triggerType: "full_refund",
      triggerId: "refund-1",
      customerId: "customer-1",
      refundAmount: 99,
      refundCurrency: "CNY",
      occurredAt: now.toISOString(),
    } as const;
    const denied = {
      compensationId: "denied-1", cityCode: "hangzhou", customerId: "customer-1",
      sourceCouponRedemptionId: redemption.couponRedemptionId, triggerType: "full_refund",
      triggerId: "refund-1", status: "denied", currency: "CNY", amountMinor: 1_000,
      resultingCouponGrantId: null, decisionReason: "partial_refund_is_not_supported",
      expiresAt: null, version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(),
    } as const;
    const { service, repository, platform } = fixture({
      findCompensationForUpdate: vi.fn().mockResolvedValue(denied),
    });
    platform.projectClaimForMarketingCompensation.mockResolvedValue(refundProjection);
    const refundClaim = { ...claim, eventType: "refund.approved" } as const;

    const result = await service.materializeCompensationClaim(identity, refundClaim as never);

    expect(result.outcome).toBe("denied");
    expect(repository.insertCompensation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: "denied",
      decisionReason: "partial_refund_is_not_supported",
    }));
    expect(repository.incrementCompensationIssuance).not.toHaveBeenCalled();
    expect(repository.insertGrant).not.toHaveBeenCalled();
  });

  it("reuses delivery evidence without consuming cap or issuing another grant", async () => {
    const replay = fixture().grantedCompensation;
    const { service, repository } = fixture({
      findCompensationByDeliveryForUpdate: vi.fn().mockResolvedValue(replay),
    });

    const result = await service.materializeCompensationClaim(identity, claim as never);

    expect(result.outcome).toBe("reused");
    expect(repository.loadCompensationSourceForUpdate).not.toHaveBeenCalled();
    expect(repository.incrementCompensationIssuance).not.toHaveBeenCalled();
    expect(repository.insertGrant).not.toHaveBeenCalled();
  });

  it("keeps a compensating grant usable after natural end but rejects paused scope", () => {
    const { service } = fixture();
    const compensationEligibility = {
      grant: { ...sourceGrant, status: "available", issuanceReason: "full_refund", expiresAt },
      definition,
      ruleRevision,
      campaign,
      ruleContentHash: "b".repeat(64),
    };
    expect(() => (service as any).assertDecisionEligibility(
      compensationEligibility,
      "sku-1",
      10_000,
    )).not.toThrow();
    expect(() => (service as any).assertDecisionEligibility(
      { ...compensationEligibility, campaign: { ...campaign, status: "paused" } },
      "sku-1",
      10_000,
    )).toThrow(/paused, revoked, suspended, or retired/);
  });
});

describe("Phase29 Marketing Platform compatibility boundary", () => {
  it("projects and transactionally revalidates only exact cancel-applied v0 evidence", async () => {
    const payload = {
      reverseRequestId: "reverse-1",
      orderId: "order-1",
      reverseType: "cancel",
      dispatchMutation: false,
    } as const;
    const source = {
      delivery_id: claim.deliveryId,
      city_code: "hangzhou",
      subscriber_id: identity.subscriberId,
      subscription_id: claim.subscriptionId,
      event_id: claim.eventId,
      event_type: "order.reverse.applied",
      event_major_version: 0,
      payload_hash: canonicalPayloadHash(payload),
      aggregate_type: "order_reverse",
      aggregate_id: "reverse-1",
      aggregate_version: null,
      aggregate_sequence: null,
      compatibility_handler_revision: "marketing-compensation-v1",
      payload_json: payload,
      source_snapshot_consistent: true,
    } as const;
    const subscription = {
      subscriptionId: claim.subscriptionId,
      cityCode: "hangzhou",
      subscriberId: identity.subscriberId,
      eventType: "order.reverse.applied",
      eventMajorVersion: 0,
      compatibilityHandlerRevision: "marketing-compensation-v1",
      retentionClass: "R2",
      status: "active",
      leaseSeconds: 30,
      maxAttempts: 5,
      rowVersion: 1,
      liveStartCreatedAt: new Date("2026-07-14T00:00:00.000Z"),
      liveStartEventId: "live-start-event",
    } as const;
    const repository = {
      findActiveSubscription: vi.fn().mockResolvedValue(subscription),
      readClaimCompatibilitySource: vi.fn().mockResolvedValue(source),
    };
    const service = new PlatformDeliveryService(repository as never);
    const mutation = {
      subscriptionId: claim.subscriptionId,
      deliveryId: claim.deliveryId,
      owner: claim.leaseOwner,
      leaseToken: claim.leaseToken,
      expectedRowVersion: claim.rowVersion,
    };

    const projected = await service.projectClaimForMarketingCompensation(identity, mutation);

    expect(projected).toEqual(expect.objectContaining({
      eventType: "order.reverse.applied",
      eventMajorVersion: 0,
      triggerType: "order_cancellation",
      triggerId: "reverse-1",
      orderId: "order-1",
      customerId: null,
      refundAmount: null,
    }));
    await expect(service.revalidateMarketingCompensationProjectionClaim(
      identity,
      mutation,
      projected!,
      {} as never,
    )).resolves.toBeUndefined();
    expect(repository.readClaimCompatibilitySource).toHaveBeenLastCalledWith(
      identity,
      mutation,
      {},
      true,
    );
  });
});
