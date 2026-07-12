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

export const supportConversationSourceSchema = z.enum(["customer", "worker", "enterprise"]);
export const supportConversationStatusSchema = z.enum(["queueing", "active", "transferred", "closed"]);
export const supportConversationParticipantTypeSchema = z.enum(["customer", "worker", "agent"]);
export const supportMessageSenderTypeSchema = z.enum(["customer", "worker", "agent", "system"]);
export const supportMessageTypeSchema = z.enum(["text", "image", "system"]);

export const supportConversationSchema = z.object({
  conversationId: idSchema, cityCode: cityCodeSchema, source: supportConversationSourceSchema,
  requesterId: idSchema, businessClientId: idSchema.nullable(), status: supportConversationStatusSchema,
  assignedAgentId: idSchema.nullable(), linkedTicketId: idSchema.nullable(),
  lastServerSeq: z.number().int().nonnegative(), version: z.number().int().positive(),
  startedAt: timestampSchema, acceptedAt: timestampSchema.nullable(), transferredAt: timestampSchema.nullable(),
  closedAt: timestampSchema.nullable(), createdAt: timestampSchema, updatedAt: timestampSchema,
}).strict().superRefine((value, context) => {
  if ((value.source === "enterprise") !== (value.businessClientId !== null)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["businessClientId"], message: "enterprise conversations require businessClientId" });
  if ((value.status === "closed") !== (value.closedAt !== null)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["closedAt"], message: "closedAt is required only for closed conversations" });
  if (value.status === "active" && value.acceptedAt === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["acceptedAt"], message: "active conversations require acceptedAt" });
});

export const supportMessageSchema = z.object({
  messageId: idSchema, cityCode: cityCodeSchema, conversationId: idSchema,
  senderType: supportMessageSenderTypeSchema, senderId: idSchema.nullable(), clientMessageId: idempotencyKeySchema,
  serverSeq: z.number().int().positive(), messageType: supportMessageTypeSchema,
  textContent: z.string().min(1).max(4000).nullable(), mediaAssetId: idSchema.nullable(), createdAt: timestampSchema,
}).strict().superRefine((value, context) => {
  if (value.senderType !== "system" && value.senderId === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["senderId"], message: "human senders require senderId" });
  if (value.messageType === "text" && (value.textContent === null || value.mediaAssetId !== null)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["textContent"], message: "text messages require text only" });
  if (value.messageType === "image" && (value.mediaAssetId === null || value.textContent !== null)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["mediaAssetId"], message: "image messages require media only" });
  if (value.messageType === "system" && value.senderType !== "system") context.addIssue({ code: z.ZodIssueCode.custom, path: ["senderType"], message: "system messages require system sender" });
});

export const createSupportConversationRequestSchema = z.object({ linkedTicketId: idSchema.optional(), idempotencyKey: idempotencyKeySchema }).strict();
export const sendSupportMessageRequestSchema = z.object({
  clientMessageId: idempotencyKeySchema, messageType: z.enum(["text", "image"]),
  textContent: z.string().trim().min(1).max(4000).optional(), mediaAssetId: idSchema.optional(), idempotencyKey: idempotencyKeySchema,
}).strict().superRefine((value, context) => {
  if (value.messageType === "text" && (value.textContent === undefined || value.mediaAssetId !== undefined)) context.addIssue({ code: z.ZodIssueCode.custom, message: "text messages require textContent only" });
  if (value.messageType === "image" && (value.mediaAssetId === undefined || value.textContent !== undefined)) context.addIssue({ code: z.ZodIssueCode.custom, message: "image messages require mediaAssetId only" });
});
export const markSupportConversationReadRequestSchema = z.object({ lastReadServerSeq: z.number().int().nonnegative(), expectedVersion: z.number().int().positive(), idempotencyKey: idempotencyKeySchema }).strict();
export const acceptSupportConversationRequestSchema = z.object({ expectedVersion: z.number().int().positive(), idempotencyKey: idempotencyKeySchema }).strict();
export const transferSupportConversationRequestSchema = acceptSupportConversationRequestSchema.extend({ assignedAgentId: idSchema }).strict();
export const closeSupportConversationRequestSchema = acceptSupportConversationRequestSchema.extend({ reason: z.string().trim().min(1).max(2000).optional() }).strict();
export const supportConversationListFiltersSchema = z.object({ status: supportConversationStatusSchema.optional(), view: z.enum(["mine", "queue", "all"]).optional(), cursor: z.string().min(1).max(512).optional(), limit: z.number().int().min(1).max(100).optional() }).strict();
export const supportMessageListFiltersSchema = z.object({ afterSeq: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(100).optional() }).strict();
export const supportConversationResponseSchema = z.object({ ok: z.literal(true), conversation: supportConversationSchema }).strict();
export const supportConversationListResponseSchema = z.object({ ok: z.literal(true), conversations: z.array(supportConversationSchema).max(100), nextCursor: z.string().max(512).nullable() }).strict();
export const supportConversationDetailResponseSchema = z.object({ ok: z.literal(true), conversation: supportConversationSchema, messages: z.array(supportMessageSchema).max(100) }).strict();
export const supportMessageResponseSchema = z.object({ ok: z.literal(true), message: supportMessageSchema, idempotent: z.boolean() }).strict();
export const supportMessageListResponseSchema = z.object({ ok: z.literal(true), messages: z.array(supportMessageSchema).max(100), nextAfterSeq: z.number().int().nonnegative().nullable(), hasMore: z.boolean() }).strict();
export const supportRealtimeTicketResponseSchema = z.object({ ok: z.literal(true), ticket: z.string().min(32).max(256), expiresAt: timestampSchema }).strict();

const realtimeBase = { protocolVersion: z.literal(1), requestId: idSchema };
export const supportRealtimeClientFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subscribe"), ...realtimeBase, conversationId: idSchema, afterSeq: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("send_message"), ...realtimeBase, conversationId: idSchema, clientMessageId: idempotencyKeySchema, messageType: z.enum(["text", "image"]), textContent: z.string().min(1).max(4000).optional(), mediaAssetId: idSchema.optional() }).strict(),
  z.object({ type: z.literal("mark_read"), ...realtimeBase, conversationId: idSchema, lastReadServerSeq: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("ping"), ...realtimeBase }).strict(),
]).superRefine((frame, context) => {
  if (frame.type !== "send_message") return;
  if (frame.messageType === "text" && (frame.textContent === undefined || frame.mediaAssetId !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "text frames require textContent only" });
  }
  if (frame.messageType === "image" && (frame.mediaAssetId === undefined || frame.textContent !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "image frames require mediaAssetId only" });
  }
});

export const supportKbArticleStatusSchema = z.enum(["draft", "published", "archived"]);
export const supportKbReviewStatusSchema = z.enum(["draft", "pending_review", "approved", "rejected"]);
export const supportKbReviewActionSchema = z.enum(["submitted", "approved", "rejected", "published", "archived"]);
const kbTermsSchema = z.array(z.string().trim().min(1).max(64).transform(value => value.toLowerCase())).max(32)
  .refine(values => new Set(values).size === values.length, "knowledge terms must be unique");
const safeMarkdownSchema = z.string().trim().min(1).max(50_000).refine(value => !/<\/?(?:script|iframe|object|embed|style|form)\b|javascript\s*:|!\[[^\]]*\]\(\s*https?:\/\//iu.test(value), "unsafe knowledge markdown");
export const supportKbArticleSchema = z.object({ articleId:idSchema,cityCode:cityCodeSchema,slug:z.string().regex(/^[a-z0-9][a-z0-9_-]{1,127}$/),language:z.string().regex(/^[a-z]{2,8}(?:-[a-z0-9]{2,8}){0,3}$/),lifecycleStatus:supportKbArticleStatusSchema,currentDraftVersionId:idSchema.nullable(),publishedVersionId:idSchema.nullable(),version:z.number().int().positive(),createdByAdminId:idSchema }).strict();
export const supportKbArticleVersionSchema = z.object({ articleVersionId:idSchema,cityCode:cityCodeSchema,articleId:idSchema,revision:z.number().int().positive(),title:z.string().min(1).max(200),summary:z.string().max(500).nullable(),bodyMarkdown:safeMarkdownSchema,keywords:kbTermsSchema,intentTags:kbTermsSchema,reviewStatus:supportKbReviewStatusSchema,createdByAdminId:idSchema,contentSha256:z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const createSupportKbArticleRequestSchema = z.object({ slug:z.string().trim().min(2).max(128).transform(v=>v.toLowerCase()).pipe(z.string().regex(/^[a-z0-9][a-z0-9_-]+$/)),language:z.string().trim().min(2).max(32).transform(v=>v.toLowerCase()),categoryId:idSchema.optional(),skuId:idSchema.optional(),title:z.string().trim().min(1).max(200),summary:z.string().trim().min(1).max(500).optional(),bodyMarkdown:safeMarkdownSchema,keywords:kbTermsSchema,intentTags:kbTermsSchema,idempotencyKey:idempotencyKeySchema }).strict();
export const createSupportKbRevisionRequestSchema = createSupportKbArticleRequestSchema.omit({slug:true,language:true,categoryId:true,skuId:true}).extend({expectedVersion:z.number().int().positive()}).strict();
export const reviewSupportKbRevisionRequestSchema = z.object({note:z.string().trim().min(1).max(1000).optional(),idempotencyKey:idempotencyKeySchema}).strict();
export const publishSupportKbRevisionRequestSchema = z.object({versionId:idSchema,expectedVersion:z.number().int().positive(),idempotencyKey:idempotencyKeySchema}).strict();
export const supportKbMutationResponseSchema = z.object({ok:z.literal(true),article:supportKbArticleSchema,version:supportKbArticleVersionSchema,idempotent:z.boolean().optional()}).strict();
export const supportBotRunSchema = z.object({botRunId:idSchema,cityCode:cityCodeSchema,conversationId:idSchema,triggerMessageId:idSchema,provider:z.enum(["deterministic","mock"]),providerStatus:z.enum(["matched_local","no_match_local","forced_mock"]),externalProviderExecuted:z.literal(false),providerRuleVersion:z.string().min(1).max(64),intent:z.string().max(128).nullable(),confidenceBasisPoints:z.number().int().min(0).max(10_000),sensitiveClassification:z.string().max(32).nullable(),decision:z.enum(["reply","hand_off","no_match"]),reasonCodes:z.array(z.string().min(1).max(128)).max(32),matchedArticleVersionIds:z.array(idSchema).max(32),responseMessageId:idSchema.nullable()}).strict();
export const supportBotRunResponseSchema = z.object({ok:z.literal(true),run:supportBotRunSchema}).strict();

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

export const submitSupportCsatRequestSchema=z.object({score:z.number().int().min(1).max(5),comment:z.string().trim().min(1).max(1000).optional(),idempotencyKey:idempotencyKeySchema}).strict();
export const supportRubricCriterionSchema=z.object({key:z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),weight:z.number().int().min(1).max(100),maxScore:z.number().int().min(1).max(10),label:z.string().max(128).optional()}).strict();
export const createSupportQualityRubricRequestSchema=z.object({name:z.string().trim().min(1).max(128),criteria:z.array(supportRubricCriterionSchema).min(1).max(20)}).strict().refine(v=>v.criteria.reduce((s,c)=>s+c.weight,0)===100,{message:"criterion weights must total 100"});
export const createSupportQualityReviewRequestSchema=z.object({targetType:z.enum(["ticket","conversation"]),targetId:idSchema,rubricVersionId:idSchema,criterionScores:z.record(z.string(),z.number().min(0).max(10)),finding:z.string().trim().max(4000).optional(),idempotencyKey:idempotencyKeySchema}).strict();
