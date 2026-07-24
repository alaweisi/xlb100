import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  CustomerPaymentGapBoundary,
  CustomerPaymentHeader,
  CustomerPaymentSafeActions,
} from "./CustomerPaymentComponents.js";
import type {
  CustomerPaymentComponentProps,
} from "./CustomerPaymentTypes.js";

export const CUSTOMER_PAYMENT_COMPONENTS = [
  "header",
  "gap-boundary",
  "safe-actions",
] as const;

export type CustomerPaymentComponentType =
  typeof CUSTOMER_PAYMENT_COMPONENTS[number];

export function createCustomerPaymentComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerPaymentComponentType,
    CustomerPaymentComponentProps
  >()
    .register("header", CustomerPaymentHeader)
    .register("gap-boundary", CustomerPaymentGapBoundary)
    .register("safe-actions", CustomerPaymentSafeActions);
}
