import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerRefundTemplate } from "./CustomerRefundTemplate.js";

export const customerRefundSlice = defineCustomerSlice({
  id: "CSL-12",
  featureId: "refund",
  routePatterns: ["/orders/:orderId/refund"],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerRefundTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerRefundTemplateRegistration = Object.freeze({
  templateId: "CustomerRefundTemplate",
  orchestrationLevel: "L1",
  operationalManifest: "forbidden",
  component: CustomerRefundTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerRefundFeatureRouteModule = Object.freeze({
  featureId: "refund",
  ownedDirectories: ["apps/customer/src/features/refund"] as const,
  routes: [{
    slice: customerRefundSlice,
    async load() {
      return import("./CustomerRefundRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
