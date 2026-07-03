import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const fulfillmentStatusSchema = z.enum([
  "accepted",
  "in_progress",
  "completed",
  "cancelled",
]);

export const fulfillmentSchema = z.object({
  fulfillmentId: z.string().min(1).max(64),
  acceptanceId: z.string().min(1).max(64),
  dispatchTaskId: z.string().min(1).max(64),
  orderId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  workerId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(128),
  status: fulfillmentStatusSchema,
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  completionNote: z.string().max(255).nullable().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const startFulfillmentSchema = z.object({}).strict();

export const completeFulfillmentSchema = z
  .object({
    completionNote: z.string().max(255).optional(),
  })
  .strict();

export const fulfillmentLifecycleResponseSchema = z.object({
  ok: z.literal(true),
  fulfillment: fulfillmentSchema,
  idempotent: z.boolean(),
});

export const fulfillmentListResponseSchema = z.object({
  ok: z.literal(true),
  cityCode: cityCodeSchema,
  fulfillments: z.array(fulfillmentSchema),
});

export const fulfillmentDetailResponseSchema = z.object({
  ok: z.literal(true),
  fulfillment: fulfillmentSchema,
});

export type FulfillmentInput = z.infer<typeof fulfillmentSchema>;
export type StartFulfillmentInput = z.infer<typeof startFulfillmentSchema>;
export type CompleteFulfillmentInput = z.infer<typeof completeFulfillmentSchema>;
