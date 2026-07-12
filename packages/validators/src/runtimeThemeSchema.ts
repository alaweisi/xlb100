import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

const revisionSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "revision contains unsupported characters");

const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9._:-]*$/, "identifier must use an allowlist-safe format");

const themeIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/, "theme id must be lowercase kebab-case");

const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/, "campaign colors must be six or eight digit hex values");

export const runtimeThemeRoleSchema = z.enum([
  "customer",
  "worker",
  "admin",
  "oa",
  "dashboard",
]);

export const runtimeThemeModeSchema = z.enum([
  "light",
  "dark",
  "high-contrast",
  "large-display",
]);

export const runtimeThemePlacementSchema = z.enum([
  "header-decoration",
  "hero-artwork",
  "blessing-copy",
  "banner",
  "badge",
  "ambient-background",
  "navigation-accent",
]);

export const allowedCampaignTokenOverridesSchema = z
  .object({
    "campaign.accent": colorSchema.optional(),
    "campaign.ambient": colorSchema.optional(),
    "campaign.banner.background": colorSchema.optional(),
    "campaign.banner.text": colorSchema.optional(),
    "campaign.badge.background": colorSchema.optional(),
    "campaign.badge.text": colorSchema.optional(),
    "campaign.decoration.opacity": z.number().min(0).max(1).optional(),
    "campaign.decoration.intensity": z.number().min(0).max(1).optional(),
    "campaign.navigation.accent": colorSchema.optional(),
  })
  .strict();

export const campaignPresentationCtaSchema = z
  .object({
    label: z.string().trim().min(1).max(24),
    actionKey: identifierSchema,
  })
  .strict();

export const campaignPlacementPresentationSchema = z
  .object({
    placement: runtimeThemePlacementSchema,
    headline: z.string().trim().min(1).max(80).nullable(),
    body: z.string().trim().min(1).max(160).nullable(),
    badgeLabel: z.string().trim().min(1).max(24).nullable(),
    assetId: identifierSchema.nullable(),
    cta: campaignPresentationCtaSchema.nullable(),
  })
  .strict();

export const campaignPresentationSchema = z
  .object({
    revision: revisionSchema,
    locale: z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, "locale must be a normalized BCP 47 language tag"),
    blessingCopy: z.string().trim().min(1).max(120).nullable(),
    placements: z.array(campaignPlacementPresentationSchema).min(1).max(7),
  })
  .strict()
  .superRefine((presentation, context) => {
    const placements = new Set<string>();
    for (const [index, item] of presentation.placements.entries()) {
      if (placements.has(item.placement)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["placements", index, "placement"],
          message: "each campaign placement may appear only once",
        });
      }
      placements.add(item.placement);
    }
  });

export const runtimeThemeAssetMimeTypeSchema = z.enum([
  "image/avif",
  "image/webp",
  "image/png",
  "image/jpeg",
]);

const sameOriginAssetPolicySchema = z
  .object({
    kind: z.literal("same-origin"),
    pathPrefix: z
      .string()
      .min(1)
      .max(128)
      .regex(/^\/(?!\/)[A-Za-z0-9/_-]*\/$/, "same-origin pathPrefix must be an absolute directory path"),
  })
  .strict();

const httpsAssetPolicySchema = z
  .object({
    kind: z.literal("https-allowlisted"),
    allowedOrigins: z
      .array(z.string().url().refine((value) => {
        const url = new URL(value);
        return url.protocol === "https:" && url.origin === value;
      }, "allowed origin must be an HTTPS origin without a path"))
      .min(1)
      .max(16),
  })
  .strict()
  .refine((value) => new Set(value.allowedOrigins).size === value.allowedOrigins.length, {
    message: "allowed origins must be unique",
  });

export const runtimeThemeAssetSourcePolicySchema = z.union([
  sameOriginAssetPolicySchema,
  httpsAssetPolicySchema,
]);

export const runtimeThemeResponsiveAssetSourceSchema = z
  .object({
    src: z.string().min(1).max(2048),
    widthPx: z.number().int().positive().max(8192),
  })
  .strict();

export const runtimeThemeAssetSchema = z
  .object({
    id: identifierSchema,
    revision: revisionSchema,
    src: z.string().min(1).max(2048),
    mimeType: runtimeThemeAssetMimeTypeSchema,
    widthPx: z.number().int().positive().max(8192),
    heightPx: z.number().int().positive().max(8192),
    byteSize: z.number().int().positive().max(5_242_880),
    maxBytes: z.number().int().positive().max(5_242_880),
    integrity: z.string().regex(/^sha256-[A-Za-z0-9+/]{43}=$/, "integrity must be an SRI sha256 digest"),
    decorative: z.boolean(),
    altText: z.string().trim().min(1).max(160).nullable(),
    pointerEvents: z.literal("none"),
    zIndex: z.number().int().min(-1).max(10),
    preloadPriority: z.enum(["none", "low", "high"]),
    responsiveSources: z.array(runtimeThemeResponsiveAssetSourceSchema).max(8),
    fallbackAssetId: identifierSchema.nullable(),
  })
  .strict()
  .superRefine((asset, context) => {
    if (asset.byteSize > asset.maxBytes) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["byteSize"],
        message: "asset byteSize exceeds its declared maxBytes",
      });
    }
    if (asset.decorative && asset.altText !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["altText"],
        message: "decorative assets must use null altText",
      });
    }
    if (!asset.decorative && asset.altText === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["altText"],
        message: "informative assets require altText",
      });
    }
    const responsiveWidths = asset.responsiveSources.map((source) => source.widthPx);
    if (new Set(responsiveWidths).size !== responsiveWidths.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["responsiveSources"],
        message: "responsive asset widths must be unique",
      });
    }
  });

function sourceMatchesPolicy(
  source: string,
  policy: z.infer<typeof runtimeThemeAssetSourcePolicySchema>,
): boolean {
  if (policy.kind === "same-origin") {
    return source.startsWith(policy.pathPrefix) &&
      /^\/[A-Za-z0-9/_-]+\.(?:avif|webp|png|jpe?g)$/.test(source) &&
      !source.includes("..") &&
      !source.includes("\\");
  }

  try {
    const url = new URL(source);
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      policy.allowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
}

export const runtimeThemeAssetManifestSchema = z
  .object({
    revision: revisionSchema,
    sourcePolicy: runtimeThemeAssetSourcePolicySchema,
    assets: z.array(runtimeThemeAssetSchema).max(32),
  })
  .strict()
  .superRefine((manifest, context) => {
    const assetIds = new Set<string>();
    for (const [index, asset] of manifest.assets.entries()) {
      if (assetIds.has(asset.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assets", index, "id"],
          message: "asset ids must be unique",
        });
      }
      assetIds.add(asset.id);

      const sources = [asset.src, ...asset.responsiveSources.map((source) => source.src)];
      for (const source of sources) {
        if (!sourceMatchesPolicy(source, manifest.sourcePolicy)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["assets", index, "src"],
            message: "asset source violates the manifest HTTPS/same-origin policy",
          });
        }
      }
    }

    for (const [index, asset] of manifest.assets.entries()) {
      if (asset.fallbackAssetId !== null &&
          (asset.fallbackAssetId === asset.id || !assetIds.has(asset.fallbackAssetId))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["assets", index, "fallbackAssetId"],
          message: "fallbackAssetId must reference a different asset in this manifest",
        });
      }
    }

    for (const [index, asset] of manifest.assets.entries()) {
      const visited = new Set([asset.id]);
      let nextId = asset.fallbackAssetId;
      while (nextId !== null) {
        if (visited.has(nextId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["assets", index, "fallbackAssetId"],
            message: "asset fallback references must not contain a cycle",
          });
          break;
        }
        visited.add(nextId);
        nextId = manifest.assets.find((candidate) => candidate.id === nextId)?.fallbackAssetId ?? null;
      }
    }
  });

export const runtimeThemeResolutionReasonSchema = z.enum([
  "campaign-active",
  "default-no-campaign",
  "default-kill-switch",
  "default-invalid",
  "default-expired",
  "default-unknown-theme",
]);

const routeScopeSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^\/(?!\/)[A-Za-z0-9/_-]*$/, "routeScope must be a normalized internal route without query or fragment");

export const runtimeThemeEnvelopeSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    revision: revisionSchema,
    resolvedThemeId: themeIdSchema,
    role: runtimeThemeRoleSchema,
    mode: runtimeThemeModeSchema,
    cityCode: cityCodeSchema,
    campaignId: identifierSchema.nullable(),
    campaignRevision: revisionSchema.nullable(),
    cityScopeProof: z.string().min(1).max(256),
    routeScope: routeScopeSchema.nullable(),
    placementScope: z.array(runtimeThemePlacementSchema).max(7),
    tokenOverrides: allowedCampaignTokenOverridesSchema,
    presentation: campaignPresentationSchema.nullable(),
    assetManifest: runtimeThemeAssetManifestSchema.nullable(),
    effectiveAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable(),
    cacheTtlSeconds: z.number().int().min(0).max(3600),
    resolutionReason: runtimeThemeResolutionReasonSchema,
    killSwitchActive: z.boolean(),
    fallbackThemeId: z.literal("default"),
  })
  .strict()
  .superRefine((envelope, context) => {
    if ((envelope.campaignId === null) !== (envelope.campaignRevision === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["campaignRevision"],
        message: "campaignId and campaignRevision must both be present or both be null",
      });
    }
    if (envelope.expiresAt !== null &&
        Date.parse(envelope.expiresAt) <= Date.parse(envelope.effectiveAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "expiresAt must be later than effectiveAt",
      });
    }
    if (new Set(envelope.placementScope).size !== envelope.placementScope.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["placementScope"],
        message: "placementScope values must be unique",
      });
    }
    const scopedPlacements = new Set(envelope.placementScope);
    for (const [index, item] of (envelope.presentation?.placements ?? []).entries()) {
      if (!scopedPlacements.has(item.placement)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["presentation", "placements", index, "placement"],
          message: "presentation placement is outside placementScope",
        });
      }
    }
    const assetIds = new Set(envelope.assetManifest?.assets.map((asset) => asset.id) ?? []);
    for (const [index, item] of (envelope.presentation?.placements ?? []).entries()) {
      if (item.assetId !== null && !assetIds.has(item.assetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["presentation", "placements", index, "assetId"],
          message: "presentation assetId must exist in assetManifest",
        });
      }
    }
    if (envelope.killSwitchActive) {
      const hasOverrides = Object.keys(envelope.tokenOverrides).length > 0;
      if (envelope.resolvedThemeId !== "default" || envelope.campaignId !== null ||
          envelope.presentation !== null || envelope.assetManifest !== null || hasOverrides ||
          envelope.resolutionReason !== "default-kill-switch" ||
          envelope.cacheTtlSeconds !== 0 || envelope.expiresAt !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["killSwitchActive"],
          message: "an active kill switch must return a clean default fallback envelope",
        });
      }
    }
    if (envelope.resolutionReason === "campaign-active" && envelope.campaignId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["campaignId"],
        message: "campaign-active requires campaign identity and revision",
      });
    }
    if (envelope.resolutionReason === "default-kill-switch" && !envelope.killSwitchActive) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["killSwitchActive"],
        message: "default-kill-switch requires an active kill switch",
      });
    }
    if (envelope.resolutionReason !== "campaign-active") {
      const hasCampaignSurface = envelope.resolvedThemeId !== "default" ||
        envelope.campaignId !== null ||
        envelope.campaignRevision !== null ||
        envelope.placementScope.length > 0 ||
        Object.keys(envelope.tokenOverrides).length > 0 ||
        envelope.presentation !== null ||
        envelope.assetManifest !== null;
      if (hasCampaignSurface) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resolutionReason"],
          message: "default fallback reasons must not carry a campaign visual surface",
        });
      }
    }
  });

export type AllowedCampaignTokenOverridesInput = z.infer<typeof allowedCampaignTokenOverridesSchema>;
export type CampaignPresentationInput = z.infer<typeof campaignPresentationSchema>;
export type RuntimeThemeAssetManifestInput = z.infer<typeof runtimeThemeAssetManifestSchema>;
export type RuntimeThemeEnvelopeInput = z.infer<typeof runtimeThemeEnvelopeSchema>;
