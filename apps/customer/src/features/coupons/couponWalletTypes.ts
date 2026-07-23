import type {
  CouponGrant,
  CouponGrantStatus,
  MarketingDiscountDecision,
} from "@xlb/types";

export const CUSTOMER_COUPON_GRANT_STATUSES = [
  "granted",
  "available",
  "reserved",
  "redeemed",
  "released",
  "expired",
  "revoked",
] as const satisfies readonly CouponGrantStatus[];

export type CustomerCouponStatusFilter = CouponGrantStatus | "all";

export interface CustomerCouponCheckoutContext {
  readonly skuId: string;
  readonly quantity: number;
  readonly returnPath: "/order/create";
}

export interface CustomerCouponWalletRouteInput {
  readonly status: CustomerCouponStatusFilter;
  readonly checkoutContext: CustomerCouponCheckoutContext | null;
  readonly checkoutContextInvalid: boolean;
}

export interface CustomerCouponNotice {
  readonly kind: "info" | "error" | "conflict" | "success";
  readonly message: string;
}

export interface CustomerCouponDecisionState {
  readonly grantId: string;
  readonly decision: MarketingDiscountDecision;
}

export interface CustomerCouponWalletViewModel {
  readonly grants: readonly CouponGrant[];
  readonly status: CustomerCouponStatusFilter;
  readonly refreshing: boolean;
  readonly decidingGrantId: string | null;
  readonly notice: CustomerCouponNotice | null;
  readonly decision: CustomerCouponDecisionState | null;
  readonly checkoutContext: CustomerCouponCheckoutContext | null;
  readonly checkoutContextInvalid: boolean;
  readonly cursorCapability: "unavailable";
  readonly projectionCapability: "limited";
}

export interface CustomerCouponWalletActions {
  readonly onBack: () => void;
  readonly onRefresh: () => void;
  readonly onSelectStatus: (status: CustomerCouponStatusFilter) => void;
  readonly onRequestDecision: (grant: CouponGrant) => void;
  readonly onReturnToCheckout: () => void;
  readonly onDismissNotice: () => void;
}

export interface CustomerCouponWalletTemplateReadyData {
  readonly viewModel: CustomerCouponWalletViewModel;
  readonly actions: CustomerCouponWalletActions;
}

export function mergeCouponGrants(
  current: readonly CouponGrant[],
  incoming: readonly CouponGrant[],
): readonly CouponGrant[] {
  const byId = new Map(current.map((grant) => [grant.couponGrantId, grant]));
  for (const grant of incoming) {
    const existing = byId.get(grant.couponGrantId);
    if (existing === undefined || grant.version > existing.version) {
      byId.set(grant.couponGrantId, grant);
    }
  }
  return Object.freeze([...byId.values()]);
}

export function filterCouponGrants(
  grants: readonly CouponGrant[],
  status: CustomerCouponStatusFilter,
): readonly CouponGrant[] {
  if (status === "all") return grants;
  return Object.freeze(grants.filter((grant) => grant.status === status));
}

export function maskCouponGrantId(grantId: string): string {
  if (grantId.length <= 6) return "••••";
  const suffix = grantId.slice(-6);
  return `••••${suffix}`;
}
