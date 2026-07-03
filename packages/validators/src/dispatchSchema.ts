import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const dispatchTaskStatusSchema = z.enum([
  "pending",
  "queued",
  "failed",
  "cancelled",
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
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
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
export type DispatchStreamMessageInput = z.infer<typeof dispatchStreamMessageSchema>;
