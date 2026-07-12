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
  "created", "commented", "assigned", "status_changed", "escalated", "resolved",
  "reopened", "closed",
]);
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
  slaFirstResponseDueAt: timestampSchema.nullable(),
  slaResolutionDueAt: timestampSchema.nullable(),
  firstRespondedAt: timestampSchema.nullable(),
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

export type SupportTicketInput = z.infer<typeof supportTicketSchema>;
export type SupportTicketEventInput = z.infer<typeof supportTicketEventSchema>;
export type CreateSupportTicketRequestInput = z.infer<typeof createSupportTicketRequestSchema>;
export type SupportTicketListFiltersInput = z.infer<typeof supportTicketListFiltersSchema>;
