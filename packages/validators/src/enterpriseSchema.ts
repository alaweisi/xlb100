import { z } from "zod";
import { BUSINESS_WEBHOOK_EVENT_TYPES } from "@xlb/types";

export const businessApiScopeSchema = z.enum([
  "enterprise:orders:read",
  "enterprise:orders:write",
  "enterprise:webhooks:read",
  "enterprise:webhooks:write",
]);

export const createBusinessClientSchema = z.object({
  clientCode: z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/),
  name: z.string().trim().min(2).max(128),
  billingMode: z.enum(["single", "monthly"]),
  contactName: z.string().trim().min(1).max(64),
  contactPhone: z.string().regex(/^1[3-9]\d{9}$/),
  contactEmail: z.string().email().max(255).optional(),
}).strict();

export const createBusinessCredentialSchema = z.object({
  name: z.string().trim().min(2).max(64),
  scopes: businessApiScopeSchema.array().min(1).max(4),
  expiresAt: z.string().datetime().optional(),
}).strict();
export const updateBusinessClientStatusSchema = z.object({ status: z.enum(["active","suspended","closed"]) }).strict();
export const updateBusinessWebhookSubscriptionStatusSchema = z.object({ status: z.enum(["active","paused"]) }).strict();

export const upsertBusinessAgreementPriceSchema = z.object({
  skuId: z.string().min(1).max(128),
  unitPrice: z.number().positive().max(999999.99),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().optional(),
}).strict().refine((value) => !value.effectiveTo || value.effectiveTo > value.effectiveFrom, {
  message: "effectiveTo must be after effectiveFrom",
});

export const createBusinessOrderSchema = z.object({
  externalOrderId: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,63}$/),
  idempotencyKey: z.string().trim().min(8).max(128),
  skuId: z.string().min(1).max(128),
  quantity: z.number().int().min(1).max(999),
  addressProvince: z.string().min(1).max(64),
  addressCity: z.string().min(1).max(64),
  addressDistrict: z.string().min(1).max(64),
  detailAddress: z.string().min(2).max(255),
  contactName: z.string().min(1).max(64),
  contactPhone: z.string().regex(/^1[3-9]\d{9}$/),
  scheduledAt: z.string().datetime(),
  scheduledTimeSlot: z.enum(["morning", "afternoon", "evening"]),
}).strict();

export const businessWebhookEventTypeSchema = z.enum(BUSINESS_WEBHOOK_EVENT_TYPES);

export const createBusinessWebhookSubscriptionSchema = z.object({
  callbackUrl: z.string().max(1024).refine((value) => value.startsWith("https://") || value.startsWith("mock://"), {
    message: "callbackUrl must use https:// or mock://",
  }),
  eventTypes: businessWebhookEventTypeSchema.array().min(1).max(BUSINESS_WEBHOOK_EVENT_TYPES.length),
}).strict();

export const createEnterpriseBillSchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
}).strict().refine((value) => value.periodEnd > value.periodStart, { message: "periodEnd must be after periodStart" });
