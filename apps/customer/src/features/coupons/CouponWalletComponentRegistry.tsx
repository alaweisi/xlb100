import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  CouponCapabilityNotice,
  CouponDecisionFeedback,
  CouponGrantList,
  CouponStatusFilters,
  CouponWalletHeader,
  type CustomerCouponComponentProps,
} from "./couponWalletComponents.js";

export const CUSTOMER_COUPON_WALLET_COMPONENTS = [
  "header",
  "capability-notice",
  "status-filters",
  "decision-feedback",
  "grant-list",
] as const;

export type CustomerCouponWalletComponentType =
  typeof CUSTOMER_COUPON_WALLET_COMPONENTS[number];

export function createCustomerCouponWalletComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerCouponWalletComponentType,
    CustomerCouponComponentProps
  >()
    .register("header", CouponWalletHeader)
    .register("capability-notice", CouponCapabilityNotice)
    .register("status-filters", CouponStatusFilters)
    .register("decision-feedback", CouponDecisionFeedback)
    .register("grant-list", CouponGrantList);
}
