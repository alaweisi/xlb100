import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const workerTaskAcceptanceStatusSchema = z.enum(["accepted", "cancelled"]);

export const fulfillmentSkeletonSchema = z.object({
  fulfillmentId: z.string().min(1).max(64),
  acceptanceId: z.string().min(1).max(64),
  dispatchTaskId: z.string().min(1).max(64),
  orderId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  workerId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(128),
  status: z.enum(["accepted", "in_progress", "completed", "cancelled"]),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const workerTaskAcceptanceSchema = z.object({
  acceptanceId: z.string().min(1).max(64),
  dispatchTaskId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  orderId: z.string().min(1).max(64),
  workerId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(128),
  status: workerTaskAcceptanceStatusSchema,
  acceptedAt: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const workerAcceptBodySchema = z.object({}).strict();

export const workerAcceptResponseSchema = z.object({
  ok: z.literal(true),
  acceptance: workerTaskAcceptanceSchema,
  fulfillment: fulfillmentSkeletonSchema,
  idempotent: z.boolean(),
});

export type WorkerTaskAcceptanceInput = z.infer<typeof workerTaskAcceptanceSchema>;
export type WorkerAcceptBodyInput = z.infer<typeof workerAcceptBodySchema>;
