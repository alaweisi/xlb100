import { z } from "zod"; import { cityCodeSchema } from "./cityCodeSchema.js";
const idSchema = z.string().min(1).max(64);

export const readinessPacketStatusSchema = z.enum(["draft","checks_pending","blocked","ready_for_future_phase_review","archived"]);

const executionBoundarySchema = z.object({
  governanceOnly: z.literal(true), executionEnabled: z.literal(false), mutationEnabled: z.literal(false),
  payoutEnabled: z.literal(false), refundExecutionEnabled: z.literal(false), ledgerMutationEnabled: z.literal(false),
  settlementMutationEnabled: z.literal(false), fileGenerationEnabled: z.literal(false), downloadEnabled: z.literal(false), providerDispatchEnabled: z.literal(false),
}).strict();

const dryRunGuardSchema = z.object({
  dryRunMode: z.literal("governance_guard_only"), executionSimulationEnabled: z.literal(false), moneyMovementSimulationEnabled: z.literal(false),
  providerSimulationEnabled: z.literal(false), ledgerSimulationEnabled: z.literal(false), refundSimulationEnabled: z.literal(false), fileGenerationSimulationEnabled: z.literal(false),
  guardReason: z.string().min(1).max(500), nextAllowedPhase: z.string().min(1).max(100),
}).strict();

export const governanceReadinessPacketRecordSchema = z.object({
  id: idSchema, cityCode: cityCodeSchema, intentId: idSchema, reviewId: idSchema.nullable().default(null),
  evidenceBundleId: idSchema.nullable().default(null), statementId: idSchema.nullable().default(null),
  packetStatus: readinessPacketStatusSchema,
  readinessChecks: z.record(z.boolean()).default({}), blockerFlags: z.array(z.string()).default([]), riskFlags: z.array(z.string()).default([]),
  sourceRefs: z.array(z.string()).default([]), dryRunGuard: dryRunGuardSchema, executionBoundary: executionBoundarySchema,
  createdByAdminId: idSchema, createdAt: z.string().min(1), updatedAt: z.string().min(1), archivedAt: z.string().min(1).nullable().default(null),
}).strict();

export const createReadinessPacketRequestSchema = z.object({
  cityCode: cityCodeSchema, intentId: idSchema, reviewId: idSchema.nullable().optional().default(null),
  evidenceBundleId: idSchema.nullable().optional().default(null), statementId: idSchema.nullable().optional().default(null), createdByAdminId: idSchema.optional(),
}).strict();

export const readinessPacketResponseSchema = z.object({ ok: z.literal(true), packet: governanceReadinessPacketRecordSchema }).strict();
export const readinessPacketListResponseSchema = z.object({ ok: z.literal(true), packets: z.array(governanceReadinessPacketRecordSchema) }).strict();

export type ReadinessPacketStatusInput = z.input<typeof readinessPacketStatusSchema>;
export type CreateReadinessPacketRequestInput = z.input<typeof createReadinessPacketRequestSchema>;
