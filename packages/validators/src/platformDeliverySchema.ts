import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";
import { outboxEventTypeSchema } from "./eventOutboxSchema.js";

const identifier = z.string().trim().min(1).max(128);
const shortIdentifier = z.string().trim().min(1).max(64);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const timezoneAwareTimestamp = z.string().datetime({ offset: true });

export const platformSubscriberStatusSchema = z.enum(["proposed", "active", "paused", "revoked"]);
export const platformSubscriptionStatusSchema = z.enum(["proposed", "active", "paused", "revoked"]);
export const platformDeliveryStatusSchema = z.enum([
  "pending",
  "processing",
  "retry_wait",
  "delivered",
  "dead_letter",
]);
export const platformDeliveryAttemptOutcomeSchema = z.enum([
  "processing",
  "delivered",
  "retry_wait",
  "dead_letter",
  "lease_expired",
]);
export const platformDeliveryActionKindSchema = z.enum([
  "materialized",
  "reconciliation_repair",
  "materialization_rejected",
  "lease_reaped",
  "manual_retry_requested",
  "replay_requested",
  "replay_cancelled",
]);
export const platformEventMajorVersionSchema = z.number().int().min(0).max(65535);

export const platformServiceIdentitySchema = z.object({
  identityKind: z.literal("platform_service"),
  credentialKind: z.literal("internal_domain_contract"),
  serviceId: identifier,
  subscriberId: shortIdentifier,
  cityCode: cityCodeSchema,
}).strict();

export const platformEventSubscriberSchema = z.object({
  subscriberId: shortIdentifier,
  stableName: identifier,
  ownerDomain: z.string().trim().min(1).max(64),
  handlerRevision: identifier,
  purpose: z.string().trim().min(1).max(255),
  maxPiiLevel: z.enum(["P0", "P1", "P2"]),
  status: platformSubscriberStatusSchema,
  rowVersion: z.number().int().positive(),
}).strict();

export const platformEventSubscriptionSchema = z.object({
  subscriptionId: shortIdentifier,
  cityCode: cityCodeSchema,
  subscriberId: shortIdentifier,
  eventType: outboxEventTypeSchema,
  eventMajorVersion: platformEventMajorVersionSchema,
  compatibilityHandlerRevision: identifier,
  retentionClass: z.enum(["R1", "R2", "R3", "R4"]),
  status: platformSubscriptionStatusSchema,
  leaseSeconds: z.number().int().min(5).max(3600),
  maxAttempts: z.number().int().min(1).max(100),
  rowVersion: z.number().int().positive(),
}).strict();

export const platformDeliveryClaimRequestSchema = z.object({
  subscriptionId: shortIdentifier,
  owner: identifier,
  limit: z.number().int().min(1).max(100).optional(),
  leaseSeconds: z.number().int().min(5).max(3600).optional(),
}).strict();

export const platformDeliveryMutationRequestSchema = z.object({
  subscriptionId: shortIdentifier,
  deliveryId: shortIdentifier,
  owner: identifier,
  leaseToken: z.string().uuid(),
  expectedRowVersion: z.number().int().positive(),
}).strict();

export const platformDeliveryErrorSchema = z.object({
  code: z.string().trim().min(1).max(64),
  message: z.string().trim().min(1).max(512),
}).strict();

export const platformEventDeliverySchema = z.object({
  deliveryId: shortIdentifier,
  cityCode: cityCodeSchema,
  subscriberId: shortIdentifier,
  subscriptionId: shortIdentifier,
  eventId: shortIdentifier,
  eventType: outboxEventTypeSchema,
  eventMajorVersion: platformEventMajorVersionSchema,
  payloadHash: sha256,
  aggregateType: z.string().trim().min(1).max(64),
  aggregateId: shortIdentifier,
  status: platformDeliveryStatusSchema,
  availableAt: z.string().min(1),
  leaseOwner: identifier.nullable(),
  leaseToken: z.string().uuid().nullable(),
  leaseExpiresAt: z.string().min(1).nullable(),
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().min(1).max(100),
  lastErrorCode: z.string().max(64).nullable(),
  lastErrorMessage: z.string().max(512).nullable(),
  deliveredAt: z.string().min(1).nullable(),
  deadLetteredAt: z.string().min(1).nullable(),
  rowVersion: z.number().int().positive(),
}).strict();

export const platformOrderCreatedCompatibilityPayloadSchema = z.object({
  orderId: shortIdentifier,
  cityCode: cityCodeSchema,
  customerId: shortIdentifier,
  skuId: z.string().min(1).max(128),
  totalAmount: z.number().finite().nonnegative(),
  createdAt: timezoneAwareTimestamp,
}).strict();

export const platformSupportTicketResolvedCompatibilityPayloadSchema = z.object({
  ticketId: shortIdentifier,
  cityCode: cityCodeSchema,
  source: z.enum(["customer", "worker", "enterprise", "admin", "system"]),
  type: z.enum([
    "order_question",
    "order_dispute",
    "service_complaint",
    "withdrawal_issue",
    "account_issue",
    "safety",
    "other",
  ]),
  priority: z.enum(["low", "normal", "high", "urgent", "critical"]),
  status: z.literal("resolved"),
  requesterId: shortIdentifier,
  actorId: shortIdentifier.nullable(),
  version: z.number().int().nonnegative(),
  occurredAt: timezoneAwareTimestamp,
}).strict().superRefine((value, context) => {
  if (value.source !== "customer" && value.source !== "worker") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["source"],
      message: "platform compatibility accepts only customer or worker requester source",
    });
  }
});

export function parsePlatformCompatibilityPayload(eventType: string, payload: unknown) {
  if (eventType === "order.created") {
    return platformOrderCreatedCompatibilityPayloadSchema.parse(payload);
  }
  if (eventType === "support.ticket.resolved") {
    return platformSupportTicketResolvedCompatibilityPayloadSchema.parse(payload);
  }
  throw new Error(`UNSUPPORTED_EVENT_TYPE:${eventType}`);
}

export type PlatformServiceIdentityInput = z.infer<typeof platformServiceIdentitySchema>;
export type PlatformEventSubscriptionInput = z.infer<typeof platformEventSubscriptionSchema>;
export type PlatformEventDeliveryInput = z.infer<typeof platformEventDeliverySchema>;
