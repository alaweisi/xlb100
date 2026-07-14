import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const outboxEventStatusSchema = z.enum([
  "pending",
  "processing",
  "retry_wait",
  "published",
  "dead_letter",
]);

export const outboxEventTypeSchema = z.enum([
  "order.created",
  "order.paid",
  "payment.paid",
  "dispatch.accepted",
  "fulfillment.created",
  "fulfillment.started",
  "fulfillment.completed",
  "fulfillment.evidence.created",
  "fulfillment.customer_confirmation.pending",
  "fulfillment.customer_confirmation.confirmed",
  "fulfillment.customer_confirmation.disputed",
  "settlement.prepared",
  "settlement.confirmed",
  "settlement.payable",
  "settlement.payable.queued",
  "refund.approved",
  "order.reverse.requested",
  "order.reverse.approved",
  "order.reverse.applied",
  "aftersale.complaint.submitted",
  "aftersale.complaint.resolved",
  "aftersale.repair.created",
  "aftersale.repair.completed",
  "aftersale.liability.decided",
  "aftersale.compensation.approved",
  "support.ticket.created",
  "support.ticket.assigned",
  "support.ticket.escalated",
  "support.ticket.resolved",
  "support.ticket.reopened",
  "support.ticket.closed",
  "support.sla.breached",
  "support.conversation.started",
  "support.conversation.transferred",
  "support.conversation.closed",
  "support.message.created",
  "support.csat.submitted",
  "support.quality.reviewed",
  "support.bot.handed_off",
  "review.created",
  "review.visibility.changed",
  "marketing.discount.decision.issued",
  "marketing.coupon.reserved",
  "marketing.coupon.redeemed",
  "marketing.coupon.released",
  "conflict_audit",
  "worker.receivable.statement.created",
  "worker.receivable.statement.reviewed",
  "worker.receivable.statement.exported",
]);

export const eventOutboxSchema = z.object({
  eventId: z.string().min(1).max(64),
  eventType: outboxEventTypeSchema,
  eventMajorVersion: z.number().int().min(0).max(65535).default(0),
  aggregateType: z.string().min(1).max(64),
  aggregateId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  payload: z.record(z.string(), z.unknown()),
  status: outboxEventStatusSchema,
  createdAt: z.string().min(1),
  publishedAt: z.string().nullable(),
  processingStartedAt: z.string().nullable().optional(),
  leaseOwner: z.string().nullable().optional(),
  leaseToken: z.string().nullable().optional(),
  leaseExpiresAt: z.string().nullable().optional(),
  attemptCount: z.number().int().nonnegative().optional(),
  maxAttempts: z.number().int().positive().optional(),
  availableAt: z.string().min(1).optional(),
  lastErrorCode: z.string().nullable().optional(),
  lastErrorMessage: z.string().nullable().optional(),
  lastFailedAt: z.string().nullable().optional(),
  deadLetteredAt: z.string().nullable().optional(),
  updatedAt: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (
    (value.eventType === "review.created" ||
      value.eventType === "review.visibility.changed" ||
      value.eventType.startsWith("marketing.")) &&
    value.eventMajorVersion !== 1
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["eventMajorVersion"],
      message: `${value.eventType} requires explicit event major version 1`,
    });
  }
});

export const orderPaidEventPayloadSchema = z.object({
  orderId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  customerId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(128),
  amount: z.number().min(0),
  paidAt: z.string().min(1),
});

export const orderCreatedEventPayloadSchema = z.object({
  orderId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  customerId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(128),
  totalAmount: z.number().min(0),
  createdAt: z.string().min(1),
});

export const reviewCreatedV1EventPayloadSchema = z.object({
  reviewId: z.string().trim().min(1).max(64),
  orderId: z.string().trim().min(1).max(64),
  workerId: z.string().trim().min(1).max(64),
  rating: z.number().int().min(1).max(5),
  visibility: z.literal("pending_moderation"),
  occurredAt: z.string().datetime({ offset: true }),
}).strict();

export const reviewVisibilityChangedV1EventPayloadSchema = z.object({
  reviewId: z.string().trim().min(1).max(64),
  workerId: z.string().trim().min(1).max(64),
  rating: z.number().int().min(1).max(5),
  fromVisibility: z.enum(["pending_moderation", "visible", "hidden"]),
  toVisibility: z.enum(["visible", "hidden"]),
  moderationVersion: z.number().int().positive(),
  occurredAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  if (value.fromVisibility === value.toVisibility) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["toVisibility"],
      message: "visibility transition must change state",
    });
  }
});

export const refundApprovedEventPayloadSchema = z.object({
  refundId: z.string().min(1).max(64),
  orderId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  customerId: z.string().min(1).max(64),
  fulfillmentId: z.string().min(1).max(64),
  paymentOrderId: z.string().min(1).max(64),
  amount: z.number().min(0),
  currency: z.literal("CNY"),
  approvedAt: z.string().min(1),
  approvedByAdminId: z.string().min(1).max(64),
});

export const marketingDiscountDecisionIssuedV1PayloadSchema = z.object({
  discountDecisionId: z.string().min(1).max(64),
  couponGrantId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(128),
  grossAmountMinor: z.number().int().positive(),
  discountAmountMinor: z.number().int().positive(),
  netAmountMinor: z.number().int().positive(),
  currency: z.literal("CNY"),
  expiresAt: z.string().datetime({ offset: true }),
}).strict().refine(
  (value) => value.grossAmountMinor - value.discountAmountMinor === value.netAmountMinor,
  { path: ["netAmountMinor"], message: "net amount must equal gross minus discount" },
);

export const marketingCouponLifecycleV1PayloadSchema = z.object({
  couponReservationId: z.string().min(1).max(64),
  couponGrantId: z.string().min(1).max(64),
  discountDecisionId: z.string().min(1).max(64),
  orderId: z.string().min(1).max(64),
  discountAmountMinor: z.number().int().positive(),
  currency: z.literal("CNY"),
  reasonCode: z.string().min(1).max(64).optional(),
  occurredAt: z.string().datetime({ offset: true }),
}).strict();

export type EventOutboxInput = z.infer<typeof eventOutboxSchema>;
export type OrderPaidEventPayloadInput = z.infer<typeof orderPaidEventPayloadSchema>;
export type OrderCreatedEventPayloadInput = z.infer<typeof orderCreatedEventPayloadSchema>;
export type ReviewCreatedV1EventPayloadInput = z.infer<typeof reviewCreatedV1EventPayloadSchema>;
export type ReviewVisibilityChangedV1EventPayloadInput = z.infer<typeof reviewVisibilityChangedV1EventPayloadSchema>;
export type RefundApprovedEventPayloadInput = z.infer<typeof refundApprovedEventPayloadSchema>;
export type MarketingDiscountDecisionIssuedV1PayloadInput = z.infer<typeof marketingDiscountDecisionIssuedV1PayloadSchema>;
export type MarketingCouponLifecycleV1PayloadInput = z.infer<typeof marketingCouponLifecycleV1PayloadSchema>;
