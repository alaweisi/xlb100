import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const dispatchTaskStatusSchema = z.enum([
  "pending",
  "queued",
  "offering",
  "accepted",
  "expired",
  "reassigning",
  "completed",
  "rejected",
  "timeout",
  "no_match",
  "manual_review",
  "failed",
  "cancelled",
]);

export const dispatchOfferStatusSchema = z.enum([
  "offering",
  "accepted",
  "rejected",
  "timeout",
  "cancelled",
]);

export const dispatchEventTypeSchema = z.enum([
  "TASK_QUEUED",
  "OFFER_CREATED",
  "WORKER_ACCEPTED",
  "WORKER_REJECTED",
  "OFFER_CANCELLED",
  "OFFER_TIMEOUT",
  "NO_MATCH",
  "REASSIGNING",
  "MANUAL_REVIEW",
  "TASK_COMPLETED",
]);

export const dispatchTaskSchema = z.object({
  dispatchTaskId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  orderId: z.string().min(1).max(64),
  customerId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(128),
  amount: z.number().min(0),
  sourceEventId: z.string().min(1).max(64),
  streamName: z.string().min(1).max(255),
  streamEntryId: z.string().max(128).nullable(),
  status: dispatchTaskStatusSchema,
  attemptCount: z.number().int().min(0).optional(),
  maxAttempts: z.number().int().min(1).optional(),
  lastReason: z.string().max(255).nullable().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const dispatchOfferSchema = z.object({
  offerId: z.string().min(1).max(64),
  dispatchTaskId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  workerId: z.string().min(1).max(64),
  status: dispatchOfferStatusSchema,
  distanceKm: z.number().min(0).nullable(),
  offeredAt: z.string().min(1),
  respondedAt: z.string().min(1).nullable(),
});

export const dispatchEventSchema = z.object({
  dispatchEventId: z.string().min(1).max(64),
  dispatchTaskId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  eventType: dispatchEventTypeSchema,
  workerId: z.string().min(1).max(64).nullable(),
  reason: z.string().max(255).nullable(),
  createdAt: z.string().min(1),
});

export const dispatchStreamMessageSchema = z.object({
  dispatchTaskId: z.string().min(1).max(64),
  orderId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  customerId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(128),
  amount: z.number().min(0),
  sourceEventId: z.string().min(1).max(64),
});

export type DispatchTaskInput = z.infer<typeof dispatchTaskSchema>;
export type DispatchOfferInput = z.infer<typeof dispatchOfferSchema>;
export type DispatchEventInput = z.infer<typeof dispatchEventSchema>;
export type DispatchStreamMessageInput = z.infer<typeof dispatchStreamMessageSchema>;
