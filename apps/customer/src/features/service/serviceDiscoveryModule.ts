import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerDiscoveryTemplate } from "./CustomerDiscoveryTemplate.js";
import { CustomerSkuDetailTemplate } from "./CustomerSkuDetailTemplate.js";

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

export const customerServiceDetailSlice = defineCustomerSlice({
  id: "CSL-06",
  featureId: "service",
  routePatterns: ["/service/:skuId"],
  orchestration: orchestrationPolicy("L2"),
  templateId: "CustomerSkuDetailTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerSkuDetailTemplateRegistration = Object.freeze({
  templateId: "CustomerSkuDetailTemplate",
  orchestrationLevel: "L2",
  operationalManifest: "limited",
  component: CustomerSkuDetailTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerServiceDiscoveryRouteModule = Object.freeze({
  featureId: "service",
  ownedDirectories: ["apps/customer/src/features/service"] as const,
  routes: [{
    slice: customerServiceDiscoverySlice,
    async load() {
      return import("./ServiceDiscoveryRoute.js");
    },
  }, {
    slice: customerServiceDetailSlice,
    async load() {
      return import("./ServiceDetailRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;

export const customerServiceFeatureRouteModule = customerServiceDiscoveryRouteModule;
