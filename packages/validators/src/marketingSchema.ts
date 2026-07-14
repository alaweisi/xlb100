import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

const identifierSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const nameSchema = z.string().trim().min(1).max(120);
const reasonSchema = z.string().trim().min(1).max(500);
const idempotencyKeySchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/);
const utcTimestampSchema = z.string().datetime().refine((value) => value.endsWith("Z"), "timestamp must be UTC");
const positiveVersionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const cnyAmountMinorSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const positiveCnyAmountMinorSchema = cnyAmountMinorSchema.refine((value) => value > 0, "amount must be positive");
export const marketingCurrencySchema = z.literal("CNY");
export const marketingRequestFingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/, "fingerprint must be lowercase SHA-256 hex");
export const marketingRuleContentHashSchema = z.string().regex(/^[a-f0-9]{64}$/, "rule content hash must be lowercase SHA-256 hex");

export const marketingCampaignStatusSchema = z.enum([
  "draft", "reviewed", "scheduled", "active", "paused", "ended", "revoked",
]);
export const marketingRuleRevisionStatusSchema = z.enum(["draft", "reviewed", "published", "retired"]);
export const couponDefinitionStatusSchema = z.enum(["draft", "active", "suspended", "expired", "retired"]);
export const couponGrantStatusSchema = z.enum([
  "granted", "available", "reserved", "redeemed", "released", "expired", "revoked",
]);
export const couponReservationStatusSchema = z.enum(["active", "redeemed", "released", "expired"]);
export const marketingDiscountDecisionStatusSchema = z.enum(["issued", "accepted", "expired", "rejected"]);
export const marketingCompensationStatusSchema = z.enum(["pending", "granted", "denied"]);
export const couponIssuanceReasonSchema = z.enum([
  "campaign_targeted", "admin_manual", "order_cancellation", "full_refund", "approved_compensation",
]);
export const marketingCompensationTriggerSchema = z.enum(["order_cancellation", "full_refund"]);

export const marketingCampaignSchema = z.object({
  marketingCampaignId: identifierSchema,
  cityCode: cityCodeSchema,
  name: nameSchema,
  status: marketingCampaignStatusSchema,
  activeRuleRevisionId: identifierSchema.nullable(),
  startAt: utcTimestampSchema,
  endAt: utcTimestampSchema,
  reviewedBy: identifierSchema.nullable(),
  reviewedAt: utcTimestampSchema.nullable(),
  version: positiveVersionSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
}).strict().superRefine((value, ctx) => {
  if (value.startAt >= value.endAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endAt"], message: "endAt must be after startAt" });
  if ((value.reviewedBy === null) !== (value.reviewedAt === null)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reviewedAt"], message: "reviewedBy and reviewedAt must both be present or null" });
});

export const marketingRuleRevisionSchema = z.object({
  ruleRevisionId: identifierSchema,
  marketingCampaignId: identifierSchema,
  cityCode: cityCodeSchema,
  revision: positiveVersionSchema,
  status: marketingRuleRevisionStatusSchema,
  allowedSkuIds: z.array(identifierSchema).min(1).max(500).refine((items) => new Set(items).size === items.length, "allowedSkuIds must be unique"),
  createdBy: identifierSchema,
  reviewedBy: identifierSchema.nullable(),
  reviewedAt: utcTimestampSchema.nullable(),
  publishedBy: identifierSchema.nullable(),
  publishedAt: utcTimestampSchema.nullable(),
  version: positiveVersionSchema,
  createdAt: utcTimestampSchema,
}).strict().superRefine((value, ctx) => {
  if ((value.reviewedBy === null) !== (value.reviewedAt === null)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reviewedAt"], message: "reviewedBy and reviewedAt must both be present or null" });
  if ((value.publishedBy === null) !== (value.publishedAt === null)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["publishedAt"], message: "publishedBy and publishedAt must both be present or null" });
  if (value.status === "draft" && (value.reviewedBy !== null || value.publishedBy !== null)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "draft revision cannot contain review or publication evidence" });
  if (value.status === "reviewed" && (value.reviewedBy === null || value.publishedBy !== null)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "reviewed revision requires review evidence and no publication evidence" });
  if ((value.status === "published" || value.status === "retired") && (value.reviewedBy === null || value.publishedBy === null)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["status"], message: "published or retired revision requires review and publication evidence" });
  if (value.reviewedBy !== null && value.reviewedBy === value.createdBy) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reviewedBy"], message: "review actor must differ from creator" });
  if (value.reviewedBy !== null && value.reviewedBy === value.publishedBy) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["publishedBy"], message: "publish actor must differ from review actor" });
});

export const couponDefinitionSchema = z.object({
  couponDefinitionId: identifierSchema,
  marketingCampaignId: identifierSchema,
  ruleRevisionId: identifierSchema,
  cityCode: cityCodeSchema,
  name: nameSchema,
  status: couponDefinitionStatusSchema,
  currency: marketingCurrencySchema,
  faceValueMinor: positiveCnyAmountMinorSchema,
  minSpendMinor: positiveCnyAmountMinorSchema,
  issuanceCap: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  issuedCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  compensationCap: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  compensationIssuedCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  validFrom: utcTimestampSchema,
  validUntil: utcTimestampSchema,
  version: positiveVersionSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
}).strict().superRefine((value, ctx) => {
  if (value.validFrom >= value.validUntil) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["validUntil"], message: "validUntil must be after validFrom" });
  if (value.issuedCount > value.issuanceCap) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["issuedCount"], message: "issuedCount cannot exceed issuanceCap" });
  if (value.compensationIssuedCount > value.compensationCap) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["compensationIssuedCount"], message: "compensationIssuedCount cannot exceed compensationCap" });
  if (value.minSpendMinor <= value.faceValueMinor) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["minSpendMinor"], message: "minSpendMinor must exceed faceValueMinor so net remains positive" });
});

export const couponGrantSchema = z.object({
  couponGrantId: identifierSchema,
  couponDefinitionId: identifierSchema,
  marketingCampaignId: identifierSchema,
  ruleRevisionId: identifierSchema,
  cityCode: cityCodeSchema,
  customerId: identifierSchema,
  status: couponGrantStatusSchema,
  issuanceReason: couponIssuanceReasonSchema,
  issuanceRef: identifierSchema,
  availableAt: utcTimestampSchema.nullable(),
  expiresAt: utcTimestampSchema,
  version: positiveVersionSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
}).strict();

export const couponReservationSchema = z.object({
  couponReservationId: identifierSchema,
  couponGrantId: identifierSchema,
  discountDecisionId: identifierSchema,
  orderId: identifierSchema,
  cityCode: cityCodeSchema,
  customerId: identifierSchema,
  status: couponReservationStatusSchema,
  currency: marketingCurrencySchema,
  discountAmountMinor: positiveCnyAmountMinorSchema,
  expiresAt: utcTimestampSchema,
  releasedReason: reasonSchema.nullable(),
  version: positiveVersionSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
}).strict();

export const couponRedemptionSchema = z.object({
  couponRedemptionId: identifierSchema,
  couponReservationId: identifierSchema,
  couponGrantId: identifierSchema,
  discountDecisionId: identifierSchema,
  orderId: identifierSchema,
  cityCode: cityCodeSchema,
  customerId: identifierSchema,
  currency: marketingCurrencySchema,
  discountAmountMinor: positiveCnyAmountMinorSchema,
  redeemedAt: utcTimestampSchema,
}).strict();

export const marketingDiscountDecisionSchema = z.object({
  discountDecisionId: identifierSchema,
  cityCode: cityCodeSchema,
  customerId: identifierSchema,
  skuId: identifierSchema,
  quantity: z.number().int().positive().max(1000),
  priceRuleId: identifierSchema,
  priceRuleVersion: positiveVersionSchema,
  ruleRevisionId: identifierSchema,
  ruleContentHash: marketingRuleContentHashSchema,
  couponDefinitionId: identifierSchema,
  couponGrantId: identifierSchema,
  currency: marketingCurrencySchema,
  grossAmountMinor: positiveCnyAmountMinorSchema,
  discountAmountMinor: positiveCnyAmountMinorSchema,
  netAmountMinor: positiveCnyAmountMinorSchema,
  requestFingerprint: marketingRequestFingerprintSchema,
  status: marketingDiscountDecisionStatusSchema,
  expiresAt: utcTimestampSchema,
  acceptedOrderId: identifierSchema.nullable(),
  version: positiveVersionSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
}).strict().superRefine((value, ctx) => {
  if (value.discountAmountMinor >= value.grossAmountMinor) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discountAmountMinor"], message: "discount must be less than gross amount" });
  if (value.netAmountMinor !== value.grossAmountMinor - value.discountAmountMinor) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["netAmountMinor"], message: "net amount must equal gross minus discount" });
  if (value.createdAt >= value.expiresAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "expiresAt must be after createdAt" });
  if ((value.status === "accepted") !== (value.acceptedOrderId !== null)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["acceptedOrderId"], message: "accepted decisions require exactly one order reference" });
});

export const marketingCompensationGrantSchema = z.object({
  compensationId: identifierSchema,
  cityCode: cityCodeSchema,
  customerId: identifierSchema,
  sourceCouponRedemptionId: identifierSchema,
  triggerType: marketingCompensationTriggerSchema,
  triggerId: identifierSchema,
  status: marketingCompensationStatusSchema,
  currency: marketingCurrencySchema,
  amountMinor: positiveCnyAmountMinorSchema,
  resultingCouponGrantId: identifierSchema.nullable(),
  decisionReason: reasonSchema.nullable(),
  expiresAt: utcTimestampSchema.nullable(),
  version: positiveVersionSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
}).strict().superRefine((value, ctx) => {
  if ((value.status === "granted") !== (value.resultingCouponGrantId !== null && value.expiresAt !== null)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["resultingCouponGrantId"], message: "granted compensation requires grant and expiry" });
});

export const marketingAuditRecordSchema = z.object({
  marketingAuditId: identifierSchema,
  cityCode: cityCodeSchema,
  aggregateType: z.enum(["marketing_campaign", "marketing_rule_revision", "coupon_definition", "coupon_grant", "coupon_reservation", "discount_decision", "marketing_compensation"]),
  aggregateId: identifierSchema,
  action: identifierSchema,
  actorId: identifierSchema,
  actorRole: identifierSchema,
  reason: reasonSchema,
  expectedVersion: positiveVersionSchema.nullable(),
  actualVersion: positiveVersionSchema,
  traceId: identifierSchema,
  createdAt: utcTimestampSchema,
}).strict();

export const createMarketingCampaignRequestSchema = z.object({
  name: nameSchema, startAt: utcTimestampSchema, endAt: utcTimestampSchema, idempotencyKey: idempotencyKeySchema,
}).strict().refine((value) => value.startAt < value.endAt, { path: ["endAt"], message: "endAt must be after startAt" });
export const reviewMarketingCampaignRequestSchema = z.object({ expectedVersion: positiveVersionSchema, reason: reasonSchema }).strict();
export const scheduleMarketingCampaignRequestSchema = z.object({ ruleRevisionId: identifierSchema, expectedVersion: positiveVersionSchema, reason: reasonSchema }).strict();
export const changeMarketingCampaignStatusRequestSchema = z.object({ status: z.enum(["active", "paused", "ended", "revoked"]), expectedVersion: positiveVersionSchema, reason: reasonSchema }).strict();
export const createMarketingRuleRevisionRequestSchema = z.object({
  allowedSkuIds: z.array(identifierSchema).min(1).max(500).refine((items) => new Set(items).size === items.length, "allowedSkuIds must be unique"),
  idempotencyKey: idempotencyKeySchema,
}).strict();
export const reviewMarketingRuleRevisionRequestSchema = z.object({ expectedVersion: positiveVersionSchema, reason: reasonSchema }).strict();
export const publishMarketingRuleRevisionRequestSchema = z.object({ expectedVersion: positiveVersionSchema, reason: reasonSchema }).strict();
export const createCouponDefinitionRequestSchema = z.object({
  marketingCampaignId: identifierSchema,
  ruleRevisionId: identifierSchema,
  name: nameSchema,
  allowedSkuIds: z.array(identifierSchema).min(1).max(500).refine((items) => new Set(items).size === items.length, "allowedSkuIds must be unique"),
  currency: marketingCurrencySchema,
  faceValueMinor: positiveCnyAmountMinorSchema,
  minSpendMinor: positiveCnyAmountMinorSchema,
  issuanceCap: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  compensationCap: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  validFrom: utcTimestampSchema,
  validUntil: utcTimestampSchema,
  idempotencyKey: idempotencyKeySchema,
}).strict().superRefine((value, ctx) => {
  if (value.validFrom >= value.validUntil) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["validUntil"], message: "validUntil must be after validFrom" });
  if (value.minSpendMinor <= value.faceValueMinor) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["minSpendMinor"], message: "minSpendMinor must exceed faceValueMinor" });
});
export const changeCouponDefinitionStatusRequestSchema = z.object({ status: z.enum(["active", "suspended", "expired", "retired"]), expectedVersion: positiveVersionSchema, reason: reasonSchema }).strict();
export const grantCouponRequestSchema = z.object({ couponDefinitionId: identifierSchema, customerId: identifierSchema, issuanceReason: z.literal("admin_manual"), issuanceRef: identifierSchema, expiresAt: utcTimestampSchema, reason: reasonSchema, idempotencyKey: idempotencyKeySchema }).strict();
export const revokeCouponGrantRequestSchema = z.object({ expectedVersion: positiveVersionSchema, reason: reasonSchema }).strict();
export const issueMarketingDiscountDecisionRequestSchema = z.object({
  skuId: identifierSchema,
  quantity: z.number().int().positive().max(1000),
  selectedCouponGrantId: identifierSchema,
  idempotencyKey: idempotencyKeySchema,
}).strict();
export const acceptMarketingDiscountDecisionRequestSchema = z.object({
  discountDecisionId: identifierSchema,
  expectedDecisionVersion: positiveVersionSchema,
  orderId: identifierSchema,
  orderCommandKey: idempotencyKeySchema,
  skuId: identifierSchema,
  quantity: z.number().int().positive().max(1000),
}).strict();
export const couponGrantListQuerySchema = z.object({
  status: couponGrantStatusSchema.optional(),
}).strict();
export const recoverExpiredCouponReservationRequestSchema = z.object({
  couponReservationId: identifierSchema,
  expectedReservationVersion: positiveVersionSchema,
  reason: reasonSchema,
  traceId: identifierSchema,
}).strict();

export const marketingCampaignResponseSchema = z.object({ ok: z.literal(true), campaign: marketingCampaignSchema }).strict();
export const marketingCampaignListResponseSchema = z.object({ ok: z.literal(true), campaigns: z.array(marketingCampaignSchema) }).strict();
export const marketingRuleRevisionResponseSchema = z.object({ ok: z.literal(true), ruleRevision: marketingRuleRevisionSchema }).strict();
export const marketingRuleRevisionListResponseSchema = z.object({ ok: z.literal(true), ruleRevisions: z.array(marketingRuleRevisionSchema) }).strict();
export const couponDefinitionResponseSchema = z.object({ ok: z.literal(true), couponDefinition: couponDefinitionSchema }).strict();
export const couponDefinitionListResponseSchema = z.object({ ok: z.literal(true), couponDefinitions: z.array(couponDefinitionSchema) }).strict();
export const couponGrantResponseSchema = z.object({ ok: z.literal(true), couponGrant: couponGrantSchema }).strict();
export const couponGrantListResponseSchema = z.object({ ok: z.literal(true), couponGrants: z.array(couponGrantSchema) }).strict();
export const marketingDiscountDecisionResponseSchema = z.object({ ok: z.literal(true), discountDecision: marketingDiscountDecisionSchema }).strict();

export type MarketingCampaignInput = z.infer<typeof marketingCampaignSchema>;
export type CouponDefinitionInput = z.infer<typeof couponDefinitionSchema>;
export type CouponGrantInput = z.infer<typeof couponGrantSchema>;
export type MarketingDiscountDecisionInput = z.infer<typeof marketingDiscountDecisionSchema>;
export type CreateMarketingCampaignRequestInput = z.infer<typeof createMarketingCampaignRequestSchema>;
export type CreateMarketingRuleRevisionRequestInput = z.infer<typeof createMarketingRuleRevisionRequestSchema>;
export type ReviewMarketingRuleRevisionRequestInput = z.infer<typeof reviewMarketingRuleRevisionRequestSchema>;
export type PublishMarketingRuleRevisionRequestInput = z.infer<typeof publishMarketingRuleRevisionRequestSchema>;
export type CreateCouponDefinitionRequestInput = z.infer<typeof createCouponDefinitionRequestSchema>;
export type GrantCouponRequestInput = z.infer<typeof grantCouponRequestSchema>;
export type IssueMarketingDiscountDecisionRequestInput = z.infer<typeof issueMarketingDiscountDecisionRequestSchema>;
export type AcceptMarketingDiscountDecisionRequestInput = z.infer<typeof acceptMarketingDiscountDecisionRequestSchema>;
export type CouponGrantListQueryInput = z.infer<typeof couponGrantListQuerySchema>;
export type RecoverExpiredCouponReservationRequestInput = z.infer<typeof recoverExpiredCouponReservationRequestSchema>;
