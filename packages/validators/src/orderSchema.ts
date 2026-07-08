import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";
import { priceTypeSchema } from "./pricingSchema.js";

export const orderStatusSchema = z.enum([
  "draft",
  "pending_dispatch",
  "service_completed",
  "pending_payment",
  "paid",
  "cancelled",
]);

export const scheduledTimeSlotSchema = z.enum(["morning", "afternoon", "evening"]);

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
  status: orderStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
