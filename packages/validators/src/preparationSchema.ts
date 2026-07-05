import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

// ══════════════════════════════════════════════════════════════════
// Phase 12 — Settlement Execution Preparation Control Envelope Schemas
// Governance-only envelope. No execution fields anywhere.
// Valid statuses ONLY: draft, frozen, approved_for_phase13_review
// ══════════════════════════════════════════════════════════════════

const idSchema = z.string().min(1).max(64);

export const preparationEnvelopeStatusSchema = z.enum([
  "draft",
  "frozen",
  "approved_for_phase13_review",
]);

export const createEnvelopeRequestSchema = z.object({
  sourcePacketId: z.string().min(1),
}).strict();

// Matches actual item row: id, envelopeId, cityCode, itemType, itemRefId, plannedAction(nullable), itemOrder, createdAt
export const preparationItemRecordSchema = z.object({
  id: idSchema,
  envelopeId: idSchema,
  cityCode: cityCodeSchema,
  itemType: z.string().min(1).max(64),
  itemRefId: z.string().min(1).max(64),
  plannedAction: z.string().max(256).nullable().default(null),
  itemOrder: z.number().int().min(0),
  createdAt: z.string().min(1),
}).strict();

// Matches actual audit row: id, envelopeId, cityCode, eventType, eventTimestamp, actorAdminId(nullable), summary(nullable), traceId(nullable)
export const preparationAuditEntrySchema = z.object({
  id: idSchema,
  envelopeId: idSchema,
  cityCode: cityCodeSchema,
  eventType: z.string().min(1).max(64),
  eventTimestamp: z.string().min(1),
  actorAdminId: idSchema.nullable().default(null),
  summary: z.string().max(5000).nullable().default(null),
  traceId: idSchema.nullable().default(null),
}).strict();

// Matches actual envelope record: no intentId/reviewId/evidenceBundleId/readinessPacketId
export const envelopeRecordSchema = z.object({
  id: idSchema,
  cityCode: cityCodeSchema,
  sourcePacketId: z.string().min(1),
  sourcePlanId: idSchema.nullable().default(null),
  envelopeStatus: preparationEnvelopeStatusSchema,
  payloadHash: z.string().min(1).max(128),
  itemHash: z.string().max(128).nullable().default(null),
  sourcePacketHash: z.string().max(128).nullable().default(null),
  sourcePlanHash: z.string().max(128).nullable().default(null),
  amountSnapshot: z.record(z.unknown()),
  cityConfigSnapshotHash: z.string().max(128).nullable().default(null),
  settlementCycleSnapshotHash: z.string().max(128).nullable().default(null),
  conflictCheckSnapshotHash: z.string().max(128).nullable().default(null),
  conflictCheckSnapshot: z.record(z.unknown()),
  frozenAt: z.string().min(1).nullable().default(null),
  approvedAt: z.string().min(1).nullable().default(null),
  frozenByAdminId: idSchema.nullable().default(null),
  approvedByAdminId: idSchema.nullable().default(null),
  traceId: idSchema.nullable().default(null),
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
  if (!["frozen", "approved_for_phase13_review"].includes(value.envelopeStatus) && value.frozenAt !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "frozenAt must be null when envelopeStatus is draft",
      path: ["frozenAt"],
    });
  }
  if (value.envelopeStatus === "approved_for_phase13_review" && value.approvedAt === null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "approvedAt must be set when envelopeStatus is approved_for_phase13_review",
      path: ["approvedAt"],
    });
  }
});

export type PreparationEnvelopeStatusInput = z.input<typeof preparationEnvelopeStatusSchema>;
export type CreateEnvelopeRequestInput = z.input<typeof createEnvelopeRequestSchema>;
export type EnvelopeRecordInput = z.input<typeof envelopeRecordSchema>;
export type PreparationItemRecordInput = z.input<typeof preparationItemRecordSchema>;
export type PreparationAuditEntryInput = z.input<typeof preparationAuditEntrySchema>;
