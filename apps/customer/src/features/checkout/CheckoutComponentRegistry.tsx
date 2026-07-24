import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  CheckoutAddressPicker,
  CheckoutCouponBoundary,
  CheckoutHeader,
  CheckoutNotice,
  CheckoutOrderReview,
  CheckoutSchedulePicker,
  CheckoutServiceQuantity,
  CheckoutStepProgress,
  type CustomerCheckoutComponentProps,
} from "./checkoutComponents.js";

export const CUSTOMER_CHECKOUT_COMPONENTS = [
  "header",
  "step-progress",
  "notice",
  "service-quantity",
  "address-picker",
  "schedule-picker",
  "coupon-boundary",
  "order-review",
] as const;

export type CustomerCheckoutComponentType =
  typeof CUSTOMER_CHECKOUT_COMPONENTS[number];

export function createCustomerCheckoutComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerCheckoutComponentType,
    CustomerCheckoutComponentProps
  >()
    .register("header", CheckoutHeader)
    .register("step-progress", CheckoutStepProgress)
    .register("notice", CheckoutNotice)
    .register("service-quantity", CheckoutServiceQuantity)
    .register("address-picker", CheckoutAddressPicker)
    .register("schedule-picker", CheckoutSchedulePicker)
    .register("coupon-boundary", CheckoutCouponBoundary)
    .register("order-review", CheckoutOrderReview);
}
