import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";
import { serviceSkuProfileSchema, serviceStandardSchema } from "./catalogSchema.js";

export const priceTypeSchema = z.enum([
  "fixed",
  "range",
  "from",
  "estimate_from",
  "onsite_quote",
]);

export const priceRuleSchema = z.object({
  priceRuleId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  skuId: z.string().min(1).max(64),
  basePrice: z.number().min(0),
  currency: z.literal("CNY").default("CNY"),
  priceText: z.string().min(1).max(255),
  priceType: priceTypeSchema,
  minPrice: z.number().min(0).nullable(),
  maxPrice: z.number().min(0).nullable(),
  pricingNote: z.string().max(255).nullable(),
  isEnabled: z.boolean(),
  version: z.number().int().positive(),
});

export const feeItemTypeSchema = z.enum([
  "base",
  "labor",
  "material",
  "floor",
  "distance",
  "urgent",
  "night",
  "dismantle",
  "diagnosis",
  "enterprise_adjustment",
]);

export const feeChargeMethodSchema = z.enum([
  "fixed",
  "per_unit",
  "range",
  "onsite_quote",
  "included",
]);

export const priceFeeItemSchema = z.object({
  feeItemId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  priceRuleId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(64),
  feeCode: z.string().min(1).max(64),
  feeName: z.string().min(1).max(128),
  feeType: feeItemTypeSchema,
  chargeMethod: feeChargeMethodSchema,
  amount: z.number().min(0),
  minAmount: z.number().min(0).nullable(),
  maxAmount: z.number().min(0).nullable(),
  unit: z.string().min(1).max(32).nullable(),
  isOptional: z.boolean(),
  isEnabled: z.boolean(),
  sortOrder: z.number().int(),
});

export const priceQuoteBreakdownSchema = z.object({
  baseAmount: z.number().min(0),
  requiredFeeAmount: z.number().min(0),
  optionalFeeAmount: z.number().min(0),
  totalAmount: z.number().min(0),
  feeItems: priceFeeItemSchema.array(),
});

export const pricingQuoteQuerySchema = z.object({
  skuId: z.string().min(1).max(64),
});

export const priceQuoteSchema = z.object({
  cityCode: cityCodeSchema,
  skuId: z.string().min(1).max(64),
  basePrice: z.number().min(0),
  currency: z.literal("CNY"),
  priceText: z.string().min(1).max(255),
  priceType: priceTypeSchema,
  minPrice: z.number().min(0).nullable(),
  maxPrice: z.number().min(0).nullable(),
  pricingNote: z.string().max(255).nullable(),
  priceRuleId: z.string().min(1).max(64),
  version: z.number().int().positive(),
  skuProfile: serviceSkuProfileSchema.nullable(),
  standards: serviceStandardSchema.array(),
  breakdown: priceQuoteBreakdownSchema,
});

export type PriceRuleInput = z.infer<typeof priceRuleSchema>;
export type PriceFeeItemInput = z.infer<typeof priceFeeItemSchema>;
export type PriceQuoteBreakdownInput = z.infer<typeof priceQuoteBreakdownSchema>;
export type PricingQuoteQueryInput = z.infer<typeof pricingQuoteQuerySchema>;
export type PriceQuoteInput = z.infer<typeof priceQuoteSchema>;
