import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  OrderChangeActionForm,
  OrderChangeFeedback,
  OrderChangeHeader,
  OrderChangeHistory,
  OrderChangeOrderSummary,
  OrderChangeStateHeader,
  type CustomerOrderChangeComponentProps,
} from "./orderChangeComponents.js";

export const CUSTOMER_ORDER_CHANGE_COMPONENTS = [
  "header",
  "feedback",
  "order-summary",
  "action-form",
  "reverse-history",
] as const;

export type CustomerOrderChangeComponentType =
  typeof CUSTOMER_ORDER_CHANGE_COMPONENTS[number];

export function createCustomerOrderChangeComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerOrderChangeComponentType,
    CustomerOrderChangeComponentProps
  >()
    .register("header", OrderChangeHeader)
    .register("feedback", OrderChangeFeedback)
    .register("order-summary", OrderChangeOrderSummary)
    .register("action-form", OrderChangeActionForm)
    .register("reverse-history", OrderChangeHistory);
}

export function createCustomerOrderChangeBoundaryRegistry() {
  return new CustomerComponentRegistry<"state-header", Record<string, never>>()
    .register("state-header", OrderChangeStateHeader);
}
