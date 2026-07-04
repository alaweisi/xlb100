import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const settlementBatchStatusSchema = z.enum(["prepared", "confirmed", "cancelled"]);
export const settlementItemStatusSchema = z.enum(["prepared", "confirmed", "cancelled"]);
const amountSchema = z.number().min(0);
const idSchema = z.string().min(1).max(64);

export const settlementBatchSchema = z.object({
  settlementBatchId: idSchema,
  cityCode: cityCodeSchema,
  currency: z.literal("CNY"),
  totalGrossAmount: amountSchema,
  totalPlatformFee: amountSchema,
  totalWorkerReceivable: amountSchema,
  itemCount: z.number().int().min(0),
  status: settlementBatchStatusSchema,
  preparedAt: z.string().min(1),
  confirmedAt: z.string().min(1).nullable(),
  confirmedBy: idSchema.nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict().superRefine((value, context) => {
  const hasAudit = value.confirmedAt !== null && value.confirmedBy !== null;
  if ((value.status === "confirmed") !== hasAudit) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "confirmed status and confirmation audit fields must agree",
    });
  }
});

export const confirmSettlementBatchRequestSchema = z.object({}).strict();

export const settlementConfirmedEventPayloadSchema = z.object({
  settlementBatchId: idSchema,
  cityCode: cityCodeSchema,
  currency: z.literal("CNY"),
  itemCount: z.number().int().min(1),
  totalGrossAmount: amountSchema,
  totalPlatformFee: amountSchema,
  totalWorkerReceivable: amountSchema,
  confirmedAt: z.string().min(1),
  confirmedBy: idSchema,
}).strict();

export const settlementConfirmationResponseSchema = z.object({
  ok: z.literal(true),
  batch: settlementBatchSchema,
  idempotent: z.boolean(),
}).strict();

export const settlementItemSchema = z.object({
  settlementItemId: idSchema,
  settlementBatchId: idSchema,
  cityCode: cityCodeSchema,
  accrualId: idSchema,
  fulfillmentId: idSchema,
  orderId: idSchema,
  paymentOrderId: idSchema,
  workerId: idSchema,
  customerId: idSchema,
  skuId: z.string().min(1).max(128),
  grossAmount: amountSchema,
  platformFee: amountSchema,
  workerReceivable: amountSchema,
  currency: z.literal("CNY"),
  status: settlementItemStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export type SettlementBatchInput = z.infer<typeof settlementBatchSchema>;
export type SettlementItemInput = z.infer<typeof settlementItemSchema>;
export type ConfirmSettlementBatchRequestInput = z.infer<typeof confirmSettlementBatchRequestSchema>;
export type SettlementConfirmedEventPayloadInput = z.infer<typeof settlementConfirmedEventPayloadSchema>;
export type SettlementConfirmationResponseInput = z.infer<typeof settlementConfirmationResponseSchema>;

export const settlementPayableStatusSchema = z.enum(["payable"]);

export const settlementPayableSchema = z.object({
  settlementPayableId: idSchema,
  cityCode: cityCodeSchema,
  settlementBatchId: idSchema,
  currency: z.literal("CNY"),
  grossAmount: amountSchema,
  platformFeeAmount: amountSchema,
  workerReceivableAmount: amountSchema,
  itemCount: z.number().int().min(1),
  status: settlementPayableStatusSchema,
  markedAt: z.string().min(1),
  markedBy: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const markSettlementPayableRequestSchema = z.object({}).strict();

export const settlementPayableEventPayloadSchema = z.object({
  payableId: idSchema,
  batchId: idSchema,
  cityCode: cityCodeSchema,
  currency: z.literal("CNY"),
  grossAmount: amountSchema,
  platformFeeAmount: amountSchema,
  workerReceivableAmount: amountSchema,
  itemCount: z.number().int().min(1),
  markedAt: z.string().min(1),
  markedBy: idSchema,
}).strict();

export const settlementPayableResponseSchema = z.object({
  ok: z.literal(true),
  payable: settlementPayableSchema,
  idempotent: z.boolean(),
}).strict();

export type SettlementPayableInput = z.infer<typeof settlementPayableSchema>;
export type MarkSettlementPayableRequestInput = z.infer<typeof markSettlementPayableRequestSchema>;
export type SettlementPayableEventPayloadInput = z.infer<typeof settlementPayableEventPayloadSchema>;
export type SettlementPayableResponseInput = z.infer<typeof settlementPayableResponseSchema>;

export const settlementPayableQueueStatusSchema = z.enum(["queued"]);

export const settlementPayableQueueSchema = z.object({
  queueId: idSchema,
  cityCode: cityCodeSchema,
  settlementPayableId: idSchema,
  settlementBatchId: idSchema,
  currency: z.literal("CNY"),
  grossAmount: amountSchema,
  platformFeeAmount: amountSchema,
  workerReceivableAmount: amountSchema,
  itemCount: z.number().int().min(1),
  status: settlementPayableQueueStatusSchema,
  enqueuedAt: z.string().min(1),
  enqueuedBy: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const enqueueSettlementPayableRequestSchema = z.object({}).strict();

export const settlementPayableQueuedEventPayloadSchema = z.object({
  queueId: idSchema,
  payableId: idSchema,
  batchId: idSchema,
  cityCode: cityCodeSchema,
  currency: z.literal("CNY"),
  grossAmount: amountSchema,
  platformFeeAmount: amountSchema,
  workerReceivableAmount: amountSchema,
  itemCount: z.number().int().min(1),
  enqueuedAt: z.string().min(1),
  enqueuedBy: idSchema,
}).strict();

export const settlementPayableQueueResponseSchema = z.object({
  ok: z.literal(true),
  queue: settlementPayableQueueSchema,
  idempotent: z.boolean(),
}).strict();

export type SettlementPayableQueueInput = z.infer<typeof settlementPayableQueueSchema>;
export type EnqueueSettlementPayableRequestInput = z.infer<typeof enqueueSettlementPayableRequestSchema>;
export type SettlementPayableQueuedEventPayloadInput = z.infer<typeof settlementPayableQueuedEventPayloadSchema>;
export type SettlementPayableQueueResponseInput = z.infer<typeof settlementPayableQueueResponseSchema>;
