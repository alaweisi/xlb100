import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const workerQualificationSchema = z.object({
  workerId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  skuId: z.string().min(1).max(128),
  isEligible: z.boolean(),
  sourceCertificationId: z.string().max(64).nullable().optional(),
  updatedAt: z.string().min(1),
});

export const serviceQualificationRuleSchema = z.object({
  ruleId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  skuId: z.string().min(1).max(128),
  requiredCertType: z.string().min(1).max(64),
  isRequired: z.boolean(),
  isEnabled: z.boolean(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type WorkerQualificationInput = z.infer<typeof workerQualificationSchema>;
export type ServiceQualificationRuleInput = z.infer<
  typeof serviceQualificationRuleSchema
>;
