import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const cityConfigSnapshotSchema = z.object({
  cityCode: cityCodeSchema,
  version: z.number().int().positive(),
  isOpen: z.boolean(),
  timezone: z.string().min(1).max(64),
  serviceEnabled: z.boolean(),
  pricingEnabled: z.boolean(),
  updatedAt: z.string().datetime(),
});

export const cityConfigUpdateSchema = z.object({
  cityCode: cityCodeSchema,
  expectedVersion: z.number().int().positive(),
  isOpen: z.boolean().optional(),
  timezone: z.string().min(1).max(64).optional(),
  serviceEnabled: z.boolean().optional(),
  pricingEnabled: z.boolean().optional(),
}).refine(
  (input) =>
    input.isOpen !== undefined ||
    input.timezone !== undefined ||
    input.serviceEnabled !== undefined ||
    input.pricingEnabled !== undefined,
  { message: "At least one city config field must be provided" },
);

export type CityConfigSnapshotInput = z.infer<typeof cityConfigSnapshotSchema>;
export type CityConfigUpdateInput = z.infer<typeof cityConfigUpdateSchema>;
