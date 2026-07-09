import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

// ══════════════════════════════════════════════════════════════════
// Phase 10D — Governance Review Workflow Validators
// ══════════════════════════════════════════════════════════════════

const idSchema = z.string().min(1).max(64);

export const governanceReviewStatusSchema = z.enum([
  "pending_review",
  "approved_for_governance",
  "rejected_for_governance",
  "changes_requested",
  "cancelled",
  "archived",
]);

export const governanceReviewDecisionSchema = z.enum([
  "approve_governance",
  "reject_governance",
  "request_changes",
  "cancel_review",
  "archive_review",
]);

export const governanceReviewRecordSchema = z.object({
  id: idSchema,
  cityCode: cityCodeSchema,
  intentId: idSchema,
  reviewStatus: governanceReviewStatusSchema,
  reviewDecision: governanceReviewDecisionSchema.nullable().default(null),
  submittedByAdminId: idSchema,
  reviewedByAdminId: idSchema.nullable().default(null),
  reviewNote: z.string().min(1).max(1000).nullable().default(null),
  rejectionReason: z.string().min(1).max(1000).nullable().default(null),
  changesRequestedNote: z.string().min(1).max(1000).nullable().default(null),
  submittedAt: z.string().min(1),
  reviewedAt: z.string().min(1).nullable().default(null),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const submitReviewRequestSchema = z.object({
  cityCode: cityCodeSchema,
  intentId: idSchema,
  submittedByAdminId: idSchema.optional(),
  reviewNote: z.string().min(1).max(1000).nullable().optional().default(null),
}).strict();

export const reviewDecisionRequestSchema = z.object({
  reviewDecision: governanceReviewDecisionSchema,
  reviewedByAdminId: idSchema.optional(),
  reviewNote: z.string().min(1).max(1000).nullable().optional().default(null),
  rejectionReason: z.string().min(1).max(1000).nullable().optional().default(null),
  changesRequestedNote: z.string().min(1).max(1000).nullable().optional().default(null),
}).strict();

export const governanceReviewResponseSchema = z.object({
  ok: z.literal(true),
  review: governanceReviewRecordSchema,
}).strict();

export const governanceReviewListResponseSchema = z.object({
  ok: z.literal(true),
  reviews: z.array(governanceReviewRecordSchema),
}).strict();

export type GovernanceReviewStatusInput = z.input<typeof governanceReviewStatusSchema>;
export type GovernanceReviewDecisionInput = z.input<typeof governanceReviewDecisionSchema>;
export type GovernanceReviewRecordInput = z.input<typeof governanceReviewRecordSchema>;
export type SubmitReviewRequestInput = z.input<typeof submitReviewRequestSchema>;
export type ReviewDecisionRequestInput = z.input<typeof reviewDecisionRequestSchema>;
