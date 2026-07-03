import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

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
});

export type PriceRuleInput = z.infer<typeof priceRuleSchema>;
export type PricingQuoteQueryInput = z.infer<typeof pricingQuoteQuerySchema>;
export type PriceQuoteInput = z.infer<typeof priceQuoteSchema>;
