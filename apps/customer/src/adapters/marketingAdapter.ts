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
  statusDescription: string;
  statusTone: "primary" | "success" | "warning" | "danger" | "muted";
  expiresAtLabel: string;
  availabilityLabel: string;
  updatedAtLabel: string;
  canSelectForQuote: boolean;
  isStale: boolean;
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
  const effectiveStatus = isExpiredAvailableGrant ? "expired" : grant.status;
  const statusDescription: Record<CouponGrantStatus, string> = {
    granted: "优惠券正在准备中，生效后才可带入报价。",
    available: "可带入下单页，由服务端核算最终优惠。",
    reserved: "已进入订单处理，请在对应订单中查看最新结果。",
    redeemed: "该优惠券已在订单中使用。",
    released: "订单处理已释放该券，请刷新后确认是否恢复可用。",
    expired: "该优惠券已超过有效期，不能再用于报价。",
    revoked: "该优惠券已撤销，不能再用于报价。",
  };
  const statusTone: Record<CouponGrantStatus, CustomerCouponGrantViewModel["statusTone"]> = {
    granted: "warning",
    available: "success",
    reserved: "primary",
    redeemed: "muted",
    released: "warning",
    expired: "muted",
    revoked: "danger",
  };
  const availabilityLabel: Record<CouponGrantStatus, string> = {
    granted: "等待生效",
    available: "现在可用于服务报价",
    reserved: "已用于订单处理",
    redeemed: "本券已经使用",
    released: "订单已释放此券",
    expired: "有效期已结束",
    revoked: "权益已被撤销",
  };
  const availableAt = grant.availableAt ? formatDateTime(grant.availableAt) : null;
  return {
    couponGrantId: grant.couponGrantId,
    status: grant.status,
    statusLabel: statusLabels[effectiveStatus],
    statusDescription: statusDescription[effectiveStatus],
    statusTone: statusTone[effectiveStatus],
    expiresAtLabel: formatDateTime(grant.expiresAt),
    availabilityLabel: effectiveStatus === "granted" && availableAt
      ? `${availableAt} 后可使用`
      : availabilityLabel[effectiveStatus],
    updatedAtLabel: formatDateTime(grant.updatedAt),
    canSelectForQuote,
    isStale: isExpiredAvailableGrant,
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

export function sortCustomerCouponGrants(grants: CouponGrant[], now = new Date()): CouponGrant[] {
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
