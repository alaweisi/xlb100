import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerOrderChangeTemplate } from "./CustomerOrderChangeTemplate.js";

export const customerOrderChangeSlice = defineCustomerSlice({
  id: "CSL-11",
  featureId: "order-change",
  routePatterns: ["/orders/:orderId/change"],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerOrderChangeTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerOrderChangeTemplateRegistration = Object.freeze({
  templateId: "CustomerOrderChangeTemplate",
  orchestrationLevel: "L1",
  operationalManifest: "forbidden",
  component: CustomerOrderChangeTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerOrderChangeFeatureRouteModule = Object.freeze({
  featureId: "order-change",
  ownedDirectories: ["apps/customer/src/features/order-change"] as const,
  routes: [{
    slice: customerOrderChangeSlice,
    async load() {
      return import("./CustomerOrderChangeRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
