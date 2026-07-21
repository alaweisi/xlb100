import type { CityCode } from "@xlb/types";

export type CustomerDeepLinkTarget =
  | "home"
  | "services"
  | "createOrder"
  | "orders"
  | "aftersale"
  | "support"
  | "notifications"
  | "coupons"
  | "profile";

export interface CustomerDeepLinkParams {
  cityCode: CityCode;
  q?: string | null;
  categoryId?: string | null;
  skuId?: string | null;
  orderId?: string | null;
  couponGrantId?: string | null;
  complaintId?: string | null;
}

const CUSTOMER_PATH_BY_TARGET: Readonly<Record<CustomerDeepLinkTarget, string>> = Object.freeze({
  home: "/customer/",
  services: "/customer/services",
  createOrder: "/customer/order/create",
  orders: "/customer/orders",
  aftersale: "/customer/aftersale",
  support: "/customer/support",
  notifications: "/customer/notifications",
  coupons: "/customer/coupons",
  profile: "/customer/profile",
});

const ALLOWED_QUERY_KEYS: Readonly<Record<CustomerDeepLinkTarget, ReadonlyArray<keyof CustomerDeepLinkParams>>> =
  Object.freeze({
    home: ["cityCode"],
    services: ["cityCode", "q", "categoryId", "skuId"],
    createOrder: ["cityCode", "skuId", "couponGrantId"],
    orders: ["cityCode", "orderId"],
    aftersale: ["cityCode", "orderId"],
    support: ["cityCode", "orderId", "complaintId"],
    notifications: ["cityCode"],
    coupons: ["cityCode"],
    profile: ["cityCode"],
  });

function normalized(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

/**
 * Builds a same-origin Customer route with an explicit city scope.
 *
 * Each destination owns a query allowlist so source-only identifiers cannot
 * leak into the next page. This function does not validate whether an ID
 * exists; the destination must recover against its authoritative API result.
 */
export function buildCustomerDeepLink(
  target: CustomerDeepLinkTarget,
  input: CustomerDeepLinkParams,
): string {
  const query = new URLSearchParams();
  for (const key of ALLOWED_QUERY_KEYS[target]) {
    const value = normalized(input[key]);
    if (value) query.set(key, value);
  }
  return `${CUSTOMER_PATH_BY_TARGET[target]}?${query.toString()}`;
}

export function assignCustomerDeepLink(
  target: CustomerDeepLinkTarget,
  input: CustomerDeepLinkParams,
): string {
  const href = buildCustomerDeepLink(target, input);
  if (typeof window !== "undefined") window.location.assign(href);
  return href;
}

export function replaceCustomerDeepLink(
  target: CustomerDeepLinkTarget,
  input: CustomerDeepLinkParams,
): string {
  const href = buildCustomerDeepLink(target, input);
  if (typeof window !== "undefined") window.history.replaceState({}, "", href);
  return href;
}
