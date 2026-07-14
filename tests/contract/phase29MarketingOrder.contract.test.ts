import { describe, expect, it } from "vitest";
import {
  acceptMarketingDiscountDecisionRequestSchema,
  createOrderSchema,
  issueMarketingDiscountDecisionRequestSchema,
  marketingDiscountDecisionSchema,
  marketingRuleRevisionSchema,
} from "@xlb/validators";

const orderCommand = {
  skuId: "sku-1",
  quantity: 2,
  addressProvince: "浙江省",
  addressCity: "杭州市",
  addressDistrict: "西湖区",
  detailAddress: "文一路 1 号",
  contactName: "测试用户",
  contactPhone: "13800000000",
  scheduledAt: "2026-07-15T02:00:00.000Z",
  scheduledTimeSlot: "morning",
};

const issuedDecision = {
  discountDecisionId: "decision-1",
  cityCode: "hangzhou",
  customerId: "customer-1",
  skuId: "sku-1",
  quantity: 2,
  priceRuleId: "price-rule-1",
  priceRuleVersion: 3,
  ruleRevisionId: "rule-revision-1",
  ruleContentHash: "b".repeat(64),
  couponDefinitionId: "definition-1",
  couponGrantId: "grant-1",
  currency: "CNY",
  grossAmountMinor: 20_000,
  discountAmountMinor: 2_000,
  netAmountMinor: 18_000,
  requestFingerprint: "a".repeat(64),
  status: "issued",
  expiresAt: "2026-07-14T02:05:00.000Z",
  acceptedOrderId: null,
  version: 1,
  createdAt: "2026-07-14T02:00:00.000Z",
  updatedAt: "2026-07-14T02:00:00.000Z",
};

describe("Phase29 server-side pricing and Order command contract", () => {
  it("accepts only SKU/quantity/grant/idempotency as a Customer decision command", () => {
    const command = {
      skuId: "sku-1",
      quantity: 2,
      selectedCouponGrantId: "grant-1",
      idempotencyKey: "decision-command-0001",
    };
    expect(issueMarketingDiscountDecisionRequestSchema.safeParse(command).success).toBe(true);

    for (const forged of [
      { grossAmountMinor: 1 },
      { discountAmountMinor: 19_999 },
      { netAmountMinor: 1 },
      { priceRuleId: "client-rule" },
      { priceRuleVersion: 99 },
      { currency: "CNY" },
    ]) {
      expect(issueMarketingDiscountDecisionRequestSchema.safeParse({ ...command, ...forged }).success).toBe(false);
    }
  });

  it("strictly rejects all client-authored Order pricing and decision-evidence fields", () => {
    for (const forged of [
      { grossAmountMinor: 20_000 },
      { discountAmountMinor: 2_000 },
      { netAmountMinor: 18_000 },
      { priceRuleId: "client-rule" },
      { priceRuleVersion: 99 },
      { currency: "CNY" },
      { requestFingerprint: "a".repeat(64) },
      { unitAmount: 10_000 },
      { totalAmount: 20_000 },
      { unexpectedClientField: "must-not-be-stripped" },
    ]) {
      expect(createOrderSchema.safeParse({ ...orderCommand, ...forged }).success).toBe(false);
    }
  });

  it("requires decision, expected revision and Order idempotency key as one atomic tuple", () => {
    const decisionTuple = {
      discountDecisionId: "decision-1",
      discountDecisionRevision: 1,
      orderIdempotencyKey: "order-command-0001",
    };
    expect(createOrderSchema.safeParse({ ...orderCommand, ...decisionTuple }).success).toBe(true);
    expect(createOrderSchema.safeParse(orderCommand).success).toBe(true);
    expect(createOrderSchema.safeParse({ ...orderCommand, discountDecisionId: "decision-1" }).success).toBe(false);
    expect(createOrderSchema.safeParse({
      ...orderCommand,
      discountDecisionId: "decision-1",
      discountDecisionRevision: 1,
    }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...orderCommand, orderIdempotencyKey: "order-command-0001" }).success).toBe(false);
  });

  it("keeps the internal acceptance command server-derived and rejects client fingerprint or money", () => {
    const internalCommand = {
      discountDecisionId: "decision-1",
      expectedDecisionVersion: 1,
      orderId: "order-1",
      orderCommandKey: "order-command-0001",
      skuId: "sku-1",
      quantity: 2,
    };
    expect(acceptMarketingDiscountDecisionRequestSchema.safeParse(internalCommand).success).toBe(true);
    for (const forged of [
      { requestFingerprint: "a".repeat(64) },
      { priceRuleId: "client-rule" },
      { priceRuleVersion: 99 },
      { grossAmountMinor: 1 },
      { discountAmountMinor: 1 },
      { netAmountMinor: 1 },
      { currency: "CNY" },
    ]) {
      expect(acceptMarketingDiscountDecisionRequestSchema.safeParse({ ...internalCommand, ...forged }).success).toBe(false);
    }
  });

  it("enforces immutable decision money and accepted-order evidence", () => {
    expect(marketingDiscountDecisionSchema.safeParse(issuedDecision).success).toBe(true);
    expect(marketingDiscountDecisionSchema.safeParse({ ...issuedDecision, netAmountMinor: 18_001 }).success).toBe(false);
    expect(marketingDiscountDecisionSchema.safeParse({ ...issuedDecision, discountAmountMinor: 20_000 }).success).toBe(false);
    expect(marketingDiscountDecisionSchema.safeParse({ ...issuedDecision, acceptedOrderId: "order-1" }).success).toBe(false);
    expect(marketingDiscountDecisionSchema.safeParse({
      ...issuedDecision,
      status: "accepted",
      acceptedOrderId: "order-1",
    }).success).toBe(true);
  });
});

describe("Phase29 rule-revision evidence contract", () => {
  const draft = {
    ruleRevisionId: "rule-revision-1",
    marketingCampaignId: "campaign-1",
    cityCode: "hangzhou",
    revision: 1,
    status: "draft",
    allowedSkuIds: ["sku-1"],
    createdBy: "admin-creator",
    reviewedBy: null,
    reviewedAt: null,
    publishedBy: null,
    publishedAt: null,
    version: 1,
    createdAt: "2026-07-14T02:00:00.000Z",
  };

  it("requires independent review and publication evidence", () => {
    expect(marketingRuleRevisionSchema.safeParse(draft).success).toBe(true);
    expect(marketingRuleRevisionSchema.safeParse({
      ...draft,
      status: "reviewed",
      reviewedBy: "admin-creator",
      reviewedAt: "2026-07-14T02:01:00.000Z",
    }).success).toBe(false);
    expect(marketingRuleRevisionSchema.safeParse({
      ...draft,
      status: "published",
      reviewedBy: "admin-reviewer",
      reviewedAt: "2026-07-14T02:01:00.000Z",
      publishedBy: "admin-reviewer",
      publishedAt: "2026-07-14T02:02:00.000Z",
    }).success).toBe(false);
    expect(marketingRuleRevisionSchema.safeParse({
      ...draft,
      status: "published",
      reviewedBy: "admin-reviewer",
      reviewedAt: "2026-07-14T02:01:00.000Z",
      publishedBy: "admin-creator",
      publishedAt: "2026-07-14T02:02:00.000Z",
    }).success).toBe(true);
  });
});
