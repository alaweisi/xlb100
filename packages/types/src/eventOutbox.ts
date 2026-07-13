import type { CityCode } from "./city.js";

export type OutboxEventStatus =
  | "pending"
  | "processing"
  | "retry_wait"
  | "published"
  | "dead_letter";

export type OutboxEventType =
  | "order.created"
  | "order.paid"
  | "payment.paid"
  | "dispatch.accepted"
  | "fulfillment.created"
  | "fulfillment.started"
  | "fulfillment.completed"
  | "fulfillment.evidence.created"
  | "fulfillment.customer_confirmation.pending"
  | "fulfillment.customer_confirmation.confirmed"
  | "fulfillment.customer_confirmation.disputed"
  | "settlement.prepared"
  | "settlement.confirmed"
  | "settlement.payable"
  | "settlement.payable.queued"
  | "refund.approved"
  | "order.reverse.requested"
  | "order.reverse.approved"
  | "order.reverse.applied"
  | "aftersale.complaint.submitted"
  | "aftersale.complaint.resolved"
  | "aftersale.repair.created"
  | "aftersale.repair.completed"
  | "aftersale.liability.decided"
  | "aftersale.compensation.approved"
  | "support.ticket.created"
  | "support.ticket.assigned"
  | "support.ticket.escalated"
  | "support.ticket.resolved"
  | "support.ticket.reopened"
  | "support.ticket.closed"
  | "support.sla.breached"
  | "support.conversation.started"
  | "support.conversation.transferred"
  | "support.conversation.closed"
  | "support.message.created"
  | "support.csat.submitted"
  | "support.quality.reviewed"
  | "support.bot.handed_off"
  | "review.created"
  | "review.visibility.changed"
  | "conflict_audit"
  | "worker.receivable.statement.created"
  | "worker.receivable.statement.reviewed"
  | "worker.receivable.statement.exported";

export interface EventOutbox {
  eventId: string;
  eventType: OutboxEventType;
  /**
   * Persisted source-contract major. Legacy writers may omit it and are stored
   * as the approved synthetic implicit-v0 contract by the Outbox repository.
   */
  eventMajorVersion?: number;
  aggregateType: string;
  aggregateId: string;
  cityCode: CityCode;
  payload: Record<string, unknown>;
  status: OutboxEventStatus;
  createdAt: string;
  publishedAt: string | null;
  processingStartedAt?: string | null;
  leaseOwner?: string | null;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  attemptCount?: number;
  maxAttempts?: number;
  availableAt?: string;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  lastFailedAt?: string | null;
  deadLetteredAt?: string | null;
  updatedAt?: string;
}

export interface OrderPaidEventPayload {
  orderId: string;
  cityCode: CityCode;
  customerId: string;
  skuId: string;
  amount: number;
  paidAt: string;
}

export interface PaymentPaidEventPayload {
  paymentOrderId: string;
  orderId: string;
  cityCode: CityCode;
  amount: number;
  providerTradeNo: string;
  paidAt: string;
}

export interface OrderCreatedEventPayload {
  orderId: string;
  cityCode: CityCode;
  customerId: string;
  skuId: string;
  totalAmount: number;
  createdAt: string;
}

export interface ReviewCreatedV1EventPayload {
  reviewId: string;
  orderId: string;
  workerId: string;
  rating: number;
  visibility: "pending_moderation";
  occurredAt: string;
}

export interface ReviewVisibilityChangedV1EventPayload {
  reviewId: string;
  workerId: string;
  rating: number;
  fromVisibility: "pending_moderation" | "visible" | "hidden";
  toVisibility: "visible" | "hidden";
  moderationVersion: number;
  occurredAt: string;
}

export interface RefundApprovedEventPayload {
  refundId: string;
  orderId: string;
  cityCode: CityCode;
  customerId: string;
  fulfillmentId: string;
  paymentOrderId: string;
  amount: number;
  currency: "CNY";
  approvedAt: string;
  approvedByAdminId: string;
}
