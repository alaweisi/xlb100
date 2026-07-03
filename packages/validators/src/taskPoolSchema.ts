import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";
import { dispatchTaskStatusSchema } from "./dispatchSchema.js";

export const workerTaskPoolItemSchema = z.object({
  dispatchTaskId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  orderId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(128),
  amount: z.number().min(0),
  streamName: z.string().min(1).max(255),
  status: dispatchTaskStatusSchema,
  createdAt: z.string().min(1),
});

export const workerTaskPoolResponseSchema = z.object({
  ok: z.literal(true),
  cityCode: cityCodeSchema,
  tasks: z.array(workerTaskPoolItemSchema),
});

export type WorkerTaskPoolItemInput = z.infer<typeof workerTaskPoolItemSchema>;
export type WorkerTaskPoolResponseInput = z.infer<
  typeof workerTaskPoolResponseSchema
>;
