import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerOrderCenterTemplate } from "./CustomerOrderCenterTemplate.js";

export const customerOrderCenterSlice = defineCustomerSlice({
  id: "CSL-09",
  featureId: "orders",
  routePatterns: ["/orders"],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerOrderCenterTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerOrderCenterTemplateRegistration = Object.freeze({
  templateId: "CustomerOrderCenterTemplate",
  orchestrationLevel: "L1",
  operationalManifest: "forbidden",
  component: CustomerOrderCenterTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerOrderCenterRouteModule = Object.freeze({
  featureId: "orders",
  ownedDirectories: ["apps/customer/src/features/orders"] as const,
  routes: [{
    slice: customerOrderCenterSlice,
    async load() {
      return import("./CustomerOrderCenterRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
