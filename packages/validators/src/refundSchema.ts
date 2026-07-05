import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const refundRequestStatusSchema = z.enum(["requested", "approved"]);

export const createRefundRequestSchema = z.object({
  orderId: z.string().min(1).max(64),
  amount: z.number().min(0).optional(),
  reason: z.string().max(255).optional(),
}).strict();

export const approveRefundRequestSchema = z.object({
  approvedByAdminId: z.string().min(1).max(64).optional(),
}).strict();

export const refundRequestSchema = z.object({
  refundId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  orderId: z.string().min(1).max(64),
  customerId: z.string().min(1).max(64),
  fulfillmentId: z.string().min(1).max(64),
  paymentOrderId: z.string().min(1).max(64),
  amount: z.number().min(0),
  currency: z.literal("CNY"),
  reason: z.string().max(255).nullable(),
  status: refundRequestStatusSchema,
  requestedAt: z.string().min(1),
  approvedAt: z.string().nullable(),
  approvedByAdminId: z.string().nullable(),
}).strict();

export type CreateRefundRequestInput = z.infer<typeof createRefundRequestSchema>;
export type ApproveRefundRequestInput = z.infer<typeof approveRefundRequestSchema>;
export type RefundRequestInput = z.infer<typeof refundRequestSchema>;
