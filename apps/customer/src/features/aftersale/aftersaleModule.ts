import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerAftersaleCaseTemplate } from "./CustomerAftersaleCaseTemplate.js";

export const customerAftersaleSlice = defineCustomerSlice({
  id: "CSL-13",
  featureId: "aftersale",
  routePatterns: [
    "/orders/:orderId/aftersale",
    "/aftersale/:complaintId",
  ],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerAftersaleCaseTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerAftersaleTemplateRegistration = Object.freeze({
  templateId: "CustomerAftersaleCaseTemplate",
  orchestrationLevel: "L1",
  operationalManifest: "forbidden",
  component: CustomerAftersaleCaseTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerAftersaleFeatureRouteModule = Object.freeze({
  featureId: "aftersale",
  ownedDirectories: ["apps/customer/src/features/aftersale"] as const,
  routes: [{
    slice: customerAftersaleSlice,
    async load() {
      return import("./CustomerAftersaleRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
