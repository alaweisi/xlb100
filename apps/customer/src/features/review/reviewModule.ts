import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerReviewTemplate } from "./CustomerReviewTemplate.js";

export const customerReviewSlice = defineCustomerSlice({
  id: "CSL-14",
  featureId: "review",
  routePatterns: [
    "/orders/:orderId/review",
    "/reviews/:reviewId/appeal",
  ],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerReviewTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerReviewTemplateRegistration = Object.freeze({
  templateId: "CustomerReviewTemplate",
  orchestrationLevel: "L1",
  operationalManifest: "forbidden",
  component: CustomerReviewTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerReviewFeatureRouteModule = Object.freeze({
  featureId: "review",
  ownedDirectories: ["apps/customer/src/features/review"] as const,
  routes: [{
    slice: customerReviewSlice,
    async load() {
      return import("./CustomerReviewRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
