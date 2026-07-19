import { z } from "zod";
import { serviceSkuProfileSchema, serviceStandardSchema } from "./catalogSchema.js";
import { cityCodeSchema } from "./cityCodeSchema.js";
import { priceQuoteBreakdownSchema, priceTypeSchema } from "./pricingSchema.js";

export const orderStatusSchema = z.enum([
  "draft",
  "pending_dispatch",
  "service_completed",
  "pending_payment",
  "paid",
  "cancelled",
]);

export const scheduledTimeSlotSchema = z.enum(["morning", "afternoon", "evening"]);

export const customerOrderListQuerySchema = z.object({
  cursor: z.string().min(1).max(2_048).regex(/^[A-Za-z0-9_-]+$/).optional(),
  limit: z.number().int().min(1).max(50).optional(),
}).strict();

export const createOrderSchema = z.object({
  customerId: z.string().min(1).max(64).optional(),
  skuId: z.string().min(1).max(128),
  quantity: z.number().int().min(1),
  addressProvince: z.string().min(1).max(64),
  addressCity: z.string().min(1).max(64),
  addressDistrict: z.string().min(1).max(64),
  detailAddress: z.string().min(2).max(255),
  contactName: z.string().min(1).max(64),
  contactPhone: z.string().regex(/^1[3-9]\d{9}$/, "contactPhone must be a valid mainland China mobile number"),
  scheduledAt: z.string().datetime(),
  scheduledTimeSlot: scheduledTimeSlotSchema,
  discountDecisionId: z.string().min(1).max(64).optional(),
  discountDecisionRevision: z.number().int().positive().optional(),
  orderIdempotencyKey: z.string().min(8).max(128).optional(),
  discountAmountMinor: z.never().optional(),
  netAmountMinor: z.never().optional(),
  grossAmountMinor: z.never().optional(),
}).strict().superRefine((value, context) => {
  const hasDecision = value.discountDecisionId !== undefined;
  const hasRevision = value.discountDecisionRevision !== undefined;
  const hasIdempotency = value.orderIdempotencyKey !== undefined;
  if (hasDecision !== hasRevision || hasDecision !== hasIdempotency) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "discount decision id, revision and order idempotency key must be supplied together",
    });
  }
});

const marketingDecisionEvidenceSchema = z.object({
  decisionId: z.string().min(1).max(64),
  decisionRevision: z.number().int().positive(),
  ruleRevisionId: z.string().min(1).max(64),
  ruleContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  couponDefinitionId: z.string().min(1).max(64),
  grantId: z.string().min(1).max(64),
  reservationId: z.string().min(1).max(64),
  redemptionId: z.string().min(1).max(64),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  acceptedAt: z.string().datetime(),
});

export const orderSchema = z.object({
  orderId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  addressProvince: z.string().min(1).max(64),
  addressCity: z.string().min(1).max(64),
  addressDistrict: z.string().min(1).max(64),
  detailAddress: z.string().min(2).max(255),
  contactName: z.string().min(1).max(64),
  contactPhone: z.string().min(1).max(32),
  scheduledAt: z.string().min(1),
  scheduledTimeSlot: scheduledTimeSlotSchema,
  customerId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(128),
  skuName: z.string().min(1).max(255),
  quantity: z.number().int().min(1),
  unit: z.string().min(1).max(64),
  priceRuleId: z.string().min(1).max(128),
  priceText: z.string().min(1).max(255),
  priceType: priceTypeSchema,
  basePrice: z.number().min(0),
  currency: z.literal("CNY"),
  totalAmount: z.number().min(0),
  quoteSnapshot: z.object({
    priceRuleId: z.string().min(1).max(64),
    skuId: z.string().min(1).max(64),
    quantity: z.number().int().min(1),
    currency: z.literal("CNY"),
    priceText: z.string().min(1).max(255),
    priceType: priceTypeSchema,
    unitAmount: z.number().min(0),
    totalAmount: z.number().min(0),
    breakdown: priceQuoteBreakdownSchema,
    skuProfile: serviceSkuProfileSchema.nullable(),
    standards: serviceStandardSchema.array(),
    pricingSource: z.enum(["public", "enterprise", "marketing"]).optional(),
    calculationVersion: z.literal(1).optional(),
    minorUnit: z.literal(2).optional(),
    grossAmountMinor: z.number().int().nonnegative().optional(),
    discountAmountMinor: z.number().int().nonnegative().optional(),
    netAmountMinor: z.number().int().positive().optional(),
    marketingDecision: marketingDecisionEvidenceSchema.nullable().optional(),
  }).nullable().optional(),
  status: orderStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CustomerOrderListQueryInput = z.infer<typeof customerOrderListQuerySchema>;
export type OrderInput = z.infer<typeof orderSchema>;
