import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerCheckoutStepperTemplate } from "./CustomerCheckoutStepperTemplate.js";

export const customerCheckoutSlice = defineCustomerSlice({
  id: "CSL-07",
  featureId: "checkout",
  routePatterns: ["/order/create"],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerCheckoutStepperTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerCheckoutTemplateRegistration = Object.freeze({
  templateId: "CustomerCheckoutStepperTemplate",
  orchestrationLevel: "L1",
  operationalManifest: "forbidden",
  component: CustomerCheckoutStepperTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerCheckoutFeatureRouteModule = Object.freeze({
  featureId: "checkout",
  ownedDirectories: ["apps/customer/src/features/checkout"] as const,
  routes: [{
    slice: customerCheckoutSlice,
    async load() {
      return import("./CheckoutRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
