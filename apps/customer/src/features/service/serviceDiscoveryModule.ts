import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerDiscoveryTemplate } from "./CustomerDiscoveryTemplate.js";

export const customerServiceDiscoverySlice = defineCustomerSlice({
  id: "CSL-05",
  featureId: "service",
  routePatterns: ["/service"],
  orchestration: orchestrationPolicy("L2"),
  templateId: "CustomerDiscoveryTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerDiscoveryTemplateRegistration = Object.freeze({
  templateId: "CustomerDiscoveryTemplate",
  orchestrationLevel: "L2",
  operationalManifest: "limited",
  component: CustomerDiscoveryTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerServiceDiscoveryRouteModule = Object.freeze({
  featureId: "service",
  ownedDirectories: ["apps/customer/src/features/service"] as const,
  routes: [{
    slice: customerServiceDiscoverySlice,
    async load() {
      return import("./ServiceDiscoveryRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
