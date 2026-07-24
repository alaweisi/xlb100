import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  ReviewAppealManager,
  ReviewBoundaryHeader,
  ReviewComposer,
  ReviewFeedback,
  ReviewHeader,
  ReviewSummary,
  type CustomerReviewComponentProps,
} from "./reviewComponents.js";

export const CUSTOMER_REVIEW_COMPONENTS = [
  "header",
  "feedback",
  "review-summary",
  "review-composer",
  "appeal-manager",
] as const;

export type CustomerReviewComponentType =
  typeof CUSTOMER_REVIEW_COMPONENTS[number];

export function createCustomerReviewComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerReviewComponentType,
    CustomerReviewComponentProps
  >()
    .register("header", ReviewHeader)
    .register("feedback", ReviewFeedback)
    .register("review-summary", ReviewSummary)
    .register("review-composer", ReviewComposer)
    .register("appeal-manager", ReviewAppealManager);
}

export function createCustomerReviewBoundaryRegistry() {
  return new CustomerComponentRegistry<"state-header", Record<string, never>>()
    .register("state-header", ReviewBoundaryHeader);
}
