import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";
import { priceTypeSchema } from "./pricingSchema.js";

export const orderStatusSchema = z.enum([
  "draft",
  "pending_payment",
  "paid",
  "cancelled",
]);

export const createOrderSchema = z.object({
  customerId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(128),
  quantity: z.number().int().min(1),
});

export const orderSchema = z.object({
  orderId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
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
  status: orderStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
