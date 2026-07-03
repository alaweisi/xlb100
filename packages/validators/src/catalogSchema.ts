import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const serviceCategorySchema = z.object({
  categoryId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  name: z.string().min(1).max(128),
  sortOrder: z.number().int(),
  isEnabled: z.boolean(),
});

export const serviceItemSchema = z.object({
  itemId: z.string().min(1).max(64),
  categoryId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  name: z.string().min(1).max(128),
  sortOrder: z.number().int(),
  isEnabled: z.boolean(),
});

export const serviceSkuSchema = z.object({
  skuId: z.string().min(1).max(64),
  itemId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  name: z.string().min(1).max(128),
  unit: z.string().min(1).max(32),
  sortOrder: z.number().int(),
  isEnabled: z.boolean(),
});

export type ServiceCategoryInput = z.infer<typeof serviceCategorySchema>;
export type ServiceItemInput = z.infer<typeof serviceItemSchema>;
export type ServiceSkuInput = z.infer<typeof serviceSkuSchema>;
