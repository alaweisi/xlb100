import { describe, expect, it, vi } from "vitest";
import type {
  CouponGrant,
  CouponReservation,
  MarketingDiscountDecision,
  PlatformServiceIdentity,
  RequestContext,
} from "@xlb/types";
import {
  MarketingAuthorizationError,
  MarketingService,
  MarketingValidationError,
} from "../../backend/src/marketing/marketingService.js";
import { MarketingRepository } from "../../backend/src/marketing/marketingRepository.js";

const customerContext: RequestContext = {
  traceId: "trace-runtime-hardening",
  requestStartedAt: "2026-07-14T02:03:00.000Z",
  appType: "customer",
  role: "customer",
  cityCode: "hangzhou",
  userId: "customer-1",
};

const identity: PlatformServiceIdentity = {
  identityKind: "platform_service",
  credentialKind: "internal_domain_contract",
  serviceId: "marketing-recovery",
  subscriberId: "marketing-dormant",
  cityCode: "hangzhou",
};

const reservation: CouponReservation = {
  couponReservationId: "reservation-1",
  couponGrantId: "grant-1",
  discountDecisionId: "decision-1",
  orderId: "order-1",
  cityCode: "hangzhou",
  customerId: "customer-1",
  status: "active",
  currency: "CNY",
  discountAmountMinor: 1_000,
  expiresAt: "2026-07-14T02:02:00.000Z",
  releasedReason: null,
  version: 1,
  createdAt: "2026-07-14T02:00:00.000Z",
  updatedAt: "2026-07-14T02:00:00.000Z",
};

const grant: CouponGrant = {
  couponGrantId: "grant-1",
  couponDefinitionId: "definition-1",
  marketingCampaignId: "campaign-1",
  ruleRevisionId: "rule-1",
  cityCode: "hangzhou",
  customerId: "customer-1",
  status: "reserved",
  issuanceReason: "admin_manual",
  issuanceRef: "manual-1",
  availableAt: "2026-07-14T01:00:00.000Z",
  expiresAt: "2026-07-15T00:00:00.000Z",
  version: 2,
  createdAt: "2026-07-14T01:00:00.000Z",
  updatedAt: "2026-07-14T02:00:00.000Z",
};

const decision: MarketingDiscountDecision = {
  discountDecisionId: "decision-1",
  cityCode: "hangzhou",
  customerId: "customer-1",
  skuId: "sku-1",
  quantity: 1,
  priceRuleId: "price-rule-1",
  priceRuleVersion: 1,
  ruleRevisionId: "rule-1",
  ruleContentHash: "b".repeat(64),
  couponDefinitionId: "definition-1",
  couponGrantId: "grant-1",
  currency: "CNY",
  grossAmountMinor: 10_000,
  discountAmountMinor: 1_000,
  netAmountMinor: 9_000,
  requestFingerprint: "a".repeat(64),
  status: "issued",
  expiresAt: "2026-07-14T02:05:00.000Z",
  acceptedOrderId: null,
  version: 1,
  createdAt: "2026-07-14T02:00:00.000Z",
  updatedAt: "2026-07-14T02:00:00.000Z",
};

function serviceFor(
  repository: Record<string, unknown>,
  runner?: (callback: (connection: object) => Promise<unknown>) => Promise<unknown>,
  outboxRepository: Record<string, unknown> = { insertEvent: vi.fn() },
) {
  return new MarketingService(
    repository as never,
    (runner ?? (async (callback) => callback({}))) as never,
    () => new Date("2026-07-14T02:03:00.000Z"),
    outboxRepository as never,
  );
}

describe("Phase29 dormant reservation recovery", () => {
  it("releases only stale evidence-free state with CAS and append-only audit for every transition", async () => {
    const releasedReservation = { ...reservation, status: "released" as const, releasedReason: "timeout", version: 2 };
    const availableGrant = { ...grant, status: "available" as const, version: 4 };
    const rejectedDecision = { ...decision, status: "rejected" as const, version: 2 };
    const outboxRepository = { insertEvent: vi.fn() };
    const repository = {
      findReservationForUpdate: vi.fn()
        .mockResolvedValueOnce(reservation)
        .mockResolvedValueOnce(releasedReservation),
      findGrantForUpdate: vi.fn()
        .mockResolvedValueOnce(grant)
        .mockResolvedValueOnce(availableGrant),
      findDecisionForUpdate: vi.fn()
        .mockResolvedValueOnce(decision)
        .mockResolvedValueOnce(rejectedDecision),
      findRedemptionByReservationForUpdate: vi.fn().mockResolvedValue(null),
      orderHasMarketingAcceptanceEvidenceForUpdate: vi.fn().mockResolvedValue(false),
      releaseExpiredReservation: vi.fn().mockResolvedValue(true),
      transitionGrantForExpiredReservation: vi.fn().mockResolvedValue(true),
      rejectDecisionForExpiredReservation: vi.fn().mockResolvedValue(true),
      insertAudit: vi.fn(),
    };

    await expect(serviceFor(repository, undefined, outboxRepository).recoverExpiredReservation(identity, {
      couponReservationId: "reservation-1",
      expectedReservationVersion: 1,
      reason: "timeout",
      traceId: "trace-recovery-1",
    })).resolves.toEqual({
      outcome: "released",
      couponReservation: releasedReservation,
      couponGrant: availableGrant,
      discountDecision: rejectedDecision,
    });
    expect(repository.transitionGrantForExpiredReservation).toHaveBeenNthCalledWith(
      1, expect.anything(), "hangzhou", "grant-1", 2, "reserved", "released",
    );
    expect(repository.transitionGrantForExpiredReservation).toHaveBeenNthCalledWith(
      2, expect.anything(), "hangzhou", "grant-1", 3, "released", "available",
    );
    expect(repository.insertAudit).toHaveBeenCalledTimes(4);
    expect(repository.insertAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "coupon_reservation_released", expectedVersion: 1, actualVersion: 2,
      reason: "timeout", traceId: "trace-recovery-1",
    }));
    expect(outboxRepository.insertEvent).toHaveBeenCalledTimes(1);
    expect(outboxRepository.insertEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "marketing.coupon.released",
      eventMajorVersion: 1,
      aggregateType: "coupon_reservation",
      aggregateId: "reservation-1",
      cityCode: "hangzhou",
      payload: {
        couponReservationId: "reservation-1",
        couponGrantId: "grant-1",
        discountDecisionId: "decision-1",
        orderId: "order-1",
        discountAmountMinor: 1_000,
        currency: "CNY",
        reasonCode: "reservation_timeout",
        occurredAt: "2026-07-14T02:03:00.000Z",
      },
    }));
  });

  it("fails closed when matching Order evidence exists and never infers success or releases state", async () => {
    const repository = {
      findReservationForUpdate: vi.fn().mockResolvedValue(reservation),
      findGrantForUpdate: vi.fn().mockResolvedValue(grant),
      findDecisionForUpdate: vi.fn().mockResolvedValue(decision),
      findRedemptionByReservationForUpdate: vi.fn().mockResolvedValue(null),
      orderHasMarketingAcceptanceEvidenceForUpdate: vi.fn().mockResolvedValue(true),
      releaseExpiredReservation: vi.fn(),
      transitionGrantForExpiredReservation: vi.fn(),
      rejectDecisionForExpiredReservation: vi.fn(),
      insertAudit: vi.fn(),
    };
    await expect(serviceFor(repository).recoverExpiredReservation(identity, {
      couponReservationId: "reservation-1",
      expectedReservationVersion: 1,
      reason: "timeout",
      traceId: "trace-recovery-2",
    })).resolves.toMatchObject({ outcome: "order_evidence_present" });
    expect(repository.releaseExpiredReservation).not.toHaveBeenCalled();
    expect(repository.insertAudit).not.toHaveBeenCalled();
  });
});

describe("Phase29 idempotency and customer query hardening", () => {
  it("uses database time to exclude grants at or beyond expiry only from the available view", async () => {
    const query = vi.fn().mockResolvedValue([[]]);
    const repository = new MarketingRepository({ query } as never);

    await expect(repository.listCustomerGrants(
      customerContext, "hangzhou", "customer-1", "available",
    )).resolves.toEqual([]);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/status=\? AND expires_at>CURRENT_TIMESTAMP\(3\)/),
      ["hangzhou", "customer-1", "available"],
    );

    await expect(repository.listCustomerGrants(
      customerContext, "hangzhou", "customer-1",
    )).resolves.toEqual([]);
    expect(query.mock.calls[1]?.[0]).not.toContain("expires_at>CURRENT_TIMESTAMP(3)");
  });

  it("returns the stable decision replay before current eligibility or Pricing reads", async () => {
    const repository = {
      findDecisionReplay: vi.fn().mockResolvedValue({ decision, requestFingerprint: decision.requestFingerprint }),
      loadDecisionEligibilityForUpdate: vi.fn(),
      findCanonicalPublicQuote: vi.fn(),
    };
    await expect(serviceFor(repository).issueDiscountDecision(customerContext, {
      skuId: "sku-1",
      quantity: 1,
      selectedCouponGrantId: "grant-1",
      idempotencyKey: "decision-key-0001",
    })).resolves.toEqual(decision);
    expect(repository.loadDecisionEligibilityForUpdate).not.toHaveBeenCalled();
    expect(repository.findCanonicalPublicQuote).not.toHaveBeenCalled();
  });

  it("validates customer grant status strictly and pushes it into the repository predicate", async () => {
    const repository = { listCustomerGrants: vi.fn().mockResolvedValue([grant]) };
    const service = serviceFor(repository);
    await expect(service.listCustomerGrants(customerContext, { status: "available" })).resolves.toEqual([grant]);
    expect(repository.listCustomerGrants).toHaveBeenCalledWith(
      customerContext, "hangzhou", "customer-1", "available",
    );
    await expect(service.listCustomerGrants(customerContext, { status: "available", extra: true }))
      .rejects.toBeInstanceOf(MarketingValidationError);
  });

  it("authorizes before validating a mutation body and retries bounded MySQL deadlocks", async () => {
    const repository = {
      findGrantReplay: vi.fn().mockResolvedValue({ grant, requestFingerprint: "same" }),
    };
    await expect(serviceFor(repository).grantCoupon({
      ...customerContext, appType: "admin", role: "auditor", userId: "auditor-1",
    }, {})).rejects.toBeInstanceOf(MarketingAuthorizationError);

    let attempt = 0;
    const runner = vi.fn(async (callback: (connection: object) => Promise<unknown>) => {
      attempt += 1;
      if (attempt === 1) throw Object.assign(new Error("deadlock"), { code: "ER_LOCK_DEADLOCK", errno: 1213 });
      return callback({});
    });
    const replayFingerprint = "e".repeat(64);
    repository.findGrantReplay.mockResolvedValue({ grant, requestFingerprint: replayFingerprint });
    const adminContext: RequestContext = {
      ...customerContext, appType: "admin", role: "admin", userId: "admin-1",
    };
    const request = {
      couponDefinitionId: "definition-1", customerId: "customer-1",
      issuanceReason: "admin_manual" as const, issuanceRef: "manual-1",
      expiresAt: "2026-07-15T00:00:00.000Z", reason: "approved",
      idempotencyKey: "grant-key-0001",
    };
    // Let the replay fingerprint match the normalized production request.
    repository.findGrantReplay.mockImplementation(async () => ({
      grant,
      requestFingerprint: (await import("../../backend/src/marketing/marketingPolicy.js")).marketingHash({
        cityCode: "hangzhou", actorId: "admin-1", ...request, idempotencyKey: undefined,
      }),
    }));
    await expect(serviceFor(repository, runner).grantCoupon(adminContext, request)).resolves.toEqual(grant);
    expect(runner).toHaveBeenCalledTimes(2);
  });
});
