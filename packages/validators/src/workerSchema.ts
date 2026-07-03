import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const workerProfileStatusSchema = z.enum([
  "active",
  "suspended",
  "disabled",
]);

export const workerProfileSchema = z.object({
  workerId: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  phoneMasked: z.string().max(64).nullable(),
  status: workerProfileStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const workerCityBindingSchema = z.object({
  workerId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  isEnabled: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const workerOnlineStatusSchema = z.object({
  workerId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  isOnline: z.boolean(),
  updatedAt: z.string().min(1),
});

export type WorkerProfileInput = z.infer<typeof workerProfileSchema>;
export type WorkerCityBindingInput = z.infer<typeof workerCityBindingSchema>;
export type WorkerOnlineStatusInput = z.infer<typeof workerOnlineStatusSchema>;
