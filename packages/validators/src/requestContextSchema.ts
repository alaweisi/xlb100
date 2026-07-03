import { z } from "zod";

export const appTypeSchema = z.enum([
  "customer",
  "worker",
  "admin",
  "oa",
  "dashboard",
]);

export const roleSchema = z.enum([
  "customer",
  "worker",
  "admin",
  "operator",
  "auditor",
]);

export const cityCodeSchema = z.string().min(1);

export const requestContextSchema = z.object({
  traceId: z.string().min(1),
  appType: appTypeSchema,
  role: roleSchema,
  cityCode: cityCodeSchema.optional(),
  userId: z.string().optional(),
});

export type RequestContextInput = z.infer<typeof requestContextSchema>;
