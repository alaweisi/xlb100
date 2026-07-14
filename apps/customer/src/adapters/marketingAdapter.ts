import type { CouponGrant, CouponGrantStatus } from "@xlb/types";

const statusLabels: Record<CouponGrantStatus, string> = {
  granted: "待生效",
  available: "可使用",
  reserved: "订单处理中",
  redeemed: "已使用",
  released: "已释放",
  expired: "已过期",
  revoked: "已撤销",
};

export interface CustomerCouponGrantViewModel {
  couponGrantId: string;
  status: CouponGrantStatus;
  statusLabel: string;
  expiresAtLabel: string;
  canSelectForQuote: boolean;
  issuanceReasonLabel: string;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

export function isCustomerCouponGrantSelectable(grant: CouponGrant, now: Date = new Date()): boolean {
  const expiresAt = new Date(grant.expiresAt);
  return grant.status === "available"
    && !Number.isNaN(expiresAt.getTime())
    && expiresAt.getTime() > now.getTime();
}

export function toCustomerCouponGrantViewModel(
  grant: CouponGrant,
  now: Date = new Date(),
): CustomerCouponGrantViewModel {
  const canSelectForQuote = isCustomerCouponGrantSelectable(grant, now);
  const isExpiredAvailableGrant = grant.status === "available" && !canSelectForQuote;
  return {
    couponGrantId: grant.couponGrantId,
    status: grant.status,
    statusLabel: isExpiredAvailableGrant ? statusLabels.expired : statusLabels[grant.status],
    expiresAtLabel: formatDateTime(grant.expiresAt),
    canSelectForQuote,
    issuanceReasonLabel: grant.issuanceReason === "order_cancellation"
      ? "订单取消补偿"
      : grant.issuanceReason === "full_refund"
        ? "全额退款补偿"
        : grant.issuanceReason === "approved_compensation"
          ? "审批补偿"
          : grant.issuanceReason === "admin_manual"
            ? "运营发放"
            : "活动发放",
  };
}

export function sortCustomerCouponGrants(grants: CouponGrant[]): CouponGrant[] {
  const now = new Date();
  return [...grants].sort((left, right) => {
    const leftSelectable = isCustomerCouponGrantSelectable(left, now);
    const rightSelectable = isCustomerCouponGrantSelectable(right, now);
    if (leftSelectable && !rightSelectable) return -1;
    if (rightSelectable && !leftSelectable) return 1;
    return left.expiresAt.localeCompare(right.expiresAt);
  });
}

/** Display-only conversion of server-authoritative integer fen. */
export function formatServerMarketingMinor(amountMinor: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(amountMinor / 100);
}
