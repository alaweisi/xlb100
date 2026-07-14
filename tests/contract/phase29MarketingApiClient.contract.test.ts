import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../../packages/api-client/src/createApiClient.js";
import {
  createAdminMarketingApi,
  createCustomerMarketingApi,
  validateCouponGrantListResponse,
  validateMarketingDiscountDecisionResponse,
  validateMarketingRuleRevisionResponse,
} from "../../packages/api-client/src/marketing.js";
import { issueMarketingDiscountDecisionRequestSchema } from "../../packages/validators/src/marketingSchema.js";

const now = "2026-07-14T02:00:00.000Z";
const later = "2026-07-14T02:10:00.000Z";

const grant = {
  couponGrantId: "grant-1", couponDefinitionId: "definition-1", marketingCampaignId: "campaign-1",
  ruleRevisionId: "revision-1", cityCode: "hangzhou", customerId: "customer-1", status: "available",
  issuanceReason: "admin_manual", issuanceRef: "approval-1", availableAt: now, expiresAt: later,
  version: 1, createdAt: now, updatedAt: now,
};

const decision = {
  discountDecisionId: "decision-1", cityCode: "hangzhou", customerId: "customer-1", skuId: "sku-1",
  quantity: 1, priceRuleId: "price-rule-1", priceRuleVersion: 1, ruleRevisionId: "revision-1", ruleContentHash: "b".repeat(64),
  couponDefinitionId: "definition-1", couponGrantId: "grant-1", currency: "CNY", grossAmountMinor: 10_000,
  discountAmountMinor: 1_000, netAmountMinor: 9_000, requestFingerprint: "a".repeat(64), status: "issued",
  expiresAt: later, acceptedOrderId: null, version: 1, createdAt: now, updatedAt: now,
};

function clientReturning(value: unknown) {
  const get = vi.fn(async <T>(_path: string, options?: { validate?: (input: unknown) => T }) =>
    options?.validate ? options.validate(value) : value as T);
  const post = vi.fn(async <T>(_path: string, _body?: unknown, options?: { validate?: (input: unknown) => T }) =>
    options?.validate ? options.validate(value) : value as T);
  return { get, post, patch: vi.fn(), delete: vi.fn(), postBinary: vi.fn() } as unknown as ApiClient & {
    get: typeof get; post: typeof post;
  };
}

function recordingClient() {
  const get = vi.fn(async <T>() => ({ ok: true } as T));
  const post = vi.fn(async <T>() => ({ ok: true } as T));
  return { get, post, patch: vi.fn(), delete: vi.fn(), postBinary: vi.fn() } as unknown as ApiClient & {
    get: typeof get; post: typeof post;
  };
}

describe("Phase29 Marketing API client contract", () => {
  it("accepts exact Customer grant and decision responses", () => {
    expect(validateCouponGrantListResponse({ ok: true, couponGrants: [grant] }).couponGrants).toHaveLength(1);
    expect(validateMarketingDiscountDecisionResponse({ ok: true, discountDecision: decision }).discountDecision.netAmountMinor).toBe(9_000);
  });

  it("rejects response expansion and inconsistent server money", () => {
    expect(() => validateCouponGrantListResponse({ ok: true, couponGrants: [grant], phone: "13800000000" }))
      .toThrow(/unexpected response shape/);
    expect(() => validateMarketingDiscountDecisionResponse({
      ok: true,
      discountDecision: { ...decision, netAmountMinor: 9_001 },
    })).toThrow(/money invariant/);
    expect(() => validateMarketingDiscountDecisionResponse({
      ok: true,
      discountDecision: { ...decision, ruleContentHash: "not-a-hash" },
    })).toThrow(/rule content hash/);
  });

  it("uses scoped Customer endpoints and idempotent POST semantics", async () => {
    const listClient = clientReturning({ ok: true, couponGrants: [grant] });
    await createCustomerMarketingApi(listClient).listCouponGrants({ status: "available" });
    expect(listClient.get).toHaveBeenCalledWith(
      "/api/customer/marketing/coupon-grants?status=available",
      expect.objectContaining({ validate: expect.any(Function) }),
    );

    const decisionClient = clientReturning({ ok: true, discountDecision: decision });
    await createCustomerMarketingApi(decisionClient).issueDiscountDecision({
      skuId: "sku-1", quantity: 1, selectedCouponGrantId: "grant-1", idempotencyKey: "decision-command-1",
    });
    expect(decisionClient.post).toHaveBeenCalledWith(
      "/api/customer/marketing/discount-decisions",
      {
        skuId: "sku-1",
        quantity: 1,
        selectedCouponGrantId: "grant-1",
        idempotencyKey: "decision-command-1",
      },
      expect.objectContaining({ retry: "idempotent", validate: expect.any(Function) }),
    );
  });

  it("rejects client-authored Pricing identity, gross amount and currency in decision requests", () => {
    const authoritativeRequest = {
      skuId: "sku-1", quantity: 1, selectedCouponGrantId: "grant-1", idempotencyKey: "decision-command-1",
    };
    expect(issueMarketingDiscountDecisionRequestSchema.safeParse(authoritativeRequest).success).toBe(true);
    expect(issueMarketingDiscountDecisionRequestSchema.safeParse({
      ...authoritativeRequest,
      priceRuleId: "client-rule",
      priceRuleVersion: 99,
      grossAmountMinor: 1,
      currency: "CNY",
    }).success).toBe(false);
  });

  it("uses explicit Admin campaign command routes without amount fields or automatic CAS retry", async () => {
    const campaign = {
      marketingCampaignId: "campaign-1", cityCode: "hangzhou", name: "Campaign One", status: "draft",
      activeRuleRevisionId: null, startAt: now, endAt: later, reviewedBy: null, reviewedAt: null,
      version: 1, createdAt: now, updatedAt: now,
    };
    const client = clientReturning({ ok: true, campaign });
    await createAdminMarketingApi(client).reviewCampaign("campaign-1", { expectedVersion: 1, reason: "independent review" });
    expect(client.post).toHaveBeenCalledWith(
      "/api/admin/marketing/campaigns/campaign-1/review",
      { expectedVersion: 1, reason: "independent review" },
      expect.objectContaining({ retry: "none" }),
    );
  });

  it("does not automatically retry Admin CAS-only POST commands", async () => {
    const client = recordingClient();
    const api = createAdminMarketingApi(client);

    await api.reviewCampaign("campaign-1", { expectedVersion: 1, reason: "reviewed" });
    await api.scheduleCampaign("campaign-1", { ruleRevisionId: "revision-1", expectedVersion: 2, reason: "scheduled" });
    await api.changeCampaignStatus("campaign-1", { status: "paused", expectedVersion: 3, reason: "paused" });
    await api.reviewRuleRevision("revision-1", { expectedVersion: 1, reason: "reviewed" });
    await api.publishRuleRevision("revision-1", { expectedVersion: 2, reason: "published" });
    await api.changeCouponDefinitionStatus("definition-1", { status: "suspended", expectedVersion: 1, reason: "suspended" });
    await api.revokeCouponGrant("grant-1", { expectedVersion: 1, reason: "revoked" });

    expect(client.post.mock.calls.map(([path, , options]) => [path, options])).toEqual([
      ["/api/admin/marketing/campaigns/campaign-1/review", { retry: "none", validate: expect.any(Function) }],
      ["/api/admin/marketing/campaigns/campaign-1/schedule", { retry: "none", validate: expect.any(Function) }],
      ["/api/admin/marketing/campaigns/campaign-1/status", { retry: "none", validate: expect.any(Function) }],
      ["/api/admin/marketing/rule-revisions/revision-1/review", { retry: "none", validate: expect.any(Function) }],
      ["/api/admin/marketing/rule-revisions/revision-1/publish", { retry: "none", validate: expect.any(Function) }],
      ["/api/admin/marketing/coupon-definitions/definition-1/status", { retry: "none", validate: expect.any(Function) }],
      ["/api/admin/marketing/coupon-grants/grant-1/revoke", { retry: "none", validate: expect.any(Function) }],
    ]);
  });

  it("keeps automatic retry only for Admin POST commands with explicit idempotency keys", async () => {
    const client = recordingClient();
    const api = createAdminMarketingApi(client);

    await api.createCampaign({ name: "Campaign One", startAt: now, endAt: later, idempotencyKey: "campaign-command-1" });
    await api.createRuleRevision("campaign-1", { allowedSkuIds: ["sku-1"], idempotencyKey: "rule-command-1" });
    await api.createCouponDefinition({
      marketingCampaignId: "campaign-1", ruleRevisionId: "revision-1", name: "Coupon One",
      allowedSkuIds: ["sku-1"], currency: "CNY", faceValueMinor: 1_000, minSpendMinor: 2_000,
      issuanceCap: 100, compensationCap: 10, validFrom: now, validUntil: later,
      idempotencyKey: "definition-command-1",
    });
    await api.grantCoupon({
      couponDefinitionId: "definition-1", customerId: "customer-1", issuanceReason: "admin_manual",
      issuanceRef: "approval-1", expiresAt: later, reason: "approved", idempotencyKey: "grant-command-1",
    });

    expect(client.post.mock.calls.map(([path, , options]) => [path, options])).toEqual([
      ["/api/admin/marketing/campaigns", { retry: "idempotent", validate: expect.any(Function) }],
      ["/api/admin/marketing/campaigns/campaign-1/rule-revisions", { retry: "idempotent", validate: expect.any(Function) }],
      ["/api/admin/marketing/coupon-definitions", { retry: "idempotent", validate: expect.any(Function) }],
      ["/api/admin/marketing/coupon-grants", { retry: "idempotent", validate: expect.any(Function) }],
    ]);
  });

  it("exposes the four-eyes rule-revision create, review and publish routes", async () => {
    const ruleRevision = {
      ruleRevisionId: "revision-1", marketingCampaignId: "campaign-1", cityCode: "hangzhou",
      revision: 1, status: "draft", allowedSkuIds: ["sku-1"], createdBy: "operator-1",
      reviewedBy: null, reviewedAt: null, publishedBy: null, publishedAt: null,
      version: 1, createdAt: now,
    };
    expect(validateMarketingRuleRevisionResponse({ ok: true, ruleRevision }).ruleRevision.createdBy).toBe("operator-1");
    const client = clientReturning({ ok: true, ruleRevision });
    const api = createAdminMarketingApi(client);
    await api.createRuleRevision("campaign-1", { allowedSkuIds: ["sku-1"], idempotencyKey: "rule-command-1" });
    await api.reviewRuleRevision("revision-1", { expectedVersion: 1, reason: "independent review" });
    await api.publishRuleRevision("revision-1", { expectedVersion: 1, reason: "approved publication" });
    expect(client.post.mock.calls.map((call) => call[0])).toEqual([
      "/api/admin/marketing/campaigns/campaign-1/rule-revisions",
      "/api/admin/marketing/rule-revisions/revision-1/review",
      "/api/admin/marketing/rule-revisions/revision-1/publish",
    ]);
  });
});
