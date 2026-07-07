import type { Campaign, CampaignBannerContent } from "@xlb/types";

export interface PromoBannerViewModel {
  headline: string;
  subtitle?: string;
  imageUrl?: string;
  ctaLabel?: string;
}

function toBannerText(value?: string): string {
  return value?.trim() ?? "";
}

function pickBannerContent(bannerContent: CampaignBannerContent | null | undefined): PromoBannerViewModel | null {
  if (!bannerContent) {
    return null;
  }

  const title = toBannerText(bannerContent.title);
  const subtitle = toBannerText(bannerContent.subtitle);

  return {
    headline: title || "限时活动",
    subtitle: subtitle || undefined,
    imageUrl: bannerContent.imageUrl,
    ctaLabel: toBannerText(bannerContent.ctaLabel) || undefined,
  };
}

export function toPromoBannerViewModel(campaign: Campaign | null | undefined): PromoBannerViewModel | null {
  return pickBannerContent(campaign?.bannerContent);
}
