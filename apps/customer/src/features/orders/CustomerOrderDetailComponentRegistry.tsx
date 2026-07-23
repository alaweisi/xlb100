import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  CustomerEvidenceGallery,
  CustomerFulfillmentTimeline,
  CustomerOrderDetailBoundaryHeader,
  CustomerOrderDetailFeedback,
  CustomerOrderDetailHeader,
  CustomerOrderSnapshot,
  CustomerOrderStateAwareActionBar,
  CustomerRelatedCaseSummary,
  type CustomerOrderDetailComponentProps,
} from "./CustomerOrderDetailComponents.js";

export const CUSTOMER_ORDER_DETAIL_COMPONENTS = [
  "header",
  "feedback",
  "order-snapshot",
  "fulfillment",
  "evidence",
  "related",
  "action-bar",
] as const;

export type CustomerOrderDetailComponentType =
  typeof CUSTOMER_ORDER_DETAIL_COMPONENTS[number];

export function createCustomerOrderDetailComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerOrderDetailComponentType,
    CustomerOrderDetailComponentProps
  >()
    .register("header", CustomerOrderDetailHeader)
    .register("feedback", CustomerOrderDetailFeedback)
    .register("order-snapshot", CustomerOrderSnapshot)
    .register("fulfillment", CustomerFulfillmentTimeline)
    .register("evidence", CustomerEvidenceGallery)
    .register("related", CustomerRelatedCaseSummary)
    .register("action-bar", CustomerOrderStateAwareActionBar);
}

export function createCustomerOrderDetailBoundaryRegistry() {
  return new CustomerComponentRegistry<"state-header", Record<string, never>>()
    .register("state-header", CustomerOrderDetailBoundaryHeader);
}
