import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const outboxEventStatusSchema = z.enum(["pending", "published", "failed"]);

export const outboxEventTypeSchema = z.enum([
  "order.created",
  "order.paid",
  "payment.paid",
  "dispatch.accepted",
  "fulfillment.created",
  "fulfillment.started",
  "fulfillment.completed",
  "settlement.prepared",
  "settlement.confirmed",
  "settlement.payable",
  "settlement.payable.queued",
  "worker.receivable.statement.created",
  "worker.receivable.statement.reviewed",
  "worker.receivable.statement.exported",
]);

export const eventOutboxSchema = z.object({
  eventId: z.string().min(1).max(64),
  eventType: outboxEventTypeSchema,
  aggregateType: z.string().min(1).max(64),
  aggregateId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  payload: z.record(z.string(), z.unknown()),
  status: outboxEventStatusSchema,
  createdAt: z.string().min(1),
  publishedAt: z.string().nullable(),
});

export const orderPaidEventPayloadSchema = z.object({
  orderId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  customerId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(128),
  amount: z.number().min(0),
  paidAt: z.string().min(1),
});

export type EventOutboxInput = z.infer<typeof eventOutboxSchema>;
export type OrderPaidEventPayloadInput = z.infer<typeof orderPaidEventPayloadSchema>;
