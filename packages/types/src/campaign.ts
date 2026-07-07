import type { AppType } from "./app.js";
import type { CityCode } from "./city.js";

export type CampaignStatus = "draft" | "scheduled" | "active" | "ended" | "revoked";

export type CampaignThemeId =
  | "default"
  | "spring-festival"
  | "double11"
  | (string & { readonly __campaignThemeId?: never });

export type CampaignAppScope = Extract<AppType, "customer" | "worker" | "admin"> | "all";

export type CampaignCityScope =
  | { mode: "all" }
  | { mode: "include"; cityCodes: CityCode[] };

export interface CampaignBannerContent {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  ctaLabel?: string;
}

export interface Campaign {
  id: string;
  name: string;
  themeId: CampaignThemeId;
  cityScope: CampaignCityScope;
  appScope: CampaignAppScope[];
  startAt: string;
  endAt: string;
  discountRuleId: string | null;
  bannerContent: CampaignBannerContent | null;
  status: CampaignStatus;
}

export interface ActiveCampaignRequest {
  cityCode: CityCode;
  appScope: Exclude<CampaignAppScope, "all">;
  route?: string;
}

export interface ActiveCampaignResponse {
  campaign: Campaign | null;
  themeId: CampaignThemeId;
  bannerContent: CampaignBannerContent | null;
  source: "campaign-service" | "default-fallback";
}
