import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const paymentStatusSchema = z.enum(["pending", "paid", "failed", "closed"]);

export const paymentProviderSchema = z.literal("mock");

export const createPaymentOrderSchema = z.object({
  orderId: z.string().min(1).max(64),
});

export const mockPaymentWebhookSchema = z.object({
  paymentOrderId: z.string().min(1).max(64),
  providerTradeNo: z.string().min(1).max(128),
  status: z.literal("paid"),
});

export const paymentOrderMetadataSchema = z.object({
  orderId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  skuId: z.string().min(1).max(128),
  priceRuleId: z.string().min(1).max(128),
  customerId: z.string().min(1).max(64).optional(),
});

export const paymentOrderSchema = z.object({
  paymentOrderId: z.string().min(1).max(64),
  orderId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  amount: z.number().min(0),
  currency: z.literal("CNY"),
  status: paymentStatusSchema,
  provider: paymentProviderSchema,
  providerTradeNo: z.string().max(128).nullable(),
  metadata: paymentOrderMetadataSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type CreatePaymentOrderInput = z.infer<typeof createPaymentOrderSchema>;
export type MockPaymentWebhookInput = z.infer<typeof mockPaymentWebhookSchema>;
export type PaymentOrderInput = z.infer<typeof paymentOrderSchema>;
