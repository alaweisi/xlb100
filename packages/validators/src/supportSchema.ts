import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

const idSchema = z.string().trim().min(1).max(64);
const idempotencyKeySchema = z.string().trim().min(8).max(128);
const timestampSchema = z.string().datetime({ offset: true });

export const supportTicketSourceSchema = z.enum([
  "customer", "worker", "enterprise", "admin", "system",
]);
export const supportTicketTypeSchema = z.enum([
  "order_question", "order_dispute", "service_complaint", "withdrawal_issue",
  "account_issue", "safety", "other",
]);
export const supportTicketPrioritySchema = z.enum([
  "low", "normal", "high", "urgent", "critical",
]);
export const supportTicketStatusSchema = z.enum([
  "open", "processing", "waiting_requester", "escalated", "resolved", "closed",
]);
export const supportTicketEventTypeSchema = z.enum([
  "created", "commented", "assigned", "claimed", "status_changed", "escalated", "resolved",
  "reopened", "closed", "sla_breached",
]);
export const supportSlaBreachKindSchema = z.enum(["first_response", "resolution"]);
export const supportTicketWorkbenchViewSchema = z.enum(["mine", "skill_group", "all"]);
export const supportTicketWorkbenchSortSchema = z.literal("sla_due");
export const supportTicketActorTypeSchema = z.enum([
  "customer", "worker", "admin", "operator", "system", "bot",
]);
export const supportTicketEventVisibilitySchema = z.enum(["requester", "internal", "all"]);

export const supportTicketSchema = z.object({
  ticketId: idSchema,
  cityCode: cityCodeSchema,
  source: supportTicketSourceSchema,
  requesterId: idSchema,
  businessClientId: idSchema.nullable(),
  type: supportTicketTypeSchema,
  priority: supportTicketPrioritySchema,
  status: supportTicketStatusSchema,
  subject: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(10_000),
  relatedOrderId: idSchema.nullable(),
  relatedWorkerId: idSchema.nullable(),
  linkedAftersaleComplaintId: idSchema.nullable(),
  assignedAgentId: idSchema.nullable(),
  assignedSkillGroupId: idSchema.nullable(),
  routingLanguage: z.string().trim().min(2).max(32)
    .regex(/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/).nullable(),
  slaFirstResponseDueAt: timestampSchema.nullable(),
  slaResolutionDueAt: timestampSchema.nullable(),
  firstRespondedAt: timestampSchema.nullable(),
  slaFirstResponseBreachedAt: timestampSchema.nullable(),
  slaResolutionBreachedAt: timestampSchema.nullable(),
  resolvedAt: timestampSchema.nullable(),
  closedAt: timestampSchema.nullable(),
  resolutionCode: z.string().trim().min(1).max(64).nullable(),
  version: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict().superRefine((ticket, context) => {
  if ((ticket.source === "enterprise") !== (ticket.businessClientId !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["businessClientId"], message: "businessClientId is required only for enterprise tickets" });
  }
  if (ticket.linkedAftersaleComplaintId !== null && ticket.relatedOrderId === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedAftersaleComplaintId"], message: "a linked aftersale complaint requires relatedOrderId" });
  }
  const isResolved = ticket.status === "resolved" || ticket.status === "closed";
  if (isResolved && (ticket.resolvedAt === null || ticket.resolutionCode === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["resolutionCode"], message: "resolved and closed tickets require resolution metadata" });
  }
  if (!isResolved && (ticket.resolvedAt !== null || ticket.resolutionCode !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["resolvedAt"], message: "active tickets cannot expose resolution metadata" });
  }
  if ((ticket.status === "closed") !== (ticket.closedAt !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["closedAt"], message: "closedAt must be present only for closed tickets" });
  }
});

export const supportTicketEventSchema = z.object({
  ticketEventId: idSchema,
  cityCode: cityCodeSchema,
  ticketId: idSchema,
  eventType: supportTicketEventTypeSchema,
  actorType: supportTicketActorTypeSchema,
  actorId: idSchema.nullable(),
  visibility: supportTicketEventVisibilitySchema,
  content: z.string().trim().min(1).max(10_000).nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: timestampSchema,
}).strict().superRefine((event, context) => {
  if (!(["system", "bot"] as const).includes(event.actorType as "system" | "bot") && event.actorId === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["actorId"], message: "human actors require actorId" });
  }
});

export const supportTicketDetailSchema = z.object({
  ticket: supportTicketSchema,
  events: z.array(supportTicketEventSchema).max(1_000),
}).strict();

export const createSupportTicketRequestSchema = z.object({
  type: supportTicketTypeSchema,
  priority: supportTicketPrioritySchema,
  subject: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(10_000),
  relatedOrderId: idSchema.optional(),
  relatedWorkerId: idSchema.optional(),
  linkedAftersaleComplaintId: idSchema.optional(),
  preferredLanguage: z.string().trim().min(2).max(32)
    .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/)
    .transform((language) => language.toLowerCase()).optional(),
  idempotencyKey: idempotencyKeySchema,
}).strict().superRefine((request, context) => {
  if (request.linkedAftersaleComplaintId !== undefined && request.relatedOrderId === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["linkedAftersaleComplaintId"], message: "a linked aftersale complaint requires relatedOrderId" });
  }
});

export const addSupportTicketCommentRequestSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  idempotencyKey: idempotencyKeySchema,
}).strict();

export const adminAddSupportTicketCommentRequestSchema = addSupportTicketCommentRequestSchema.extend({
  visibility: supportTicketEventVisibilitySchema,
}).strict();

export const reopenSupportTicketRequestSchema = z.object({
  reason: z.string().trim().min(1).max(2_000).optional(),
  idempotencyKey: idempotencyKeySchema,
}).strict();

export const assignSupportTicketRequestSchema = z.object({
  assignedAgentId: idSchema,
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: idempotencyKeySchema,
}).strict();

export const claimSupportTicketRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: idempotencyKeySchema,
}).strict();

export const escalateSupportTicketRequestSchema = z.object({
  reason: z.string().trim().min(1).max(2_000),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: idempotencyKeySchema,
}).strict();

export const resolveSupportTicketRequestSchema = z.object({
  resolutionCode: z.string().trim().min(1).max(64),
  resolutionNote: z.string().trim().min(1).max(5_000).optional(),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: idempotencyKeySchema,
}).strict();

export const closeSupportTicketRequestSchema = z.object({
  reason: z.string().trim().min(1).max(2_000).optional(),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: idempotencyKeySchema,
}).strict();

export const supportTicketListFiltersSchema = z.object({
  source: supportTicketSourceSchema.optional(),
  type: supportTicketTypeSchema.optional(),
  priority: supportTicketPrioritySchema.optional(),
  status: supportTicketStatusSchema.optional(),
  requesterId: idSchema.optional(),
  relatedOrderId: idSchema.optional(),
  assignedAgentId: idSchema.optional(),
  view: supportTicketWorkbenchViewSchema.optional(),
  sort: supportTicketWorkbenchSortSchema.optional(),
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

export const supportTicketResponseSchema = z.object({ ok: z.literal(true), ticket: supportTicketSchema }).strict();
export const supportTicketDetailResponseSchema = z.object({ ok: z.literal(true), detail: supportTicketDetailSchema }).strict();
export const supportTicketListResponseSchema = z.object({
  ok: z.literal(true), tickets: z.array(supportTicketSchema).max(100), nextCursor: z.string().max(512).nullable(),
}).strict();
export const supportTicketMutationResponseSchema = supportTicketResponseSchema.extend({
  event: supportTicketEventSchema,
  idempotent: z.boolean(),
}).strict();

export const supportTicketOutboxEventPayloadSchema = z.object({
  ticketId: idSchema,
  cityCode: cityCodeSchema,
  source: supportTicketSourceSchema,
  type: supportTicketTypeSchema,
  priority: supportTicketPrioritySchema,
  status: supportTicketStatusSchema,
  requesterId: idSchema,
  actorId: idSchema.nullable(),
  version: z.number().int().nonnegative(),
  occurredAt: timestampSchema,
}).strict();

export const supportSlaBreachedOutboxEventPayloadSchema = z.object({
  ticketId: idSchema,
  cityCode: cityCodeSchema,
  breachKind: supportSlaBreachKindSchema,
  dueAt: timestampSchema,
  oldPriority: supportTicketPrioritySchema,
  newPriority: supportTicketPrioritySchema,
  version: z.number().int().positive(),
}).strict();

export const supportAgentLifecycleStatusSchema = z.enum(["active", "suspended"]);
export const supportAgentWorkStatusSchema = z.enum(["offline", "online", "busy"]);

const supportLanguageTagSchema = z.string().trim().min(2).max(35)
  .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/, "invalid language tag");
const supportMatchedTypesSchema = z.array(supportTicketTypeSchema).min(1).max(7)
  .refine((values) => new Set(values).size === values.length, "matchedTypes must not contain duplicates");
const supportMatchedLanguagesSchema = z.array(supportLanguageTagSchema).max(16)
  .refine((values) => new Set(values.map((value) => value.toLowerCase())).size === values.length,
    "matchedLanguages must not contain case-insensitive duplicates");
const positiveVersionSchema = z.number().int().positive();

export const supportAgentSchema = z.object({
  agentId: idSchema,
  cityCode: cityCodeSchema,
  adminUserId: idSchema,
  displayName: z.string().trim().min(1).max(128),
  lifecycleStatus: supportAgentLifecycleStatusSchema,
  workStatus: supportAgentWorkStatusSchema,
  version: positiveVersionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();

export const supportSkillGroupSchema = z.object({
  skillGroupId: idSchema,
  cityCode: cityCodeSchema,
  name: z.string().trim().min(1).max(128),
  matchedTypes: supportMatchedTypesSchema,
  matchedLanguages: supportMatchedLanguagesSchema,
  priorityWeight: z.number().int().min(-1000).max(1000),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  version: positiveVersionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict().superRefine((group, context) => {
  if (group.isDefault && group.matchedLanguages.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["matchedLanguages"], message: "default groups must be language neutral" });
  }
});

export const supportAgentSkillGroupMembershipSchema = z.object({
  cityCode: cityCodeSchema,
  agentId: idSchema,
  skillGroupId: idSchema,
  proficiency: z.number().int().min(0).max(100),
  isPrimary: z.boolean(),
  isActive: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();

export const createSupportAgentRequestSchema = z.object({
  adminUserId: idSchema,
  displayName: z.string().trim().min(1).max(128),
  lifecycleStatus: supportAgentLifecycleStatusSchema.optional(),
  workStatus: supportAgentWorkStatusSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
}).strict();

export const updateSupportAgentRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(128).optional(),
  lifecycleStatus: supportAgentLifecycleStatusSchema.optional(),
  workStatus: supportAgentWorkStatusSchema.optional(),
  expectedVersion: positiveVersionSchema,
  idempotencyKey: idempotencyKeySchema,
}).strict().refine(
  (value) => value.displayName !== undefined || value.lifecycleStatus !== undefined || value.workStatus !== undefined,
  "at least one agent field must be updated",
);

export const deleteSupportAgentRequestSchema = z.object({
  expectedVersion: positiveVersionSchema,
  idempotencyKey: idempotencyKeySchema,
}).strict();

export const supportAgentListFiltersSchema = z.object({
  lifecycleStatus: supportAgentLifecycleStatusSchema.optional(),
  workStatus: supportAgentWorkStatusSchema.optional(),
  adminUserId: idSchema.optional(),
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

export const createSupportSkillGroupRequestSchema = z.object({
  name: z.string().trim().min(1).max(128),
  matchedTypes: supportMatchedTypesSchema,
  matchedLanguages: supportMatchedLanguagesSchema,
  priorityWeight: z.number().int().min(-1000).max(1000).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  idempotencyKey: idempotencyKeySchema,
}).strict().superRefine((group, context) => {
  if (group.isDefault === true && group.matchedLanguages.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["matchedLanguages"], message: "default groups must be language neutral" });
  }
});

export const updateSupportSkillGroupRequestSchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  matchedTypes: supportMatchedTypesSchema.optional(),
  matchedLanguages: supportMatchedLanguagesSchema.optional(),
  priorityWeight: z.number().int().min(-1000).max(1000).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  expectedVersion: positiveVersionSchema,
  idempotencyKey: idempotencyKeySchema,
}).strict().superRefine((group, context) => {
  if (group.isDefault === true && group.matchedLanguages !== undefined && group.matchedLanguages.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["matchedLanguages"], message: "default groups must be language neutral" });
  }
  if ([group.name, group.matchedTypes, group.matchedLanguages, group.priorityWeight,
    group.isDefault, group.isActive].every((value) => value === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "at least one skill-group field must be updated" });
  }
});

export const deleteSupportSkillGroupRequestSchema = deleteSupportAgentRequestSchema;

export const supportSkillGroupListFiltersSchema = z.object({
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

export const addSupportAgentSkillGroupRequestSchema = z.object({
  skillGroupId: idSchema,
  proficiency: z.number().int().min(0).max(100).optional(),
  isPrimary: z.boolean().optional(),
  expectedAgentVersion: positiveVersionSchema,
  idempotencyKey: idempotencyKeySchema,
}).strict();

export const removeSupportAgentSkillGroupRequestSchema = z.object({
  expectedAgentVersion: positiveVersionSchema,
  idempotencyKey: idempotencyKeySchema,
}).strict();

export const supportAgentResponseSchema = z.object({ ok: z.literal(true), agent: supportAgentSchema }).strict();
export const supportAgentListResponseSchema = z.object({
  ok: z.literal(true), agents: z.array(supportAgentSchema).max(100), nextCursor: z.string().max(512).nullable(),
}).strict();
export const supportSkillGroupResponseSchema = z.object({
  ok: z.literal(true), skillGroup: supportSkillGroupSchema,
}).strict();
export const supportSkillGroupListResponseSchema = z.object({
  ok: z.literal(true), skillGroups: z.array(supportSkillGroupSchema).max(100), nextCursor: z.string().max(512).nullable(),
}).strict();
export const supportAgentSkillGroupResponseSchema = supportAgentResponseSchema.extend({
  membership: supportAgentSkillGroupMembershipSchema,
}).strict();
export const supportAgentSkillGroupListResponseSchema = z.object({
  ok: z.literal(true),
  memberships: z.array(supportAgentSkillGroupMembershipSchema).max(1_000),
}).strict();
export const removeSupportAgentSkillGroupResponseSchema = supportAgentResponseSchema.extend({
  removedSkillGroupId: idSchema,
}).strict();

export const supportSlaPolicySchema = z.object({
  policyId: idSchema,
  policySeriesId: idSchema,
  revision: z.number().int().positive(),
  supersedesPolicyId: idSchema.nullable(),
  cityCode: cityCodeSchema,
  type: supportTicketTypeSchema,
  priority: supportTicketPrioritySchema,
  firstResponseMinutes: z.number().int().min(1).max(525_600),
  resolutionMinutes: z.number().int().min(1).max(525_600),
  effectiveFrom: timestampSchema,
  effectiveTo: timestampSchema.nullable(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict().superRefine((policy, context) => {
  if (policy.resolutionMinutes < policy.firstResponseMinutes) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["resolutionMinutes"], message: "resolutionMinutes cannot be shorter than firstResponseMinutes" });
  }
  if (policy.effectiveTo !== null && Date.parse(policy.effectiveTo) <= Date.parse(policy.effectiveFrom)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["effectiveTo"], message: "effectiveTo must be after effectiveFrom" });
  }
  if ((policy.revision === 1) !== (policy.supersedesPolicyId === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["supersedesPolicyId"], message: "only the first revision may omit supersedesPolicyId" });
  }
});

export const createSupportSlaPolicyRequestSchema = z.object({
  type: supportTicketTypeSchema,
  priority: supportTicketPrioritySchema,
  firstResponseMinutes: z.number().int().min(1).max(525_600),
  resolutionMinutes: z.number().int().min(1).max(525_600),
  effectiveFrom: timestampSchema.optional(),
  effectiveTo: timestampSchema.optional(),
  isActive: z.boolean().optional(),
  idempotencyKey: idempotencyKeySchema,
}).strict().superRefine((policy, context) => {
  if (policy.resolutionMinutes < policy.firstResponseMinutes) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["resolutionMinutes"], message: "resolutionMinutes cannot be shorter than firstResponseMinutes" });
  }
  if (policy.effectiveFrom !== undefined && policy.effectiveTo !== undefined && Date.parse(policy.effectiveTo) <= Date.parse(policy.effectiveFrom)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["effectiveTo"], message: "effectiveTo must be after effectiveFrom" });
  }
  if (policy.type === "other" && policy.priority === "normal"
    && policy.isActive !== false && policy.effectiveTo !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "an active fallback SLA policy cannot have a finite effectiveTo",
    });
  }
});

export const reviseSupportSlaPolicyRequestSchema = z.object({
  firstResponseMinutes: z.number().int().min(1).max(525_600).optional(),
  resolutionMinutes: z.number().int().min(1).max(525_600).optional(),
  effectiveFrom: timestampSchema.optional(),
  effectiveTo: timestampSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: idempotencyKeySchema,
}).strict().refine((request) => ["firstResponseMinutes", "resolutionMinutes", "effectiveFrom", "effectiveTo", "isActive"].some((field) => Object.prototype.hasOwnProperty.call(request, field)), {
  message: "at least one policy field is required",
});

export const updateSupportSlaPolicyRequestSchema = reviseSupportSlaPolicyRequestSchema;

export const supportSlaPolicyListFiltersSchema = z.object({
  type: supportTicketTypeSchema.optional(),
  priority: supportTicketPrioritySchema.optional(),
  isActive: z.boolean().optional(),
  effectiveAt: timestampSchema.optional(),
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

export const supportSlaPolicyResponseSchema = z.object({
  ok: z.literal(true),
  policy: supportSlaPolicySchema,
}).strict();

export const supportSlaPolicyListResponseSchema = z.object({
  ok: z.literal(true),
  policies: z.array(supportSlaPolicySchema).max(100),
  nextCursor: z.string().nullable(),
}).strict();

export type SupportTicketInput = z.infer<typeof supportTicketSchema>;
export type SupportTicketEventInput = z.infer<typeof supportTicketEventSchema>;
export type CreateSupportTicketRequestInput = z.infer<typeof createSupportTicketRequestSchema>;
export type ClaimSupportTicketRequestInput = z.infer<typeof claimSupportTicketRequestSchema>;
export type SupportTicketListFiltersInput = z.infer<typeof supportTicketListFiltersSchema>;
export type SupportAgentInput = z.infer<typeof supportAgentSchema>;
export type SupportSlaPolicyInput = z.infer<typeof supportSlaPolicySchema>;
export type CreateSupportSlaPolicyRequestInput = z.infer<typeof createSupportSlaPolicyRequestSchema>;
export type ReviseSupportSlaPolicyRequestInput = z.infer<typeof reviseSupportSlaPolicyRequestSchema>;
export type UpdateSupportSlaPolicyRequestInput = ReviseSupportSlaPolicyRequestInput;
export type SupportSkillGroupInput = z.infer<typeof supportSkillGroupSchema>;
export type SupportAgentSkillGroupMembershipInput = z.infer<typeof supportAgentSkillGroupMembershipSchema>;
export type CreateSupportAgentRequestInput = z.infer<typeof createSupportAgentRequestSchema>;
export type UpdateSupportAgentRequestInput = z.infer<typeof updateSupportAgentRequestSchema>;
export type CreateSupportSkillGroupRequestInput = z.infer<typeof createSupportSkillGroupRequestSchema>;
export type UpdateSupportSkillGroupRequestInput = z.infer<typeof updateSupportSkillGroupRequestSchema>;
