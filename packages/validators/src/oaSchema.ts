import { OA_PERMISSION_KEYS } from "@xlb/types";
import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const oaPermissionKeySchema = z.enum(OA_PERMISSION_KEYS);
export const oaOrganizationIdSchema = z.string().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/u);
export const oaMembershipIdSchema = z.string().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/u);
export const oaIdempotencyKeySchema = z.string().min(8).max(128);
export const oaReasonSchema = z.string().trim().min(2).max(1_000);
export const oaExpectedVersionSchema = z.number().int().nonnegative();

export const oaTaskStatusSchema = z.enum([
  "open",
  "claimed",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
]);
export const oaTaskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const oaApprovalStatusSchema = z.enum([
  "draft",
  "pending",
  "approved",
  "rejected",
  "withdrawn",
  "expired",
]);
export const oaApprovalDecisionSchema = z.enum(["approved", "rejected", "returned"]);

export const oaTaskListQuerySchema = z.object({
  cityCode: cityCodeSchema.optional(),
  status: oaTaskStatusSchema.optional(),
  assignee: z.enum(["me", "all"]).default("me"),
}).strict();

export const createOaTaskRequestSchema = z.object({
  cityCode: cityCodeSchema,
  organizationId: oaOrganizationIdSchema,
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4_000).optional(),
  priority: oaTaskPrioritySchema.default("normal"),
  assigneeMembershipId: oaMembershipIdSchema.optional(),
  dueAt: z.string().datetime().optional(),
  idempotencyKey: oaIdempotencyKeySchema,
  reason: oaReasonSchema,
}).strict();

export const oaTaskActionRequestSchema = z.object({
  expectedVersion: oaExpectedVersionSchema,
  idempotencyKey: oaIdempotencyKeySchema,
  reason: oaReasonSchema,
  assigneeMembershipId: oaMembershipIdSchema.optional(),
  blockedReason: z.string().trim().min(2).max(1_000).optional(),
}).strict();

export const oaApprovalListQuerySchema = z.object({
  cityCode: cityCodeSchema.optional(),
  status: oaApprovalStatusSchema.optional(),
  requestedBy: z.enum(["me", "all"]).default("all"),
}).strict();

export const createOaApprovalRequestSchema = z.object({
  cityCode: cityCodeSchema,
  organizationId: oaOrganizationIdSchema,
  requestType: z.string().trim().min(2).max(64).regex(/^[a-z][a-z0-9_.-]+$/u),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4_000).optional(),
  sourceDomain: z.string().trim().min(2).max(64).regex(/^[a-z][a-z0-9_.-]+$/u).optional(),
  sourceReferenceId: z.string().trim().min(1).max(128).optional(),
  requiredPermission: oaPermissionKeySchema,
  idempotencyKey: oaIdempotencyKeySchema,
  reason: oaReasonSchema,
}).strict();

export const oaApprovalDecisionRequestSchema = z.object({
  expectedVersion: oaExpectedVersionSchema,
  decision: oaApprovalDecisionSchema,
  reason: oaReasonSchema,
  idempotencyKey: oaIdempotencyKeySchema,
}).strict();

export const oaApprovalActionRequestSchema = z.object({
  expectedVersion: oaExpectedVersionSchema,
  reason: oaReasonSchema,
  idempotencyKey: oaIdempotencyKeySchema,
}).strict();

export const oaActivityQuerySchema = z.object({
  cityCode: cityCodeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();

export const oaAuditQuerySchema = z.object({
  cityCode: cityCodeSchema.optional(),
  targetType: z.string().trim().min(1).max(64).optional(),
  targetId: z.string().trim().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
}).strict();

export type CreateOaTaskRequestInput = z.infer<typeof createOaTaskRequestSchema>;
export type OaTaskActionRequestInput = z.infer<typeof oaTaskActionRequestSchema>;
export type CreateOaApprovalRequestInput = z.infer<typeof createOaApprovalRequestSchema>;
export type OaApprovalDecisionRequestInput = z.infer<typeof oaApprovalDecisionRequestSchema>;
export type OaApprovalActionRequestInput = z.infer<typeof oaApprovalActionRequestSchema>;
