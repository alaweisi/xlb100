import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";
import { governanceActionKindSchema, governanceActionStatusSchema } from "./settlementActionIntentSchema.js";

// ══════════════════════════════════════════════════════════════════
// Phase 10C — Governance Intent Persistence Validators
// ══════════════════════════════════════════════════════════════════

const idSchema = z.string().min(1).max(64);

// ── Phase boundary for persisted records ──
export const governanceIntentPhaseBoundarySchema = z.object({
  phase: z.string().min(1),
  governanceOnly: z.literal(true),
  executionEnabled: z.literal(false),
  persistenceEnabled: z.literal(true),
  mutationEnabled: z.literal(false),
}).strict();

// ── Governance Intent Record schema ──
export const governanceIntentRecordSchema = z.object({
  id: idSchema,
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
  phaseBoundary: governanceIntentPhaseBoundarySchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  cancelledAt: z.string().min(1).nullable().default(null),
  archivedAt: z.string().min(1).nullable().default(null),
}).strict();

// ── Create Governance Intent Request schema ──
export const createGovernanceIntentRequestSchema = z.object({
  cityCode: cityCodeSchema,
  statementId: idSchema.nullable().optional().default(null),
  actionKind: governanceActionKindSchema,
  targetType: z.string().min(1).max(64).nullable().optional().default(null),
  targetRef: idSchema.nullable().optional().default(null),
  requestedByAdminId: idSchema,
  requestedReason: z.string().min(1).max(1000),
  evidenceRefs: z.array(z.string().min(1).max(64)).optional().default([]),
  riskFlags: z.array(z.string().min(1).max(100)).optional().default([]),
}).strict().refine(
  (v) => v.statementId || v.targetRef,
  { message: "At least one of statementId or targetRef must be provided" }
);

// ── Governance Intent Response schemas ──
export const governanceIntentResponseSchema = z.object({
  ok: z.literal(true),
  intent: governanceIntentRecordSchema,
}).strict();

export const governanceIntentListResponseSchema = z.object({
  ok: z.literal(true),
  intents: z.array(governanceIntentRecordSchema),
}).strict();

// ── List Query schema ──
export const governanceIntentListQuerySchema = z.object({
  cityCode: z.string().min(1).max(64).optional(),
  statementId: idSchema.optional(),
  actionStatus: governanceActionStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
}).strict();

export type GovernanceIntentPhaseBoundaryInput = z.input<typeof governanceIntentPhaseBoundarySchema>;
export type GovernanceIntentRecordInput = z.input<typeof governanceIntentRecordSchema>;
export type CreateGovernanceIntentRequestInput = z.input<typeof createGovernanceIntentRequestSchema>;
