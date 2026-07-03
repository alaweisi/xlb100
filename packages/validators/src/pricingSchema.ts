import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const priceRuleSchema = z.object({
  priceRuleId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  skuId: z.string().min(1).max(64),
  basePrice: z.number().min(0),
  currency: z.literal("CNY").default("CNY"),
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
  priceRuleId: z.string().min(1).max(64),
  version: z.number().int().positive(),
});

export type PriceRuleInput = z.infer<typeof priceRuleSchema>;
export type PricingQuoteQueryInput = z.infer<typeof pricingQuoteQuerySchema>;
export type PriceQuoteInput = z.infer<typeof priceQuoteSchema>;
