import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

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

export const requestContextSchema = z.object({
  traceId: z.string().min(1),
  appType: appTypeSchema,
  role: roleSchema,
  cityCode: cityCodeSchema.optional(),
  userId: z.string().optional(),
  requestStartedAt: z.string().datetime(),
  requestId: z.string().optional(),
  correlationId: z.string().optional(),
});

export type RequestContextInput = z.infer<typeof requestContextSchema>;

/** Headers required for context-aware API routes */
export const requestContextHeadersSchema = z.object({
  "x-xlb-trace-id": z.string().min(1).optional(),
  "x-xlb-city-code": cityCodeSchema.optional(),
});

export type RequestContextHeadersInput = z.infer<
  typeof requestContextHeadersSchema
>;
