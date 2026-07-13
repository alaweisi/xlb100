import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";
import { platformDeliveryMutationRequestSchema } from "./platformDeliverySchema.js";

const identifier = z.string().trim().min(1).max(128);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "expected lowercase SHA-256 hex");
const timestampSchema = z.string().datetime({ offset: true });
const positiveRowVersionSchema = z.number().int().positive();

export const notificationRecipientTypeSchema = z.enum(["customer", "worker"]);
export const notificationEventTypeSchema = z.enum(["order.created", "support.ticket.resolved"]);

export const notificationOrderCreatedRenderParametersSchema = z.object({
  kind: z.literal("order_created"),
  orderId: identifier,
}).strict();

export const notificationSupportTicketResolvedRenderParametersSchema = z.object({
  kind: z.literal("support_ticket_resolved"),
  ticketId: identifier,
}).strict();

export const notificationRenderParametersSchema = z.discriminatedUnion("kind", [
  notificationOrderCreatedRenderParametersSchema,
  notificationSupportTicketResolvedRenderParametersSchema,
]);

export const notificationInboxReferenceSchema = notificationRenderParametersSchema;
export const notificationInboxViewSchema = z.enum(["inbox", "archive"]);

export const notificationInboxListQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  view: notificationInboxViewSchema.optional(),
}).strict();

export const notificationInboxItemSchema = z.object({
  notificationId: identifier,
  eventType: notificationEventTypeSchema,
  templateRevisionId: identifier,
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(2_000),
  reference: notificationInboxReferenceSchema,
  occurredAt: timestampSchema,
  createdAt: timestampSchema,
  readAt: timestampSchema.nullable(),
  archivedAt: timestampSchema.nullable(),
  rowVersion: positiveRowVersionSchema,
}).strict().superRefine((value, context) => {
  const expectedKind = value.eventType === "order.created" ? "order_created" : "support_ticket_resolved";
  if (value.reference.kind !== expectedKind) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reference", "kind"],
      message: "notification reference must match event type",
    });
  }
});

export const notificationInboxListResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(notificationInboxItemSchema).max(100),
  nextCursor: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).nullable(),
}).strict();

export const notificationUnreadCountResponseSchema = z.object({
  ok: z.literal(true),
  unreadCount: z.number().int().nonnegative(),
}).strict();

export const notificationMarkReadRequestSchema = z.object({
  expectedRowVersion: positiveRowVersionSchema,
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export const notificationArchiveRequestSchema = notificationMarkReadRequestSchema.extend({
  archived: z.boolean(),
}).strict();

export const notificationStateMutationOutcomeSchema = z.enum(["applied", "already_applied"]);

export const notificationStateMutationResultSchema = z.object({
  outcome: notificationStateMutationOutcomeSchema,
  rowVersion: positiveRowVersionSchema,
}).strict();

export const notificationStateMutationResponseSchema = z.object({
  ok: z.literal(true),
  result: notificationStateMutationResultSchema,
}).strict();

export const platformNotificationCompatibilityProjectionSchema = z.object({
  deliveryId: identifier,
  cityCode: cityCodeSchema,
  subscriberId: identifier,
  subscriptionId: identifier,
  eventId: identifier,
  eventType: notificationEventTypeSchema,
  eventMajorVersion: z.literal(0),
  payloadHash: sha256Schema,
  compatibilityHandlerRevision: identifier,
  recipientType: notificationRecipientTypeSchema,
  recipientId: identifier,
  renderParameters: notificationRenderParametersSchema,
  occurredAt: timestampSchema,
}).strict().superRefine((value, context) => {
  const expectedKind = value.eventType === "order.created" ? "order_created" : "support_ticket_resolved";
  if (value.renderParameters.kind !== expectedKind) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["renderParameters", "kind"],
      message: "render parameters must match projection event type",
    });
  }
  if (value.eventType === "order.created" && value.recipientType !== "customer") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recipientType"],
      message: "order.created recipient must be customer",
    });
  }
});

export const notificationTemplateRevisionSchema = z.object({
  templateRevisionId: identifier,
  templateId: identifier,
  templateKey: z.string().trim().min(1).max(96).regex(/^[a-z0-9._-]+$/),
  revisionLabel: z.string().trim().min(1).max(64),
  locale: z.literal("zh-CN"),
  eventType: notificationEventTypeSchema,
  parameterKind: notificationEventTypeSchema,
  piiCeiling: z.literal("P1"),
  titleTemplate: z.string().trim().min(1).max(160),
  bodyTemplate: z.string().trim().min(1).max(2_000),
  contentHash: sha256Schema,
  createdAt: timestampSchema,
}).strict().superRefine((value, context) => {
  if (value.eventType !== value.parameterKind) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["parameterKind"],
      message: "template parameter kind must match event type",
    });
  }
});

export const notificationRecordSchema = z.object({
  notificationId: identifier,
  cityCode: cityCodeSchema,
  recipientType: notificationRecipientTypeSchema,
  recipientId: identifier,
  sourceEventId: identifier,
  eventType: notificationEventTypeSchema,
  templateRevisionId: identifier,
  renderParameters: notificationRenderParametersSchema,
  renderParametersHash: sha256Schema,
  sourcePayloadHash: sha256Schema,
  targetFingerprint: sha256Schema,
  occurredAt: timestampSchema,
  createdAt: timestampSchema,
  rowVersion: positiveRowVersionSchema,
}).strict().superRefine((value, context) => {
  const expectedKind = value.eventType === "order.created" ? "order_created" : "support_ticket_resolved";
  if (value.renderParameters.kind !== expectedKind) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["renderParameters", "kind"],
      message: "render parameters must match record event type",
    });
  }
  if (value.eventType === "order.created" && value.recipientType !== "customer") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recipientType"],
      message: "order.created recipient must be customer",
    });
  }
});

export const notificationReceiptResultSchema = z.enum(["applied", "already_applied"]);

export const notificationDeliveryReceiptSchema = z.object({
  receiptId: identifier,
  cityCode: cityCodeSchema,
  subscriberId: identifier,
  eventId: identifier,
  notificationId: identifier,
  templateRevisionId: identifier,
  sourcePayloadHash: sha256Schema,
  targetFingerprint: sha256Schema,
  result: notificationReceiptResultSchema,
  appliedAt: timestampSchema,
}).strict();

export const notificationRecipientStateSchema = z.object({
  stateId: identifier,
  cityCode: cityCodeSchema,
  notificationId: identifier,
  recipientType: notificationRecipientTypeSchema,
  recipientId: identifier,
  readAt: timestampSchema.nullable(),
  archivedAt: timestampSchema.nullable(),
  hiddenAt: timestampSchema.nullable(),
  rowVersion: positiveRowVersionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();

export const notificationActionSchema = z.object({
  actionId: identifier,
  cityCode: cityCodeSchema,
  notificationId: identifier,
  recipientType: notificationRecipientTypeSchema,
  recipientId: identifier,
  actionKind: z.literal("projection_committed"),
  expectedRowVersion: positiveRowVersionSchema.nullable(),
  actualRowVersion: positiveRowVersionSchema,
  actorServiceId: identifier,
  traceId: identifier,
  createdAt: timestampSchema,
}).strict();

export const notificationTombstoneSchema = z.object({
  tombstoneId: identifier,
  cityCode: cityCodeSchema,
  notificationId: identifier,
  recipientType: notificationRecipientTypeSchema,
  recipientIdHash: sha256Schema,
  sourceEventId: identifier,
  templateRevisionId: identifier,
  payloadHash: sha256Schema,
  targetFingerprint: sha256Schema,
  rowVersionCopy: positiveRowVersionSchema,
  reasonCode: z.string().trim().min(1).max(64).regex(/^[A-Z0-9_]+$/),
  createdAt: timestampSchema,
}).strict();

export const notificationMaterializeCommandSchema = z.object({
  projection: platformNotificationCompatibilityProjectionSchema,
  templateRevisionId: identifier,
  actorServiceId: identifier,
}).strict();

export const notificationMaterializeClaimRequestSchema = z.object({
  claim: platformDeliveryMutationRequestSchema,
  templateRevisionId: identifier,
}).strict();

export const notificationMaterializationResultSchema = z.object({
  outcome: notificationReceiptResultSchema,
  notificationId: identifier,
  receiptId: identifier,
  stateId: identifier,
  targetFingerprint: sha256Schema,
  rowVersion: positiveRowVersionSchema,
}).strict();

export type NotificationRenderParametersInput = z.infer<typeof notificationRenderParametersSchema>;
export type NotificationInboxListQueryInput = z.infer<typeof notificationInboxListQuerySchema>;
export type NotificationInboxItemInput = z.infer<typeof notificationInboxItemSchema>;
export type NotificationMarkReadRequestInput = z.infer<typeof notificationMarkReadRequestSchema>;
export type NotificationArchiveRequestInput = z.infer<typeof notificationArchiveRequestSchema>;
export type PlatformNotificationCompatibilityProjectionInput = z.infer<
  typeof platformNotificationCompatibilityProjectionSchema
>;
export type NotificationMaterializeClaimRequestInput = z.infer<
  typeof notificationMaterializeClaimRequestSchema
>;
export type NotificationMaterializeCommandInput = z.infer<typeof notificationMaterializeCommandSchema>;
export type NotificationMaterializationResultInput = z.infer<
  typeof notificationMaterializationResultSchema
>;
