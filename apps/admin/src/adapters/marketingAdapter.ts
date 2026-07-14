import type {
  CouponDefinition,
  CouponGrant,
  MarketingCampaign,
  MarketingCurrency,
} from "@xlb/types";

export function formatMarketingMoney(amountMinor: number, currency: MarketingCurrency): string {
  if (!Number.isSafeInteger(amountMinor)) return "金额无效";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function sortMarketingCampaigns(items: MarketingCampaign[]): MarketingCampaign[] {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function sortCouponDefinitions(items: CouponDefinition[]): CouponDefinition[] {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function sortCouponGrants(items: CouponGrant[]): CouponGrant[] {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function marketingErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Marketing operation failed";
}
