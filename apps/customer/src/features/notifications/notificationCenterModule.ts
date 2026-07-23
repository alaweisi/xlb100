import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerNotificationTemplate } from "./CustomerNotificationTemplate.js";

export const customerNotificationCenterSlice = defineCustomerSlice({
  id: "CSL-17",
  featureId: "notifications",
  routePatterns: ["/notifications"],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerNotificationTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerNotificationTemplateRegistration = Object.freeze({
  templateId: "CustomerNotificationTemplate",
  orchestrationLevel: "L1",
  operationalManifest: "forbidden",
  component: CustomerNotificationTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerNotificationCenterRouteModule = Object.freeze({
  featureId: "notifications",
  ownedDirectories: ["apps/customer/src/features/notifications"] as const,
  routes: [{
    slice: customerNotificationCenterSlice,
    async load() {
      return import("./NotificationCenterRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
