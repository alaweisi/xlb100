import type { CityCode } from "./city.js";

/** Phase 29 money is always represented as integer CNY fen. */
export const MARKETING_CURRENCY = "CNY" as const;
export type MarketingCurrency = typeof MARKETING_CURRENCY;
export type CnyAmountMinor = number;
export type MarketingRuleContentHash = string;

export type MarketingCampaignStatus =
  | "draft"
  | "reviewed"
  | "scheduled"
  | "active"
  | "paused"
  | "ended"
  | "revoked";
export type MarketingRuleRevisionStatus = "draft" | "reviewed" | "published" | "retired";
export type CouponDefinitionStatus = "draft" | "active" | "suspended" | "expired" | "retired";
export type CouponGrantStatus =
  | "granted"
  | "available"
  | "reserved"
  | "redeemed"
  | "released"
  | "expired"
  | "revoked";
export type CouponReservationStatus = "active" | "redeemed" | "released" | "expired";
export type MarketingDiscountDecisionStatus = "issued" | "accepted" | "expired" | "rejected";
export type MarketingCompensationStatus = "pending" | "granted" | "denied";
export type CouponIssuanceReason =
  | "campaign_targeted"
  | "admin_manual"
  | "order_cancellation"
  | "full_refund"
  | "approved_compensation";
export type MarketingCompensationTrigger = "order_cancellation" | "full_refund";

export interface MarketingCampaign {
  marketingCampaignId: string;
  cityCode: CityCode;
  name: string;
  status: MarketingCampaignStatus;
  activeRuleRevisionId: string | null;
  startAt: string;
  endAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingRuleRevision {
  ruleRevisionId: string;
  marketingCampaignId: string;
  cityCode: CityCode;
  revision: number;
  status: MarketingRuleRevisionStatus;
  allowedSkuIds: string[];
  createdBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  version: number;
  createdAt: string;
}

export interface CouponDefinition {
  couponDefinitionId: string;
  marketingCampaignId: string;
  ruleRevisionId: string;
  cityCode: CityCode;
  name: string;
  status: CouponDefinitionStatus;
  currency: MarketingCurrency;
  faceValueMinor: CnyAmountMinor;
  minSpendMinor: CnyAmountMinor;
  issuanceCap: number;
  issuedCount: number;
  compensationCap: number;
  compensationIssuedCount: number;
  validFrom: string;
  validUntil: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CouponGrant {
  couponGrantId: string;
  couponDefinitionId: string;
  marketingCampaignId: string;
  ruleRevisionId: string;
  cityCode: CityCode;
  customerId: string;
  status: CouponGrantStatus;
  issuanceReason: CouponIssuanceReason;
  issuanceRef: string;
  availableAt: string | null;
  expiresAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CouponReservation {
  couponReservationId: string;
  couponGrantId: string;
  discountDecisionId: string;
  orderId: string;
  cityCode: CityCode;
  customerId: string;
  status: CouponReservationStatus;
  currency: MarketingCurrency;
  discountAmountMinor: CnyAmountMinor;
  expiresAt: string;
  releasedReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CouponRedemption {
  couponRedemptionId: string;
  couponReservationId: string;
  couponGrantId: string;
  discountDecisionId: string;
  orderId: string;
  cityCode: CityCode;
  customerId: string;
  currency: MarketingCurrency;
  discountAmountMinor: CnyAmountMinor;
  redeemedAt: string;
}

export interface MarketingDiscountDecision {
  discountDecisionId: string;
  cityCode: CityCode;
  customerId: string;
  skuId: string;
  quantity: number;
  priceRuleId: string;
  priceRuleVersion: number;
  ruleRevisionId: string;
  ruleContentHash: MarketingRuleContentHash;
  couponDefinitionId: string;
  couponGrantId: string;
  currency: MarketingCurrency;
  grossAmountMinor: CnyAmountMinor;
  discountAmountMinor: CnyAmountMinor;
  netAmountMinor: CnyAmountMinor;
  requestFingerprint: string;
  status: MarketingDiscountDecisionStatus;
  expiresAt: string;
  acceptedOrderId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingCompensationGrant {
  compensationId: string;
  cityCode: CityCode;
  customerId: string;
  sourceCouponRedemptionId: string;
  triggerType: MarketingCompensationTrigger;
  triggerId: string;
  status: MarketingCompensationStatus;
  currency: MarketingCurrency;
  amountMinor: CnyAmountMinor;
  resultingCouponGrantId: string | null;
  decisionReason: string | null;
  expiresAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingAuditRecord {
  marketingAuditId: string;
  cityCode: CityCode;
  aggregateType:
    | "marketing_campaign"
    | "marketing_rule_revision"
    | "coupon_definition"
    | "coupon_grant"
    | "coupon_reservation"
    | "discount_decision"
    | "marketing_compensation";
  aggregateId: string;
  action: string;
  actorId: string;
  actorRole: string;
  reason: string;
  expectedVersion: number | null;
  actualVersion: number;
  traceId: string;
  createdAt: string;
}

export interface CreateMarketingCampaignRequest {
  name: string;
  startAt: string;
  endAt: string;
  idempotencyKey: string;
}
export interface ReviewMarketingCampaignRequest { expectedVersion: number; reason: string; }
export interface ScheduleMarketingCampaignRequest { ruleRevisionId: string; expectedVersion: number; reason: string; }
export interface ChangeMarketingCampaignStatusRequest {
  status: Extract<MarketingCampaignStatus, "active" | "paused" | "ended" | "revoked">;
  expectedVersion: number;
  reason: string;
}
export interface CreateMarketingRuleRevisionRequest {
  allowedSkuIds: string[];
  idempotencyKey: string;
}
export interface ReviewMarketingRuleRevisionRequest { expectedVersion: number; reason: string; }
export interface PublishMarketingRuleRevisionRequest { expectedVersion: number; reason: string; }
export interface CreateCouponDefinitionRequest {
  marketingCampaignId: string;
  ruleRevisionId: string;
  name: string;
  allowedSkuIds: string[];
  currency: MarketingCurrency;
  faceValueMinor: CnyAmountMinor;
  minSpendMinor: CnyAmountMinor;
  issuanceCap: number;
  compensationCap: number;
  validFrom: string;
  validUntil: string;
  idempotencyKey: string;
}
export interface ChangeCouponDefinitionStatusRequest {
  status: Extract<CouponDefinitionStatus, "active" | "suspended" | "expired" | "retired">;
  expectedVersion: number;
  reason: string;
}
export interface GrantCouponRequest {
  couponDefinitionId: string;
  customerId: string;
  issuanceReason: "admin_manual";
  issuanceRef: string;
  expiresAt: string;
  reason: string;
  idempotencyKey: string;
}
export interface RevokeCouponGrantRequest { expectedVersion: number; reason: string; }
export interface IssueMarketingDiscountDecisionRequest {
  skuId: string;
  quantity: number;
  selectedCouponGrantId: string;
  idempotencyKey: string;
}
export interface AcceptMarketingDiscountDecisionRequest {
  discountDecisionId: string;
  expectedDecisionVersion: number;
  orderId: string;
  orderCommandKey: string;
  skuId: string;
  quantity: number;
}
export interface CouponGrantListQuery {
  status?: CouponGrantStatus;
}
export interface RecoverExpiredCouponReservationRequest {
  couponReservationId: string;
  expectedReservationVersion: number;
  reason: string;
  traceId: string;
}
export type CouponReservationRecoveryOutcome =
  | "released"
  | "reused"
  | "not_due"
  | "order_evidence_present"
  | "not_recoverable";
export interface CouponReservationRecoveryResult {
  outcome: CouponReservationRecoveryOutcome;
  couponReservation: CouponReservation;
  couponGrant: CouponGrant | null;
  discountDecision: MarketingDiscountDecision | null;
}

export interface MarketingCampaignResponse { ok: true; campaign: MarketingCampaign; }
export interface MarketingCampaignListResponse { ok: true; campaigns: MarketingCampaign[]; }
export interface MarketingRuleRevisionResponse { ok: true; ruleRevision: MarketingRuleRevision; }
export interface MarketingRuleRevisionListResponse { ok: true; ruleRevisions: MarketingRuleRevision[]; }
export interface CouponDefinitionResponse { ok: true; couponDefinition: CouponDefinition; }
export interface CouponDefinitionListResponse { ok: true; couponDefinitions: CouponDefinition[]; }
export interface CouponGrantResponse { ok: true; couponGrant: CouponGrant; }
export interface CouponGrantListResponse { ok: true; couponGrants: CouponGrant[]; }
export interface MarketingDiscountDecisionResponse { ok: true; discountDecision: MarketingDiscountDecision; }
