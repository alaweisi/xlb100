import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerSupportTicketTemplate } from "./CustomerSupportTicketTemplate.js";

export const customerSupportTicketSlice = defineCustomerSlice({
  id: "CSL-15",
  featureId: "support",
  routePatterns: [
    "/support",
    "/support/tickets",
    "/support/tickets/:ticketId",
  ],
  orchestration: orchestrationPolicy("L2"),
  templateId: "CustomerSupportTicketTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerSupportTicketTemplateRegistration = Object.freeze({
  templateId: "CustomerSupportTicketTemplate",
  orchestrationLevel: "L2",
  operationalManifest: "limited",
  component: CustomerSupportTicketTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerSupportTicketRouteModule = Object.freeze({
  featureId: "support",
  ownedDirectories: ["apps/customer/src/features/support"] as const,
  routes: [{
    slice: customerSupportTicketSlice,
    async load() {
      return import("./CustomerSupportTicketRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
