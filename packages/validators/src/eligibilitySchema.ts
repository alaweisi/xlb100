import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const workerDispatchEligibilitySchema = z.object({
  workerId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  skuId: z.string().min(1).max(128),
  isEligible: z.boolean(),
  reasons: z.array(z.string()),
});

export const workerEligibilityQuerySchema = z.object({
  skuId: z.string().min(1).max(128),
});

export const workerEligibilityResponseSchema = z.object({
  ok: z.literal(true),
  eligibility: workerDispatchEligibilitySchema,
});

export type WorkerDispatchEligibilityInput = z.infer<
  typeof workerDispatchEligibilitySchema
>;
export type WorkerEligibilityQueryInput = z.infer<
  typeof workerEligibilityQuerySchema
>;
export type WorkerEligibilityResponseInput = z.infer<
  typeof workerEligibilityResponseSchema
>;
