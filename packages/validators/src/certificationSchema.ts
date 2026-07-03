import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const workerCertificationStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
]);

export const workerCertificationSchema = z.object({
  certificationId: z.string().min(1).max(64),
  workerId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  certType: z.string().min(1).max(64),
  certName: z.string().min(1).max(128),
  status: workerCertificationStatusSchema,
  submittedAt: z.string().min(1),
  reviewedAt: z.string().nullable().optional(),
  reviewerId: z.string().max(64).nullable().optional(),
  rejectReason: z.string().max(255).nullable().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const submitWorkerCertificationSchema = z.object({
  certType: z.string().min(1).max(64),
  certName: z.string().min(1).max(128),
});

export const rejectWorkerCertificationSchema = z.object({
  reason: z.string().min(1).max(255),
});

export type WorkerCertificationInput = z.infer<typeof workerCertificationSchema>;
export type SubmitWorkerCertificationInput = z.infer<
  typeof submitWorkerCertificationSchema
>;
export type RejectWorkerCertificationInput = z.infer<
  typeof rejectWorkerCertificationSchema
>;
