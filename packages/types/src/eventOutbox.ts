import type { CityCode } from "./city.js";

export type OutboxEventStatus = "pending" | "published" | "failed";

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
  | "conflict_audit"
  | "worker.receivable.statement.created"
  | "worker.receivable.statement.reviewed"
  | "worker.receivable.statement.exported";

export interface EventOutbox {
  eventId: string;
  eventType: OutboxEventType;
  aggregateType: string;
  aggregateId: string;
  cityCode: CityCode;
  payload: Record<string, unknown>;
  status: OutboxEventStatus;
  createdAt: string;
  publishedAt: string | null;
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
