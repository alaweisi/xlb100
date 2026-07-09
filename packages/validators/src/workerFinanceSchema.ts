import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

const idSchema = z.string().min(1).max(64);
const moneySchema = z.number().positive().finite();

export const workerBankAccountStatusSchema = z.enum(["active", "inactive"]);
export const workerWithdrawalStatusSchema = z.enum([
  "requested",
  "approved",
  "rejected",
  "marked_paid",
  "cancelled",
]);
export const workerWithdrawalReviewDecisionSchema = z.enum(["approved", "rejected"]);

export const workerReceivableBalanceSchema = z.object({
  cityCode: cityCodeSchema,
  workerId: idSchema,
  currency: z.literal("CNY"),
  accruedAmount: z.number(),
  adjustedAmount: z.number(),
  requestedWithdrawalAmount: z.number(),
  markedPaidAmount: z.number(),
  availableAmount: z.number(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const workerReceivableAdjustmentSchema = z.object({
  adjustmentId: idSchema,
  cityCode: cityCodeSchema,
  refundId: idSchema,
  sourceEventId: idSchema,
  accrualId: idSchema,
  fulfillmentId: idSchema,
  orderId: idSchema,
  paymentOrderId: idSchema,
  workerId: idSchema,
  customerId: idSchema,
  grossAdjustment: z.number().max(0),
  platformFeeAdjustment: z.number().max(0),
  workerReceivableAdjustment: z.number().max(0),
  currency: z.literal("CNY"),
  reason: z.literal("refund.approved"),
  status: z.literal("applied"),
  appliedAt: z.string().min(1),
  createdAt: z.string().min(1),
}).strict();

export const createWorkerBankAccountRequestSchema = z.object({
  accountHolder: z.string().trim().min(1).max(128),
  bankName: z.string().trim().min(1).max(128),
  bankBranch: z.string().trim().min(1).max(128).nullable().optional(),
  bankCardNumber: z.string().trim().regex(/^[0-9 ]{12,32}$/),
}).strict();

export const workerBankAccountSchema = z.object({
  bankAccountId: idSchema,
  cityCode: cityCodeSchema,
  workerId: idSchema,
  accountHolder: z.string().min(1).max(128),
  bankName: z.string().min(1).max(128),
  bankBranch: z.string().max(128).nullable(),
  bankCardMasked: z.string().min(4).max(64),
  bankCardLast4: z.string().length(4),
  status: workerBankAccountStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const createWorkerWithdrawalRequestSchema = z.object({
  bankAccountId: idSchema,
  amount: moneySchema,
  requestNote: z.string().trim().min(1).max(255).nullable().optional(),
}).strict();

export const reviewWorkerWithdrawalRequestSchema = z.object({
  decision: workerWithdrawalReviewDecisionSchema,
  reviewNote: z.string().trim().min(1).max(255).nullable().optional(),
}).strict();

export const markWorkerWithdrawalPaidRequestSchema = z.object({
  markedPaidNote: z.string().trim().min(1).max(255).nullable().optional(),
}).strict();

export const workerWithdrawalRequestSchema = z.object({
  withdrawalId: idSchema,
  cityCode: cityCodeSchema,
  workerId: idSchema,
  bankAccountId: idSchema,
  amount: z.number().positive(),
  currency: z.literal("CNY"),
  status: workerWithdrawalStatusSchema,
  requestNote: z.string().max(255).nullable(),
  reviewNote: z.string().max(255).nullable(),
  markedPaidNote: z.string().max(255).nullable(),
  requestedAt: z.string().min(1),
  reviewedAt: z.string().nullable(),
  reviewedByAdminId: idSchema.nullable(),
  markedPaidAt: z.string().nullable(),
  markedPaidByAdminId: idSchema.nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export type CreateWorkerBankAccountRequestInput = z.infer<typeof createWorkerBankAccountRequestSchema>;
export type CreateWorkerWithdrawalRequestInput = z.infer<typeof createWorkerWithdrawalRequestSchema>;
export type ReviewWorkerWithdrawalRequestInput = z.infer<typeof reviewWorkerWithdrawalRequestSchema>;
export type MarkWorkerWithdrawalPaidRequestInput = z.infer<typeof markWorkerWithdrawalPaidRequestSchema>;
