import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  CustomerOrderCenterBoundaryHeader,
  CustomerOrderCenterFeedback,
  CustomerOrderCenterFilters,
  CustomerOrderCenterHeader,
  CustomerOrderCenterList,
  type CustomerOrderCenterComponentProps,
} from "./CustomerOrderCenterComponents.js";

export const CUSTOMER_ORDER_CENTER_COMPONENTS = [
  "header",
  "filters",
  "feedback",
  "order-list",
] as const;

export type CustomerOrderCenterComponentType =
  typeof CUSTOMER_ORDER_CENTER_COMPONENTS[number];

export function createCustomerOrderCenterComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerOrderCenterComponentType,
    CustomerOrderCenterComponentProps
  >()
    .register("header", CustomerOrderCenterHeader)
    .register("filters", CustomerOrderCenterFilters)
    .register("feedback", CustomerOrderCenterFeedback)
    .register("order-list", CustomerOrderCenterList);
}

export function createCustomerOrderCenterBoundaryRegistry() {
  return new CustomerComponentRegistry<"state-header", Record<string, never>>()
    .register("state-header", CustomerOrderCenterBoundaryHeader);
}
