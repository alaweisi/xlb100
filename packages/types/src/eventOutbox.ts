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
  | "settlement.prepared"
  | "settlement.confirmed"
  | "settlement.payable"
  | "settlement.payable.queued"
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
