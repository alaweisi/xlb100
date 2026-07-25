import { OA_PERMISSION_KEYS } from "@xlb/types";
import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const oaPermissionKeySchema = z.enum(OA_PERMISSION_KEYS);
export const oaOrganizationIdSchema = z.string().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/u);
export const oaMembershipIdSchema = z.string().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/u);
export const oaRoleIdSchema = z.string().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/u);
export const oaIdempotencyKeySchema = z.string().min(8).max(128);
export const oaReasonSchema = z.string().trim().min(2).max(1_000);
export const oaExpectedVersionSchema = z.number().int().nonnegative();
export const oaLifecycleStatusSchema = z.enum(["active", "suspended", "revoked"]);

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

const oaMutationMetadataSchema = {
  idempotencyKey: oaIdempotencyKeySchema,
  reason: oaReasonSchema,
};

export const createOaOrganizationRequestSchema = z.object({
  organizationCode: z.string().trim().min(2).max(64).regex(/^[a-z][a-z0-9_-]+$/u),
  name: z.string().trim().min(2).max(128),
  parentOrganizationId: oaOrganizationIdSchema,
  cityCodes: z.array(cityCodeSchema).min(1).max(100).transform((values) => [...new Set(values)]),
  ...oaMutationMetadataSchema,
}).strict();

export const updateOaOrganizationRequestSchema = z.object({
  expectedVersion: oaExpectedVersionSchema,
  name: z.string().trim().min(2).max(128).optional(),
  status: oaLifecycleStatusSchema.optional(),
  cityCodes: z.array(cityCodeSchema).min(1).max(100).transform((values) => [...new Set(values)]).optional(),
  ...oaMutationMetadataSchema,
}).strict().refine(
  (value) => value.name !== undefined || value.status !== undefined || value.cityCodes !== undefined,
  { message: "At least one organization change is required" },
);

export const createOaRoleRequestSchema = z.object({
  organizationId: oaOrganizationIdSchema,
  roleKey: z.string().trim().min(2).max(64).regex(/^[a-z][a-z0-9_.-]+$/u),
  name: z.string().trim().min(2).max(128),
  permissions: z.array(oaPermissionKeySchema).min(1).max(OA_PERMISSION_KEYS.length)
    .transform((values) => [...new Set(values)]),
  ...oaMutationMetadataSchema,
}).strict();

export const updateOaRoleRequestSchema = z.object({
  expectedVersion: oaExpectedVersionSchema,
  name: z.string().trim().min(2).max(128).optional(),
  status: oaLifecycleStatusSchema.optional(),
  permissions: z.array(oaPermissionKeySchema).min(1).max(OA_PERMISSION_KEYS.length)
    .transform((values) => [...new Set(values)]).optional(),
  ...oaMutationMetadataSchema,
}).strict().refine(
  (value) => value.name !== undefined || value.status !== undefined || value.permissions !== undefined,
  { message: "At least one role change is required" },
);

export const createOaMembershipRequestSchema = z.object({
  organizationId: oaOrganizationIdSchema,
  adminUserId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/u),
  roleIds: z.array(oaRoleIdSchema).min(1).max(32).transform((values) => [...new Set(values)]),
  ...oaMutationMetadataSchema,
}).strict();

export const updateOaMembershipRequestSchema = z.object({
  expectedAuthzVersion: oaExpectedVersionSchema,
  status: oaLifecycleStatusSchema.optional(),
  roleIds: z.array(oaRoleIdSchema).min(1).max(32).transform((values) => [...new Set(values)]).optional(),
  ...oaMutationMetadataSchema,
}).strict().refine(
  (value) => value.status !== undefined || value.roleIds !== undefined,
  { message: "At least one membership change is required" },
);

export const createOaDelegationRequestSchema = z.object({
  granteeOrganizationId: oaOrganizationIdSchema,
  cityCode: cityCodeSchema,
  permissionKey: oaPermissionKeySchema,
  validTo: z.string().datetime().optional(),
  ...oaMutationMetadataSchema,
}).strict();

export const revokeOaDelegationRequestSchema = z.object({
  expectedVersion: oaExpectedVersionSchema,
  ...oaMutationMetadataSchema,
}).strict();
export const approveOaDelegationRequestSchema = revokeOaDelegationRequestSchema;

export const createOaAdminHandoffRequestSchema = z.object({
  targetPath: z.string().min(3).max(160).regex(/^\/admin\/#\/[a-z0-9/-]*$/u),
  permissionKey: oaPermissionKeySchema,
  cityCode: cityCodeSchema,
}).strict();

export const exchangeOaAdminHandoffRequestSchema = z.object({
  ticket: z.string().length(43).regex(/^[A-Za-z0-9_-]{43}$/u),
}).strict();

export type CreateOaTaskRequestInput = z.infer<typeof createOaTaskRequestSchema>;
export type OaTaskActionRequestInput = z.infer<typeof oaTaskActionRequestSchema>;
export type CreateOaApprovalRequestInput = z.infer<typeof createOaApprovalRequestSchema>;
export type OaApprovalDecisionRequestInput = z.infer<typeof oaApprovalDecisionRequestSchema>;
export type OaApprovalActionRequestInput = z.infer<typeof oaApprovalActionRequestSchema>;
export type CreateOaOrganizationRequestInput = z.infer<typeof createOaOrganizationRequestSchema>;
export type UpdateOaOrganizationRequestInput = z.infer<typeof updateOaOrganizationRequestSchema>;
export type CreateOaRoleRequestInput = z.infer<typeof createOaRoleRequestSchema>;
export type UpdateOaRoleRequestInput = z.infer<typeof updateOaRoleRequestSchema>;
export type CreateOaMembershipRequestInput = z.infer<typeof createOaMembershipRequestSchema>;
export type UpdateOaMembershipRequestInput = z.infer<typeof updateOaMembershipRequestSchema>;
export type CreateOaDelegationRequestInput = z.infer<typeof createOaDelegationRequestSchema>;
export type RevokeOaDelegationRequestInput = z.infer<typeof revokeOaDelegationRequestSchema>;
export type ApproveOaDelegationRequestInput = z.infer<typeof approveOaDelegationRequestSchema>;
export type CreateOaAdminHandoffRequestInput = z.infer<typeof createOaAdminHandoffRequestSchema>;
export type ExchangeOaAdminHandoffRequestInput = z.infer<typeof exchangeOaAdminHandoffRequestSchema>;
