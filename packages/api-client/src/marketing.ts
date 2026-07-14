import type {
  ChangeCouponDefinitionStatusRequest,
  ChangeMarketingCampaignStatusRequest,
  CouponDefinitionListResponse,
  CouponDefinitionResponse,
  CouponGrantListResponse,
  CouponGrantResponse,
  CreateCouponDefinitionRequest,
  CreateMarketingCampaignRequest,
  CreateMarketingRuleRevisionRequest,
  GrantCouponRequest,
  IssueMarketingDiscountDecisionRequest,
  MarketingCampaignListResponse,
  MarketingCampaignResponse,
  MarketingDiscountDecisionResponse,
  MarketingRuleRevisionListResponse,
  MarketingRuleRevisionResponse,
  PublishMarketingRuleRevisionRequest,
  ReviewMarketingCampaignRequest,
  RevokeCouponGrantRequest,
  ReviewMarketingRuleRevisionRequest,
  ScheduleMarketingCampaignRequest,
} from "@xlb/types";
import type { ApiClient } from "./createApiClient.js";

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as JsonObject;
}

function exact(value: JsonObject, label: string, keys: readonly string[]): void {
  const allowed = new Set(keys);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !allowed.has(key))) {
    throw new TypeError(`${label} has an unexpected response shape`);
  }
}

function string(value: unknown, label: string, nullable = false): void {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.length === 0 || value.length > 1_000) throw new TypeError(`${label} must be a bounded string`);
}

function integer(value: unknown, label: string, minimum = 0): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) throw new TypeError(`${label} must be a safe integer`);
}

function timestamp(value: unknown, label: string, nullable = false): void {
  if (nullable && value === null) return;
  string(value, label);
  if (Number.isNaN(Date.parse(String(value))) || !String(value).endsWith("Z")) throw new TypeError(`${label} must be a UTC timestamp`);
}

function oneOf(value: unknown, label: string, choices: readonly string[]): void {
  if (typeof value !== "string" || !choices.includes(value)) throw new TypeError(`${label} is unsupported`);
}

function campaign(value: unknown): void {
  const item = object(value, "marketing campaign");
  exact(item, "marketing campaign", ["marketingCampaignId", "cityCode", "name", "status", "activeRuleRevisionId", "startAt", "endAt", "reviewedBy", "reviewedAt", "version", "createdAt", "updatedAt"]);
  ["marketingCampaignId", "cityCode", "name"].forEach((key) => string(item[key], `campaign.${key}`));
  oneOf(item.status, "campaign.status", ["draft", "reviewed", "scheduled", "active", "paused", "ended", "revoked"]);
  string(item.activeRuleRevisionId, "campaign.activeRuleRevisionId", true);
  string(item.reviewedBy, "campaign.reviewedBy", true);
  ["startAt", "endAt", "createdAt", "updatedAt"].forEach((key) => timestamp(item[key], `campaign.${key}`));
  timestamp(item.reviewedAt, "campaign.reviewedAt", true);
  integer(item.version, "campaign.version", 1);
}

function ruleRevision(value: unknown): void {
  const item = object(value, "marketing rule revision");
  exact(item, "marketing rule revision", ["ruleRevisionId", "marketingCampaignId", "cityCode", "revision", "status", "allowedSkuIds", "createdBy", "reviewedBy", "reviewedAt", "publishedBy", "publishedAt", "version", "createdAt"]);
  ["ruleRevisionId", "marketingCampaignId", "cityCode"].forEach((key) => string(item[key], `ruleRevision.${key}`));
  integer(item.revision, "ruleRevision.revision", 1);
  oneOf(item.status, "ruleRevision.status", ["draft", "reviewed", "published", "retired"]);
  if (!Array.isArray(item.allowedSkuIds) || item.allowedSkuIds.length < 1 || item.allowedSkuIds.length > 500) throw new TypeError("ruleRevision.allowedSkuIds must be a bounded array");
  item.allowedSkuIds.forEach((skuId) => string(skuId, "ruleRevision.allowedSkuId"));
  string(item.createdBy, "ruleRevision.createdBy");
  string(item.reviewedBy, "ruleRevision.reviewedBy", true);
  timestamp(item.reviewedAt, "ruleRevision.reviewedAt", true);
  string(item.publishedBy, "ruleRevision.publishedBy", true);
  timestamp(item.publishedAt, "ruleRevision.publishedAt", true);
  integer(item.version, "ruleRevision.version", 1);
  timestamp(item.createdAt, "ruleRevision.createdAt");
  if ((item.reviewedBy === null) !== (item.reviewedAt === null) || (item.publishedBy === null) !== (item.publishedAt === null)) {
    throw new TypeError("rule revision actor and timestamp evidence must be paired");
  }
  if (item.reviewedBy !== null && (item.reviewedBy === item.createdBy || item.reviewedBy === item.publishedBy)) {
    throw new TypeError("rule revision violates four-eyes separation");
  }
  if (item.status === "draft" && (item.reviewedBy !== null || item.publishedBy !== null)) throw new TypeError("draft rule revision contains review evidence");
  if (item.status === "reviewed" && (item.reviewedBy === null || item.publishedBy !== null)) throw new TypeError("reviewed rule revision evidence is inconsistent");
  if ((item.status === "published" || item.status === "retired") && (item.reviewedBy === null || item.publishedBy === null)) throw new TypeError("published rule revision evidence is incomplete");
}

function definition(value: unknown): void {
  const item = object(value, "coupon definition");
  exact(item, "coupon definition", ["couponDefinitionId", "marketingCampaignId", "ruleRevisionId", "cityCode", "name", "status", "currency", "faceValueMinor", "minSpendMinor", "issuanceCap", "issuedCount", "compensationCap", "compensationIssuedCount", "validFrom", "validUntil", "version", "createdAt", "updatedAt"]);
  ["couponDefinitionId", "marketingCampaignId", "ruleRevisionId", "cityCode", "name"].forEach((key) => string(item[key], `definition.${key}`));
  oneOf(item.status, "definition.status", ["draft", "active", "suspended", "expired", "retired"]);
  oneOf(item.currency, "definition.currency", ["CNY"]);
  ["faceValueMinor", "minSpendMinor", "issuanceCap", "compensationCap"].forEach((key) => integer(item[key], `definition.${key}`, 1));
  integer(item.issuedCount, "definition.issuedCount");
  integer(item.compensationIssuedCount, "definition.compensationIssuedCount");
  if (Number(item.issuedCount) > Number(item.issuanceCap)) throw new TypeError("definition issued count exceeds cap");
  if (Number(item.compensationIssuedCount) > Number(item.compensationCap)) throw new TypeError("definition compensation count exceeds cap");
  ["validFrom", "validUntil", "createdAt", "updatedAt"].forEach((key) => timestamp(item[key], `definition.${key}`));
  integer(item.version, "definition.version", 1);
}

function grant(value: unknown): void {
  const item = object(value, "coupon grant");
  exact(item, "coupon grant", ["couponGrantId", "couponDefinitionId", "marketingCampaignId", "ruleRevisionId", "cityCode", "customerId", "status", "issuanceReason", "issuanceRef", "availableAt", "expiresAt", "version", "createdAt", "updatedAt"]);
  ["couponGrantId", "couponDefinitionId", "marketingCampaignId", "ruleRevisionId", "cityCode", "customerId", "issuanceRef"].forEach((key) => string(item[key], `grant.${key}`));
  oneOf(item.status, "grant.status", ["granted", "available", "reserved", "redeemed", "released", "expired", "revoked"]);
  oneOf(item.issuanceReason, "grant.issuanceReason", ["campaign_targeted", "admin_manual", "order_cancellation", "full_refund", "approved_compensation"]);
  timestamp(item.availableAt, "grant.availableAt", true);
  ["expiresAt", "createdAt", "updatedAt"].forEach((key) => timestamp(item[key], `grant.${key}`));
  integer(item.version, "grant.version", 1);
}

function decision(value: unknown): void {
  const item = object(value, "marketing discount decision");
  exact(item, "marketing discount decision", ["discountDecisionId", "cityCode", "customerId", "skuId", "quantity", "priceRuleId", "priceRuleVersion", "ruleRevisionId", "ruleContentHash", "couponDefinitionId", "couponGrantId", "currency", "grossAmountMinor", "discountAmountMinor", "netAmountMinor", "requestFingerprint", "status", "expiresAt", "acceptedOrderId", "version", "createdAt", "updatedAt"]);
  ["discountDecisionId", "cityCode", "customerId", "skuId", "priceRuleId", "ruleRevisionId", "couponDefinitionId", "couponGrantId"].forEach((key) => string(item[key], `decision.${key}`));
  integer(item.quantity, "decision.quantity", 1);
  integer(item.priceRuleVersion, "decision.priceRuleVersion", 1);
  if (typeof item.ruleContentHash !== "string" || !/^[a-f0-9]{64}$/.test(item.ruleContentHash)) throw new TypeError("decision rule content hash is invalid");
  oneOf(item.currency, "decision.currency", ["CNY"]);
  integer(item.grossAmountMinor, "decision.grossAmountMinor", 1);
  integer(item.discountAmountMinor, "decision.discountAmountMinor", 1);
  integer(item.netAmountMinor, "decision.netAmountMinor", 1);
  if (item.netAmountMinor !== item.grossAmountMinor - item.discountAmountMinor || item.discountAmountMinor >= item.grossAmountMinor) {
    throw new TypeError("discount decision money invariant failed");
  }
  if (typeof item.requestFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(item.requestFingerprint)) throw new TypeError("decision fingerprint is invalid");
  oneOf(item.status, "decision.status", ["issued", "accepted", "expired", "rejected"]);
  string(item.acceptedOrderId, "decision.acceptedOrderId", true);
  ["expiresAt", "createdAt", "updatedAt"].forEach((key) => timestamp(item[key], `decision.${key}`));
  integer(item.version, "decision.version", 1);
}

function ok(value: unknown, label: string, key: string): JsonObject {
  const response = object(value, label);
  exact(response, label, ["ok", key]);
  if (response.ok !== true) throw new TypeError(`${label}.ok must be true`);
  return response;
}

export function validateMarketingCampaignResponse(value: unknown): MarketingCampaignResponse {
  const response = ok(value, "marketing campaign response", "campaign"); campaign(response.campaign);
  return response as unknown as MarketingCampaignResponse;
}
export function validateMarketingCampaignListResponse(value: unknown): MarketingCampaignListResponse {
  const response = ok(value, "marketing campaign list response", "campaigns");
  if (!Array.isArray(response.campaigns) || response.campaigns.length > 500) throw new TypeError("campaigns must be a bounded array");
  response.campaigns.forEach(campaign); return response as unknown as MarketingCampaignListResponse;
}
export function validateMarketingRuleRevisionResponse(value: unknown): MarketingRuleRevisionResponse {
  const response = ok(value, "marketing rule revision response", "ruleRevision"); ruleRevision(response.ruleRevision);
  return response as unknown as MarketingRuleRevisionResponse;
}
export function validateMarketingRuleRevisionListResponse(value: unknown): MarketingRuleRevisionListResponse {
  const response = ok(value, "marketing rule revision list response", "ruleRevisions");
  if (!Array.isArray(response.ruleRevisions) || response.ruleRevisions.length > 500) throw new TypeError("ruleRevisions must be a bounded array");
  response.ruleRevisions.forEach(ruleRevision); return response as unknown as MarketingRuleRevisionListResponse;
}
export function validateCouponDefinitionResponse(value: unknown): CouponDefinitionResponse {
  const response = ok(value, "coupon definition response", "couponDefinition"); definition(response.couponDefinition);
  return response as unknown as CouponDefinitionResponse;
}
export function validateCouponDefinitionListResponse(value: unknown): CouponDefinitionListResponse {
  const response = ok(value, "coupon definition list response", "couponDefinitions");
  if (!Array.isArray(response.couponDefinitions) || response.couponDefinitions.length > 500) throw new TypeError("couponDefinitions must be a bounded array");
  response.couponDefinitions.forEach(definition); return response as unknown as CouponDefinitionListResponse;
}
export function validateCouponGrantResponse(value: unknown): CouponGrantResponse {
  const response = ok(value, "coupon grant response", "couponGrant"); grant(response.couponGrant);
  return response as unknown as CouponGrantResponse;
}
export function validateCouponGrantListResponse(value: unknown): CouponGrantListResponse {
  const response = ok(value, "coupon grant list response", "couponGrants");
  if (!Array.isArray(response.couponGrants) || response.couponGrants.length > 500) throw new TypeError("couponGrants must be a bounded array");
  response.couponGrants.forEach(grant); return response as unknown as CouponGrantListResponse;
}
export function validateMarketingDiscountDecisionResponse(value: unknown): MarketingDiscountDecisionResponse {
  const response = ok(value, "marketing discount decision response", "discountDecision"); decision(response.discountDecision);
  return response as unknown as MarketingDiscountDecisionResponse;
}

function queryString(values: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value) query.set(key, value); });
  const result = query.toString(); return result ? `?${result}` : "";
}

export function createCustomerMarketingApi(client: ApiClient) {
  return {
    listCouponGrants(query: { status?: "available" } = {}) {
      return client.get<CouponGrantListResponse>(`/api/customer/marketing/coupon-grants${queryString(query)}`, { validate: validateCouponGrantListResponse });
    },
    issueDiscountDecision(body: IssueMarketingDiscountDecisionRequest) {
      return client.post<MarketingDiscountDecisionResponse>("/api/customer/marketing/discount-decisions", body, { retry: "idempotent", validate: validateMarketingDiscountDecisionResponse });
    },
  };
}

export function createAdminMarketingApi(client: ApiClient) {
  return {
    listCampaigns() {
      return client.get<MarketingCampaignListResponse>("/api/admin/marketing/campaigns", { validate: validateMarketingCampaignListResponse });
    },
    createCampaign(body: CreateMarketingCampaignRequest) {
      return client.post<MarketingCampaignResponse>("/api/admin/marketing/campaigns", body, { retry: "idempotent", validate: validateMarketingCampaignResponse });
    },
    reviewCampaign(marketingCampaignId: string, body: ReviewMarketingCampaignRequest) {
      return client.post<MarketingCampaignResponse>(`/api/admin/marketing/campaigns/${encodeURIComponent(marketingCampaignId)}/review`, body, { retry: "none", validate: validateMarketingCampaignResponse });
    },
    scheduleCampaign(marketingCampaignId: string, body: ScheduleMarketingCampaignRequest) {
      return client.post<MarketingCampaignResponse>(`/api/admin/marketing/campaigns/${encodeURIComponent(marketingCampaignId)}/schedule`, body, { retry: "none", validate: validateMarketingCampaignResponse });
    },
    changeCampaignStatus(marketingCampaignId: string, body: ChangeMarketingCampaignStatusRequest) {
      return client.post<MarketingCampaignResponse>(`/api/admin/marketing/campaigns/${encodeURIComponent(marketingCampaignId)}/status`, body, { retry: "none", validate: validateMarketingCampaignResponse });
    },
    listRuleRevisions(marketingCampaignId: string) {
      return client.get<MarketingRuleRevisionListResponse>(`/api/admin/marketing/campaigns/${encodeURIComponent(marketingCampaignId)}/rule-revisions`, { validate: validateMarketingRuleRevisionListResponse });
    },
    createRuleRevision(marketingCampaignId: string, body: CreateMarketingRuleRevisionRequest) {
      return client.post<MarketingRuleRevisionResponse>(`/api/admin/marketing/campaigns/${encodeURIComponent(marketingCampaignId)}/rule-revisions`, body, { retry: "idempotent", validate: validateMarketingRuleRevisionResponse });
    },
    reviewRuleRevision(ruleRevisionId: string, body: ReviewMarketingRuleRevisionRequest) {
      return client.post<MarketingRuleRevisionResponse>(`/api/admin/marketing/rule-revisions/${encodeURIComponent(ruleRevisionId)}/review`, body, { retry: "none", validate: validateMarketingRuleRevisionResponse });
    },
    publishRuleRevision(ruleRevisionId: string, body: PublishMarketingRuleRevisionRequest) {
      return client.post<MarketingRuleRevisionResponse>(`/api/admin/marketing/rule-revisions/${encodeURIComponent(ruleRevisionId)}/publish`, body, { retry: "none", validate: validateMarketingRuleRevisionResponse });
    },
    listCouponDefinitions() {
      return client.get<CouponDefinitionListResponse>("/api/admin/marketing/coupon-definitions", { validate: validateCouponDefinitionListResponse });
    },
    createCouponDefinition(body: CreateCouponDefinitionRequest) {
      return client.post<CouponDefinitionResponse>("/api/admin/marketing/coupon-definitions", body, { retry: "idempotent", validate: validateCouponDefinitionResponse });
    },
    changeCouponDefinitionStatus(couponDefinitionId: string, body: ChangeCouponDefinitionStatusRequest) {
      return client.post<CouponDefinitionResponse>(`/api/admin/marketing/coupon-definitions/${encodeURIComponent(couponDefinitionId)}/status`, body, { retry: "none", validate: validateCouponDefinitionResponse });
    },
    grantCoupon(body: GrantCouponRequest) {
      return client.post<CouponGrantResponse>("/api/admin/marketing/coupon-grants", body, { retry: "idempotent", validate: validateCouponGrantResponse });
    },
    revokeCouponGrant(couponGrantId: string, body: RevokeCouponGrantRequest) {
      return client.post<CouponGrantResponse>(`/api/admin/marketing/coupon-grants/${encodeURIComponent(couponGrantId)}/revoke`, body, { retry: "none", validate: validateCouponGrantResponse });
    },
  };
}
