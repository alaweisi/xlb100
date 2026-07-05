import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

// ══════════════════════════════════════════════════════════════════
// Phase 12 — Settlement Execution Preparation Control Envelope Schemas
// Governance-only envelope. No execution fields anywhere.
// ══════════════════════════════════════════════════════════════════

const idSchema = z.string().min(1).max(64);
const amountSchema = z.number().min(0);

export const preparationEnvelopeStatusSchema = z.enum([
  "draft",
  "frozen",
  "approved_for_phase13_review",
]);

export const createEnvelopeRequestSchema = z.object({
  sourcePacketId: z.string().min(1),
}).strict();

export const preparationItemRecordSchema = z.object({
  id: idSchema,
  envelopeId: idSchema,
  cityCode: cityCodeSchema,
  settlementBatchId: idSchema,
  statementId: idSchema.nullable().default(null),
  workerId: idSchema,
  orderId: idSchema,
  amount: amountSchema,
  currency: z.literal("CNY"),
  itemStatus: z.string().min(1).max(64),
  createdAt: z.string().min(1),
}).strict();

export const preparationAuditEntrySchema = z.object({
  id: idSchema,
  envelopeId: idSchema,
  cityCode: cityCodeSchema,
  eventType: z.string().min(1).max(64),
  eventTimestamp: z.string().min(1),
  actorAdminId: idSchema,
  targetType: z.string().min(1).max(64),
  targetId: idSchema,
  summary: z.string().min(1).max(500),
  createdAt: z.string().min(1),
}).strict();

export const envelopeRecordSchema = z.object({
  id: idSchema,
  cityCode: cityCodeSchema,
  sourcePacketId: z.string().min(1),
  intentId: idSchema,
  reviewId: idSchema.nullable().default(null),
  evidenceBundleId: idSchema.nullable().default(null),
  readinessPacketId: idSchema.nullable().default(null),
  envelopeStatus: preparationEnvelopeStatusSchema,
  itemCount: z.number().int().min(0),
  frozenAt: z.string().min(1).nullable().default(null),
  createdByAdminId: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict().superRefine((value, context) => {
  if (value.envelopeStatus === "frozen" && value.frozenAt === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "frozenAt must be set when envelopeStatus is frozen",
      path: ["frozenAt"],
    });
  }
  if (value.envelopeStatus !== "frozen" && value.frozenAt !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "frozenAt must be null when envelopeStatus is not frozen",
      path: ["frozenAt"],
    });
  }
});

export type PreparationEnvelopeStatusInput = z.input<typeof preparationEnvelopeStatusSchema>;
export type CreateEnvelopeRequestInput = z.input<typeof createEnvelopeRequestSchema>;
export type EnvelopeRecordInput = z.input<typeof envelopeRecordSchema>;
export type PreparationItemRecordInput = z.input<typeof preparationItemRecordSchema>;
export type PreparationAuditEntryInput = z.input<typeof preparationAuditEntrySchema>;
