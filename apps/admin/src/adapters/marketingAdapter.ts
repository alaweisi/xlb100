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
  const detail = error instanceof Error ? error.message.toLowerCase() : "";
  if (/\b401\b|unauthorized/.test(detail)) return "登录状态已失效，请重新登录。";
  if (/\b403\b|forbidden/.test(detail)) return "当前身份无权执行这项营销操作。";
  if (/\b404\b|not found/.test(detail)) return "相关营销数据已不存在，请刷新后重试。";
  if (/\b409\b|conflict/.test(detail)) return "数据状态已变化，请刷新后重新确认。";
  if (/\b400\b|\b422\b|validation|invalid/.test(detail)) return "提交内容不符合要求，请检查后重试。";
  if (/network|fetch|offline|timeout/.test(detail)) return "网络连接异常，请恢复网络后重试。";
  return "营销服务暂时不可用，请稍后重试。";
}
