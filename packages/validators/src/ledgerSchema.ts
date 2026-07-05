import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const ledgerAccountTypeSchema = z.enum(["platform", "worker", "customer"]);
export const ledgerEntryDirectionSchema = z.enum(["debit", "credit"]);
export const ledgerEntrySourceTypeSchema = z.enum(["fulfillment.completed", "refund.approved"]);
export const ledgerAccrualStatusSchema = z.enum(["accrued", "voided"]);
const currencySchema = z.literal("CNY");
const amountSchema = z.number().min(0);

export const ledgerAccountSchema = z.object({
  accountId: z.string().min(1).max(64), cityCode: cityCodeSchema,
  accountType: ledgerAccountTypeSchema, ownerId: z.string().min(1).max(64),
  currency: currencySchema, status: z.literal("active"),
  createdAt: z.string().min(1), updatedAt: z.string().min(1),
}).strict();

export const ledgerEntrySchema = z.object({
  entryId: z.string().min(1).max(64), cityCode: cityCodeSchema,
  accountId: z.string().min(1).max(64), accountType: ledgerAccountTypeSchema,
  ownerId: z.string().min(1).max(64), sourceType: ledgerEntrySourceTypeSchema,
  sourceId: z.string().min(1).max(64), direction: ledgerEntryDirectionSchema,
  amount: amountSchema, currency: currencySchema,
  description: z.string().max(255).nullable(), createdAt: z.string().min(1),
}).strict();

export const ledgerAccrualSchema = z.object({
  accrualId: z.string().min(1).max(64), cityCode: cityCodeSchema,
  fulfillmentId: z.string().min(1).max(64), orderId: z.string().min(1).max(64),
  paymentOrderId: z.string().min(1).max(64), workerId: z.string().min(1).max(64),
  customerId: z.string().min(1).max(64), skuId: z.string().min(1).max(128),
  grossAmount: amountSchema, platformFee: amountSchema, workerReceivable: amountSchema,
  currency: currencySchema, sourceEventId: z.string().min(1).max(64),
  status: ledgerAccrualStatusSchema, createdAt: z.string().min(1),
}).strict();

export type LedgerAccountInput = z.infer<typeof ledgerAccountSchema>;
export type LedgerEntryInput = z.infer<typeof ledgerEntrySchema>;
export type LedgerAccrualInput = z.infer<typeof ledgerAccrualSchema>;
