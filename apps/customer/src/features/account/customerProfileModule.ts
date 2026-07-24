import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerProfileTemplate } from "./CustomerProfileTemplate.js";

export const customerProfileSlice = defineCustomerSlice({
  id: "CSL-19",
  featureId: "account",
  routePatterns: ["/profile"],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerProfileTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerProfileTemplateRegistration = Object.freeze({
  templateId: "CustomerProfileTemplate",
  orchestrationLevel: "L1",
  operationalManifest: "forbidden",
  component: CustomerProfileTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerProfileRouteModule = Object.freeze({
  featureId: "account",
  ownedDirectories: ["apps/customer/src/features/account"] as const,
  routes: [{
    slice: customerProfileSlice,
    async load() {
      return import("./CustomerProfileRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
