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
  profile: z.lazy(() => serviceSkuProfileSchema).nullable().optional(),
  standards: z.lazy(() => serviceStandardSchema.array()).optional(),
  sortOrder: z.number().int(),
  isEnabled: z.boolean(),
});

export const serviceModeSchema = z.enum([
  "installation",
  "repair",
  "cleaning",
  "delivery",
  "measurement",
  "dismantle",
  "maintenance",
  "inspection",
]);

export const standardTypeSchema = z.enum([
  "installation",
  "repair",
  "inspection",
  "material",
  "safety",
  "warranty",
]);

export const serviceSkuProfileSchema = z.object({
  skuId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  serviceMode: serviceModeSchema,
  brandScope: z.string().max(128).nullable(),
  modelScope: z.string().max(128).nullable(),
  skillLevel: z.enum(["basic", "advanced", "specialist"]),
  warrantyDays: z.number().int().min(0).max(3650),
  requiresModel: z.boolean(),
  requiresMeasurement: z.boolean(),
  supportsEnterprise: z.boolean(),
  serviceGuaranteeText: z.string().min(1).max(255),
});

export const serviceStandardSchema = z.object({
  standardId: z.string().min(1).max(64),
  skuId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  standardType: standardTypeSchema,
  title: z.string().min(1).max(128),
  content: z.string().min(1).max(1000),
  sortOrder: z.number().int(),
  isRequired: z.boolean(),
  isEnabled: z.boolean(),
});

export type ServiceCategoryInput = z.infer<typeof serviceCategorySchema>;
export type ServiceItemInput = z.infer<typeof serviceItemSchema>;
export type ServiceSkuInput = z.infer<typeof serviceSkuSchema>;
export type ServiceSkuProfileInput = z.infer<typeof serviceSkuProfileSchema>;
export type ServiceStandardInput = z.infer<typeof serviceStandardSchema>;
