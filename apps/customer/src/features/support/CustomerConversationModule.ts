import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import {
  customerSupportTicketSlice,
} from "./customerSupportTicketModule.js";
import { CustomerConversationTemplate } from "./CustomerConversationTemplate.js";

export const customerConversationSlice = defineCustomerSlice({
  id: "CSL-16",
  featureId: "support",
  routePatterns: [
    "/support/conversations",
    "/support/conversations/:conversationId",
  ],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerConversationTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerConversationTemplateRegistration = Object.freeze({
  templateId: "CustomerConversationTemplate",
  orchestrationLevel: "L1",
  operationalManifest: "forbidden",
  component: CustomerConversationTemplate,
}) satisfies CustomerTemplateRegistration;

/**
 * Integration seam for the complete Support feature. CSL-15 remains intact;
 * the final App route assembly can replace its ticket-only module with this
 * combined module without registering overlapping feature ownership.
 */
export const customerSupportFeatureRouteModule = Object.freeze({
  featureId: "support",
  ownedDirectories: ["apps/customer/src/features/support"] as const,
  routes: [
    {
      slice: customerSupportTicketSlice,
      async load() {
        return import("./CustomerSupportTicketRoute.js");
      },
    },
    {
      slice: customerConversationSlice,
      async load() {
        return import("./CustomerConversationRoute.js");
      },
    },
  ],
}) satisfies CustomerFeatureRouteModule;
