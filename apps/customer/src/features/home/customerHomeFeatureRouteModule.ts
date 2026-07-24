import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerSduiPageTemplate } from "./CustomerSduiPageTemplate.js";

export const customerHomeSlice = defineCustomerSlice({
  id: "CSL-04",
  featureId: "home",
  routePatterns: ["/"],
  orchestration: orchestrationPolicy("L3"),
  templateId: "CustomerSduiPageTemplate",
  // The established P10 Home remains the safe public fallback. Auth and city
  // gates are applied by the final shell when a protected destination opens.
  guards: [],
});

export const customerHomeTemplateRegistration = Object.freeze({
  templateId: "CustomerSduiPageTemplate",
  orchestrationLevel: "L3",
  operationalManifest: "sdui",
  component: CustomerSduiPageTemplate,
}) satisfies CustomerTemplateRegistration;

/**
 * Publishes CSL-04 without mounting it. Final App/route assembly remains owned
 * by the BI integration window.
 */
export const customerHomeFeatureRouteModule = Object.freeze({
  featureId: "home",
  ownedDirectories: ["apps/customer/src/features/home"] as const,
  routes: [{
    slice: customerHomeSlice,
    async load() {
      return import("./CustomerHomeRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
