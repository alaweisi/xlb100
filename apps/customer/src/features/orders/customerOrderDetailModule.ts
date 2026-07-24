import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerOrderDetailTemplate } from "./CustomerOrderDetailTemplate.js";

export const customerOrderDetailSlice = defineCustomerSlice({
  id: "CSL-10",
  featureId: "orders",
  routePatterns: ["/orders/:orderId"],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerOrderDetailTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerOrderDetailTemplateRegistration = Object.freeze({
  templateId: "CustomerOrderDetailTemplate",
  orchestrationLevel: "L1",
  operationalManifest: "forbidden",
  component: CustomerOrderDetailTemplate,
}) satisfies CustomerTemplateRegistration;
