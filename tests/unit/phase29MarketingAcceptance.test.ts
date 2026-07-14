import { describe, expect, it, vi } from "vitest";
import type {
  CouponDefinition,
  CouponGrant,
  CouponRedemption,
  CouponReservation,
  MarketingCampaign,
  MarketingDiscountDecision,
  MarketingRuleRevision,
  RequestContext,
} from "@xlb/types";
import {
  MarketingConflictError,
  MarketingService,
} from "../../backend/src/marketing/marketingService.js";
import { marketingHash } from "../../backend/src/marketing/marketingPolicy.js";

const now = "2026-07-14T02:00:00.000Z";
const context: RequestContext = {
  traceId: "trace-marketing-acceptance",
  requestStartedAt: now,
  appType: "customer",
  role: "customer",
  cityCode: "hangzhou",
  userId: "customer-1",
};

const campaign: MarketingCampaign = {
  marketingCampaignId: "campaign-1",
  cityCode: "hangzhou",
  name: "Campaign",
  status: "active",
  activeRuleRevisionId: "rule-revision-1",
  startAt: "2026-07-14T00:00:00.000Z",
  endAt: "2026-07-15T00:00:00.000Z",
  reviewedBy: "admin-reviewer",
  reviewedAt: "2026-07-13T23:00:00.000Z",
  version: 4,
  createdAt: "2026-07-13T22:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
};

const ruleRevision: MarketingRuleRevision = {
  ruleRevisionId: "rule-revision-1",
  marketingCampaignId: "campaign-1",
  cityCode: "hangzhou",
  revision: 1,
  status: "published",
  allowedSkuIds: ["sku-1"],
  createdBy: "admin-creator",
  reviewedBy: "admin-reviewer",
  reviewedAt: "2026-07-13T23:00:00.000Z",
  publishedBy: "admin-creator",
  publishedAt: "2026-07-13T23:30:00.000Z",
  version: 3,
  createdAt: "2026-07-13T22:00:00.000Z",
};

const definition: CouponDefinition = {
  couponDefinitionId: "definition-1",
  marketingCampaignId: "campaign-1",
  ruleRevisionId: "rule-revision-1",
  cityCode: "hangzhou",
  name: "10 元券",
  status: "active",
  currency: "CNY",
  faceValueMinor: 1_000,
  minSpendMinor: 5_000,
  issuanceCap: 100,
  issuedCount: 1,
  compensationCap: 20,
  compensationIssuedCount: 0,
  validFrom: "2026-07-14T00:00:00.000Z",
  validUntil: "2026-07-15T00:00:00.000Z",
  version: 2,
  createdAt: "2026-07-13T22:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
};

const grant: CouponGrant = {
  couponGrantId: "grant-1",
  couponDefinitionId: "definition-1",
  marketingCampaignId: "campaign-1",
  ruleRevisionId: "rule-revision-1",
  cityCode: "hangzhou",
  customerId: "customer-1",
  status: "available",
  issuanceReason: "admin_manual",
  issuanceRef: "approval-1",
  availableAt: "2026-07-14T00:00:00.000Z",
  expiresAt: "2026-07-15T00:00:00.000Z",
  version: 1,
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
};

const ruleContentHash = "b".repeat(64);
const requestFingerprint = marketingHash({
  cityCode: "hangzhou",
  customerId: "customer-1",
  skuId: "sku-1",
  quantity: 2,
  priceRuleId: "price-rule-1",
  priceRuleVersion: 3,
  grossAmountMinor: 20_000,
  currency: "CNY",
  couponGrantId: "grant-1",
  couponDefinitionId: "definition-1",
  ruleRevisionId: "rule-revision-1",
  ruleContentHash,
});

const issuedDecision: MarketingDiscountDecision = {
  discountDecisionId: "decision-1",
  cityCode: "hangzhou",
  customerId: "customer-1",
  skuId: "sku-1",
  quantity: 2,
  priceRuleId: "price-rule-1",
  priceRuleVersion: 3,
  ruleRevisionId: "rule-revision-1",
  ruleContentHash,
  couponDefinitionId: "definition-1",
  couponGrantId: "grant-1",
  currency: "CNY",
  grossAmountMinor: 20_000,
  discountAmountMinor: 1_000,
  netAmountMinor: 19_000,
  requestFingerprint,
  status: "issued",
  expiresAt: "2026-07-14T02:05:00.000Z",
  acceptedOrderId: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
};

const reservation: CouponReservation = {
  couponReservationId: "reservation-1",
  couponGrantId: "grant-1",
  discountDecisionId: "decision-1",
  orderId: "order-1",
  cityCode: "hangzhou",
  customerId: "customer-1",
  status: "redeemed",
  currency: "CNY",
  discountAmountMinor: 1_000,
  expiresAt: "2026-07-14T02:02:00.000Z",
  releasedReason: null,
  version: 2,
  createdAt: now,
  updatedAt: now,
};

const redemption: CouponRedemption = {
  couponRedemptionId: "redemption-1",
  couponReservationId: "reservation-1",
  couponGrantId: "grant-1",
  discountDecisionId: "decision-1",
  orderId: "order-1",
  cityCode: "hangzhou",
  customerId: "customer-1",
  currency: "CNY",
  discountAmountMinor: 1_000,
  redeemedAt: "2026-07-14T02:00:30.000Z",
};

const acceptedDecision: MarketingDiscountDecision = {
  ...issuedDecision,
  status: "accepted",
  acceptedOrderId: "order-1",
  version: 2,
  updatedAt: redemption.redeemedAt,
};

const eligibility = { campaign, ruleRevision, definition, grant, ruleContentHash };
const input = {
  discountDecisionId: "decision-1",
  expectedDecisionVersion: 1,
  orderId: "order-1",
  orderCommandKey: "order-command-0001",
  skuId: "sku-1",
  quantity: 2,
};

function serviceFor(repository: Record<string, unknown>) {
  return new MarketingService(
    repository as never,
    (async <T>(callback: (connection: object) => Promise<T>) => callback({})) as never,
    () => new Date(now),
    { insertEvent: vi.fn() } as never,
  );
}

describe("Phase29 Marketing Order acceptance guard", () => {
  it("re-reads canonical Pricing and prepares immutable evidence without mutating", async () => {
    const repository = {
      findDecisionForUpdate: vi.fn().mockResolvedValue(issuedDecision),
      loadDecisionEligibilityForUpdate: vi.fn().mockResolvedValue(eligibility),
      findCanonicalPublicQuote: vi.fn().mockResolvedValue({
        priceRuleId: "price-rule-1", version: 3, currency: "CNY", unitAmountDecimal: "100.00",
        canonicalQuote: {
          rule: { priceRuleId: "price-rule-1" },
          breakdown: { totalAmount: 100 },
          unitAmountMinor: 10_000,
          unitAmountDecimal: "100.00",
          feeItems: [],
        },
      }),
      reserveGrant: vi.fn(),
      insertReservation: vi.fn(),
      redeemAcceptance: vi.fn(),
    };
    const connection = { id: "same-order-transaction" };
    const prepared = await serviceFor(repository).prepareDecisionForOrder(connection as never, context, input);

    expect(repository.findCanonicalPublicQuote).toHaveBeenCalledWith(connection, {
      cityCode: "hangzhou",
      skuId: "sku-1",
    });
    expect(prepared).toMatchObject({
      decision: issuedDecision,
      grantVersion: 1,
      idempotent: false,
      request: input,
      canonicalQuote: {
        rule: { priceRuleId: "price-rule-1" },
        breakdown: { totalAmount: 100 },
      },
    });
    expect(prepared.couponReservationId).toMatch(/^cres_/);
    expect(prepared.couponRedemptionId).toMatch(/^cred_/);
    expect(repository.reserveGrant).not.toHaveBeenCalled();
    expect(repository.insertReservation).not.toHaveBeenCalled();
    expect(repository.redeemAcceptance).not.toHaveBeenCalled();
  });

  it.each([
    [{ version: 4 }, "Pricing evidence"],
    [{ unitAmountDecimal: "100.01" }, "Pricing evidence"],
    [{ currency: "USD" }, "unavailable"],
  ])("fails closed when canonical quote drifts: %o", async (quoteOverride, expectedMessage) => {
    const repository = {
      findDecisionForUpdate: vi.fn().mockResolvedValue(issuedDecision),
      loadDecisionEligibilityForUpdate: vi.fn().mockResolvedValue(eligibility),
      findCanonicalPublicQuote: vi.fn().mockResolvedValue({
        priceRuleId: "price-rule-1", version: 3, currency: "CNY", unitAmountDecimal: "100.00",
        ...quoteOverride,
      }),
      reserveGrant: vi.fn(),
      insertReservation: vi.fn(),
    };
    await expect(serviceFor(repository).prepareDecisionForOrder({} as never, context, input))
      .rejects.toThrow(expectedMessage);
    expect(repository.reserveGrant).not.toHaveBeenCalled();
    expect(repository.insertReservation).not.toHaveBeenCalled();
  });

  it("CAS-reserves and redeems on the caller's connection, then returns canonical evidence", async () => {
    const repository = {
      reserveGrant: vi.fn().mockResolvedValue(true),
      insertReservation: vi.fn(),
      redeemAcceptance: vi.fn().mockResolvedValue(true),
      insertAudit: vi.fn(),
      findDecisionForUpdate: vi.fn().mockResolvedValue(acceptedDecision),
      findReservationByDecision: vi.fn().mockResolvedValue(reservation),
      findRedemptionByDecision: vi.fn().mockResolvedValue(redemption),
    };
    const connection = { id: "order-transaction" };
    const prepared = {
      request: input,
      decision: issuedDecision,
      couponReservationId: "reservation-1",
      couponRedemptionId: "redemption-1",
      grantVersion: 1,
      reservationExpiresAt: reservation.expiresAt,
      idempotent: false,
      existingReservation: null,
      existingRedemption: null,
      canonicalQuote: null,
    };
    const result = await serviceFor(repository).commitPreparedDecisionAcceptance(
      connection as never,
      context,
      prepared,
    );

    expect(repository.reserveGrant).toHaveBeenCalledWith(connection, "hangzhou", "grant-1", 1);
    expect(repository.insertReservation).toHaveBeenCalledWith(connection, expect.objectContaining({
      id: "reservation-1",
      orderId: "order-1",
      decision: issuedDecision,
    }));
    expect(repository.redeemAcceptance).toHaveBeenCalledWith(connection, expect.objectContaining({
      reservationId: "reservation-1",
      redemptionId: "redemption-1",
      orderId: "order-1",
      grantVersionAfterReserve: 2,
      orderCommandKeyHash: marketingHash("order-command-0001"),
    }));
    expect(repository.insertAudit).toHaveBeenCalledWith(connection, expect.objectContaining({
      action: "discount_decision_accepted",
      expectedVersion: 1,
      actualVersion: 2,
    }));
    expect(result).toEqual({ decision: acceptedDecision, reservation, redemption, idempotent: false });
  });

  it("stops before reservation facts when the grant CAS loses", async () => {
    const repository = {
      reserveGrant: vi.fn().mockResolvedValue(false),
      insertReservation: vi.fn(),
      redeemAcceptance: vi.fn(),
      insertAudit: vi.fn(),
    };
    await expect(serviceFor(repository).commitPreparedDecisionAcceptance({} as never, context, {
      request: input,
      decision: issuedDecision,
      couponReservationId: "reservation-1",
      couponRedemptionId: "redemption-1",
      grantVersion: 1,
      reservationExpiresAt: reservation.expiresAt,
      idempotent: false,
      existingReservation: null,
      existingRedemption: null,
    })).rejects.toBeInstanceOf(MarketingConflictError);
    expect(repository.insertReservation).not.toHaveBeenCalled();
    expect(repository.redeemAcceptance).not.toHaveBeenCalled();
    expect(repository.insertAudit).not.toHaveBeenCalled();
  });

  it("returns same-key canonical replay and conflicts on a changed request", async () => {
    const repository = {
      findAcceptedDecisionByOrderCommand: vi.fn().mockResolvedValue(acceptedDecision),
      findReservationByDecision: vi.fn().mockResolvedValue(reservation),
      findRedemptionByDecision: vi.fn().mockResolvedValue(redemption),
    };
    const service = serviceFor(repository);
    await expect(service.findAcceptedOrderReplay({} as never, context, input)).resolves.toEqual({
      acceptedOrderId: "order-1",
      decision: acceptedDecision,
      reservation,
      redemption,
    });
    expect(repository.findAcceptedDecisionByOrderCommand).toHaveBeenCalledWith(
      expect.anything(),
      "hangzhou",
      "customer-1",
      marketingHash("order-command-0001"),
    );

    await expect(service.findAcceptedOrderReplay({} as never, context, { ...input, quantity: 3 }))
      .rejects.toBeInstanceOf(MarketingConflictError);
    await expect(service.findAcceptedOrderReplay({} as never, context, {
      ...input,
      expectedDecisionVersion: 2,
    })).rejects.toBeInstanceOf(MarketingConflictError);
  });
});
