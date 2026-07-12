import type { CityCode } from "./city.js";

/** Contract version understood by the Phase 25 runtime theme consumer. */
export type RuntimeThemeSchemaVersion = "1.0";

export type RuntimeThemeRole =
  | "customer"
  | "worker"
  | "admin"
  | "oa"
  | "dashboard";

export type RuntimeThemeMode =
  | "light"
  | "dark"
  | "high-contrast"
  | "large-display";

export type RuntimeThemePlacement =
  | "header-decoration"
  | "hero-artwork"
  | "blessing-copy"
  | "banner"
  | "badge"
  | "ambient-background"
  | "navigation-accent";

/** Shared source of truth for the only remote L4 token paths. */
export const RUNTIME_CAMPAIGN_TOKEN_PATHS = [
  "campaign.accent",
  "campaign.ambient",
  "campaign.banner.background",
  "campaign.banner.text",
  "campaign.badge.background",
  "campaign.badge.text",
  "campaign.decoration.opacity",
  "campaign.decoration.intensity",
  "campaign.navigation.accent",
] as const;

export type RuntimeCampaignTokenPath = typeof RUNTIME_CAMPAIGN_TOKEN_PATHS[number];

/**
 * The complete L4 override surface. Protected workflow/status/focus tokens are
 * intentionally absent and therefore cannot be supplied by a campaign.
 */
export interface AllowedCampaignTokenOverrides {
  "campaign.accent"?: string;
  "campaign.ambient"?: string;
  "campaign.banner.background"?: string;
  "campaign.banner.text"?: string;
  "campaign.badge.background"?: string;
  "campaign.badge.text"?: string;
  "campaign.decoration.opacity"?: number;
  "campaign.decoration.intensity"?: number;
  "campaign.navigation.accent"?: string;
}

export interface CampaignPresentationCta {
  label: string;
  /** Application-owned allowlisted action identifier; never a URL. */
  actionKey: string;
}

export interface CampaignPlacementPresentation {
  placement: RuntimeThemePlacement;
  headline: string | null;
  body: string | null;
  badgeLabel: string | null;
  assetId: string | null;
  cta: CampaignPresentationCta | null;
}

export interface CampaignPresentation {
  revision: string;
  locale: string;
  blessingCopy: string | null;
  placements: CampaignPlacementPresentation[];
}

export type RuntimeThemeAssetMimeType =
  | "image/avif"
  | "image/webp"
  | "image/png"
  | "image/jpeg";

export type RuntimeThemeAssetSourcePolicy =
  | {
      kind: "same-origin";
      pathPrefix: string;
    }
  | {
      kind: "https-allowlisted";
      allowedOrigins: string[];
    };

export interface RuntimeThemeResponsiveAssetSource {
  src: string;
  widthPx: number;
}

export interface RuntimeThemeAsset {
  id: string;
  revision: string;
  src: string;
  mimeType: RuntimeThemeAssetMimeType;
  widthPx: number;
  heightPx: number;
  byteSize: number;
  maxBytes: number;
  integrity: string;
  decorative: boolean;
  altText: string | null;
  pointerEvents: "none";
  zIndex: number;
  preloadPriority: "none" | "low" | "high";
  responsiveSources: RuntimeThemeResponsiveAssetSource[];
  fallbackAssetId: string | null;
}

export interface RuntimeThemeAssetManifest {
  revision: string;
  sourcePolicy: RuntimeThemeAssetSourcePolicy;
  assets: RuntimeThemeAsset[];
}

export type RuntimeThemeResolutionReason =
  | "campaign-active"
  | "default-no-campaign"
  | "default-kill-switch"
  | "default-invalid"
  | "default-expired"
  | "default-unknown-theme";

export interface RuntimeThemeEnvelope {
  schemaVersion: RuntimeThemeSchemaVersion;
  revision: string;
  resolvedThemeId: string;
  role: RuntimeThemeRole;
  mode: RuntimeThemeMode;
  cityCode: CityCode;
  campaignId: string | null;
  campaignRevision: string | null;
  cityScopeProof: string;
  routeScope: string | null;
  placementScope: RuntimeThemePlacement[];
  tokenOverrides: AllowedCampaignTokenOverrides;
  presentation: CampaignPresentation | null;
  assetManifest: RuntimeThemeAssetManifest | null;
  effectiveAt: string;
  expiresAt: string | null;
  cacheTtlSeconds: number;
  resolutionReason: RuntimeThemeResolutionReason;
  killSwitchActive: boolean;
  fallbackThemeId: "default";
}
