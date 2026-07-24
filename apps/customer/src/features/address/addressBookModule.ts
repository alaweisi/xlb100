import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerAddressBookTemplate } from "./CustomerAddressBookTemplate.js";

export const customerAddressBookSlice = defineCustomerSlice({
  id: "CSL-20",
  featureId: "address",
  routePatterns: [
    "/profile/addresses",
    "/profile/addresses/new",
    "/profile/addresses/:addressId/edit",
  ],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerAddressBookTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerAddressBookTemplateRegistration = Object.freeze({
  templateId: "CustomerAddressBookTemplate",
  orchestrationLevel: "L1",
  operationalManifest: "forbidden",
  component: CustomerAddressBookTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerAddressBookRouteModule = Object.freeze({
  featureId: "address",
  ownedDirectories: ["apps/customer/src/features/address"] as const,
  routes: [{
    slice: customerAddressBookSlice,
    async load() {
      return import("./AddressBookRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
