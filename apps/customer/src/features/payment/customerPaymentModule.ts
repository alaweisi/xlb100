import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerPaymentTemplate } from "./CustomerPaymentTemplate.js";

export const customerPaymentSlice = defineCustomerSlice({
  id: "CSL-08",
  featureId: "payment",
  routePatterns: ["/payment/:paymentOrderId"],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerPaymentTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerPaymentTemplateRegistration = Object.freeze({
  templateId: "CustomerPaymentTemplate",
  orchestrationLevel: "L1",
  operationalManifest: "forbidden",
  component: CustomerPaymentTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerPaymentRouteModule = Object.freeze({
  featureId: "payment",
  ownedDirectories: ["apps/customer/src/features/payment"] as const,
  routes: [{
    slice: customerPaymentSlice,
    async load() {
      return import("./CustomerPaymentRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
