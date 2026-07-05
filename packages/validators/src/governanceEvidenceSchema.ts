import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

const idSchema = z.string().min(1).max(64);

export const evidenceBundleStatusSchema = z.enum([
  "draft", "attached_to_review", "approved_for_governance_reference", "archived",
]);

const evidenceRefSchema = z.object({
  refType: z.string().min(1).max(64),
  refId: idSchema,
  sourcePhase: z.string().min(1).max(32),
  sourceRoute: z.string().min(1).max(256),
  cityCode: cityCodeSchema,
  statementId: idSchema.nullable().optional(),
  exportRecordId: idSchema.nullable().optional(),
  reviewId: idSchema.nullable().optional(),
  label: z.string().min(1).max(256),
  createdAt: z.string().min(1),
}).strict().superRefine((v, ctx) => {
  const forbidden = ["file_path", "download_url", "signed_url", "export_file_id", "payout_batch_id", "payment_execution_id", "ledger_mutation_id", "refund_execution_id", "reversal_execution_id"];
  for (const f of forbidden) {
    if ((v as Record<string, unknown>)[f] !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `forbidden field: ${f}`, path: [f] });
    }
  }
});

export const governanceEvidenceBundleRecordSchema = z.object({
  id: idSchema, cityCode: cityCodeSchema, intentId: idSchema,
  reviewId: idSchema.nullable().default(null), statementId: idSchema.nullable().default(null),
  bundleStatus: evidenceBundleStatusSchema,
  evidenceRefs: z.array(evidenceRefSchema).default([]),
  phase9Context: z.object({}).passthrough().default({}),
  reviewHistoryRefs: z.array(z.string()).default([]),
  auditTrailRefs: z.array(z.string()).default([]),
  riskSummary: z.string().min(1).max(2000).nullable().default(null),
  createdByAdminId: idSchema,
  createdAt: z.string().min(1), updatedAt: z.string().min(1),
  archivedAt: z.string().min(1).nullable().default(null),
}).strict();

export const createEvidenceBundleRequestSchema = z.object({
  cityCode: cityCodeSchema, intentId: idSchema,
  reviewId: idSchema.nullable().optional().default(null),
  statementId: idSchema.nullable().optional().default(null),
  createdByAdminId: idSchema,
  riskSummary: z.string().min(1).max(2000).nullable().optional().default(null),
}).strict();

export const attachEvidenceRefRequestSchema = evidenceRefSchema;

export const evidenceBundleResponseSchema = z.object({
  ok: z.literal(true), bundle: governanceEvidenceBundleRecordSchema,
}).strict();

export const evidenceBundleListResponseSchema = z.object({
  ok: z.literal(true), bundles: z.array(governanceEvidenceBundleRecordSchema),
}).strict();

export const auditTrailEntrySchema = z.object({
  eventType: z.string().min(1).max(64),
  eventTimestamp: z.string().min(1),
  actorAdminId: idSchema,
  targetType: z.string().min(1).max(32),
  targetId: idSchema,
  cityCode: cityCodeSchema,
  summary: z.string().min(1).max(500),
}).strict();

export const auditTrailResponseSchema = z.object({
  ok: z.literal(true), entries: z.array(auditTrailEntrySchema),
}).strict();

export type EvidenceBundleStatusInput = z.input<typeof evidenceBundleStatusSchema>;
export type GovernanceEvidenceBundleRecordInput = z.input<typeof governanceEvidenceBundleRecordSchema>;
export type CreateEvidenceBundleRequestInput = z.input<typeof createEvidenceBundleRequestSchema>;
