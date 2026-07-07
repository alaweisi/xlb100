import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const campaignStatusSchema = z.enum([
  "draft",
  "scheduled",
  "active",
  "ended",
  "revoked",
]);

export const campaignThemeIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z][a-z0-9-]*$/,
    "themeId must be lowercase kebab-case and start with a letter",
  );

export const campaignAppScopeSchema = z.enum([
  "customer",
  "worker",
  "admin",
  "all",
]);

export const campaignCityScopeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("all") }),
  z.object({
    mode: z.literal("include"),
    cityCodes: z.array(cityCodeSchema).min(1),
  }),
]);

export const campaignBannerContentSchema = z
  .object({
    title: z.string().min(1).max(80).optional(),
    subtitle: z.string().min(1).max(160).optional(),
    imageUrl: z.string().url().optional(),
    ctaLabel: z.string().min(1).max(24).optional(),
  })
  .strict();

export const campaignSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(80),
    themeId: campaignThemeIdSchema,
    cityScope: campaignCityScopeSchema,
    appScope: z.array(campaignAppScopeSchema).min(1),
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    discountRuleId: z.string().min(1).nullable(),
    bannerContent: campaignBannerContentSchema.nullable(),
    status: campaignStatusSchema,
  })
  .refine(
    (campaign) => campaign.startAt < campaign.endAt,
    "startAt must be earlier than endAt",
  );

export const activeCampaignRequestSchema = z.object({
  cityCode: cityCodeSchema,
  appScope: z.enum(["customer", "worker", "admin"]),
  route: z.string().min(1).optional(),
});

export const activeCampaignResponseSchema = z.object({
  campaign: campaignSchema.nullable(),
  themeId: campaignThemeIdSchema,
  bannerContent: campaignBannerContentSchema.nullable(),
  source: z.enum(["campaign-service", "default-fallback"]),
});

export type CampaignInput = z.infer<typeof campaignSchema>;
export type ActiveCampaignRequestInput = z.infer<typeof activeCampaignRequestSchema>;
export type ActiveCampaignResponseInput = z.infer<typeof activeCampaignResponseSchema>;
