import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

// ══════════════════════════════════════════════════════════════════
// Phase 10B — Settlement Action Intent Validator
// Governance-only validation. Rejects all execution semantics.
// ══════════════════════════════════════════════════════════════════

const idSchema = z.string().min(1).max(64);

// ── Allowed governance action kinds ──
export const governanceActionKindSchema = z.enum([
  "review_settlement_statement",
  "prepare_payout_review",
  "prepare_refund_review",
  "prepare_reversal_review",
  "request_evidence_review",
  "mark_governance_risk",
]);

// ── Forbidden execution action kinds (explicitly excluded from the enum) ──
const FORBIDDEN_EXECUTION_KINDS = [
  "execute_payout",
  "pay_now",
  "withdraw",
  "execute_refund",
  "reverse_ledger",
  "mutate_settlement",
  "commit_settlement",
  "generate_export_file",
  "execute_payment",
  "provider_withdrawal",
  "refund_reversal_execution",
  "ledger_mutation",
  "payment_execution",
  "settlement_mutation",
  "export_file_generation",
  "download_export",
] as const;

// ── Allowed governance action statuses ──
export const governanceActionStatusSchema = z.enum([
  "draft",
  "ready_for_review",
  "blocked",
  "cancelled",
  "archived",
]);

// ── Forbidden execution statuses ──
const FORBIDDEN_EXECUTION_STATUSES = [
  "paid",
  "refunded",
  "reversed",
  "executed",
  "settled",
  "completed_as_money_movement",
  "payout_completed",
] as const;

// ── Phase boundary schema — must enforce governance-only ──
export const phaseBoundarySchema = z.object({
  phase: z.string().min(1),
  governanceOnly: z.literal(true),
  executionEnabled: z.literal(false),
  persistenceEnabled: z.literal(false),
  mutationEnabled: z.literal(false),
}).strict();

// ── Settlement Action Intent schema ──
export const settlementActionIntentSchema = z.object({
  intentId: idSchema,
  cityCode: cityCodeSchema,
  statementId: idSchema.nullable().default(null),
  actionKind: governanceActionKindSchema,
  actionStatus: governanceActionStatusSchema,
  targetType: z.string().min(1).max(64).nullable().default(null),
  targetRef: idSchema.nullable().default(null),
  requestedByAdminId: idSchema,
  requestedReason: z.string().min(1).max(1000),
  evidenceRefs: z.array(z.string().min(1).max(64)).default([]),
  riskFlags: z.array(z.string().min(1).max(100)).default([]),
  phaseBoundary: phaseBoundarySchema,
  createdAt: z.string().min(1).default(() => new Date().toISOString()),
  updatedAt: z.string().min(1).default(() => new Date().toISOString()),
}).strict().superRefine((value, context) => {
  // ── Validate: action_kind must NOT be a forbidden execution kind ──
  if (FORBIDDEN_EXECUTION_KINDS.includes(value.actionKind as typeof FORBIDDEN_EXECUTION_KINDS[number])) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `action_kind "${value.actionKind}" is a forbidden execution command. Governance intents must use allowed governance action kinds only.`,
      path: ["actionKind"],
    });
  }

  // ── Validate: action_status must NOT be a forbidden execution status ──
  if (FORBIDDEN_EXECUTION_STATUSES.includes(value.actionStatus as typeof FORBIDDEN_EXECUTION_STATUSES[number])) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `action_status "${value.actionStatus}" is a forbidden execution/money-movement status. Governance intents must use allowed governance statuses only.`,
      path: ["actionStatus"],
    });
  }

  // ── Validate: at least one of statementId or targetRef must be provided ──
  if (!value.statementId && !value.targetRef) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one of statementId or targetRef must be provided",
      path: ["statementId"],
    });
  }
});

export type GovernanceActionKindInput = z.input<typeof governanceActionKindSchema>;
export type GovernanceActionStatusInput = z.input<typeof governanceActionStatusSchema>;
export type PhaseBoundaryInput = z.input<typeof phaseBoundarySchema>;
export type SettlementActionIntentInput = z.input<typeof settlementActionIntentSchema>;
