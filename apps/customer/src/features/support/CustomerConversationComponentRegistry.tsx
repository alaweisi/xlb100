import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  CustomerConversationCapabilityList,
  CustomerConversationCsatBoundary,
  CustomerConversationFallbackActions,
  CustomerConversationGapStatus,
  CustomerConversationHeader,
  CustomerConversationReferenceSeam,
  type CustomerConversationComponentProps,
} from "./CustomerConversationComponents.js";

export const CUSTOMER_CONVERSATION_COMPONENTS = Object.freeze([
  "header",
  "gap-status",
  "reference-seam",
  "capability-list",
  "csat-boundary",
  "fallback-actions",
] as const);

export type CustomerConversationComponentType =
  typeof CUSTOMER_CONVERSATION_COMPONENTS[number];

export function createCustomerConversationComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerConversationComponentType,
    CustomerConversationComponentProps
  >()
    .register("header", CustomerConversationHeader)
    .register("gap-status", CustomerConversationGapStatus)
    .register("reference-seam", CustomerConversationReferenceSeam)
    .register("capability-list", CustomerConversationCapabilityList)
    .register("csat-boundary", CustomerConversationCsatBoundary)
    .register("fallback-actions", CustomerConversationFallbackActions);
}
