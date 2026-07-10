import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const updateCustomerProfileSchema = z.object({
  name: z.string().trim().min(1).max(64),
  defaultCityCode: cityCodeSchema.optional(),
});

export const saveCustomerAddressSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128),
  contactName: z.string().trim().min(1).max(64),
  contactPhone: z.string().regex(/^\d{11}$/),
  province: z.string().trim().min(1).max(64),
  city: z.string().trim().min(1).max(64),
  district: z.string().trim().min(1).max(64),
  detailAddress: z.string().trim().min(2).max(255),
  isDefault: z.boolean().optional().default(false),
});

export type UpdateCustomerProfileInput = z.infer<typeof updateCustomerProfileSchema>;
export type SaveCustomerAddressInput = z.infer<typeof saveCustomerAddressSchema>;
