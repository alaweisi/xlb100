import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  CustomerRefundEligibilityNotice,
  CustomerRefundFeedback,
  CustomerRefundHeader,
  CustomerRefundOrderSummary,
  CustomerRefundRequestForm,
  CustomerRefundResultPanel,
  CustomerRefundStateHeader,
  type CustomerRefundComponentProps,
} from "./refundComponents.js";

export const CUSTOMER_REFUND_COMPONENTS = [
  "header",
  "feedback",
  "order-summary",
  "eligibility-notice",
  "request-form",
  "result",
] as const;

export type CustomerRefundComponentType =
  typeof CUSTOMER_REFUND_COMPONENTS[number];

export function createCustomerRefundComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerRefundComponentType,
    CustomerRefundComponentProps
  >()
    .register("header", CustomerRefundHeader)
    .register("feedback", CustomerRefundFeedback)
    .register("order-summary", CustomerRefundOrderSummary)
    .register("eligibility-notice", CustomerRefundEligibilityNotice)
    .register("request-form", CustomerRefundRequestForm)
    .register("result", CustomerRefundResultPanel);
}

export function createCustomerRefundBoundaryRegistry() {
  return new CustomerComponentRegistry<"state-header", Record<string, never>>()
    .register("state-header", CustomerRefundStateHeader);
}
