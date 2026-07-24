import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerAuthTemplate } from "../auth/CustomerAuthTemplate.js";
import { CustomerLocationTemplate } from "../location/CustomerLocationTemplate.js";
import { CustomerAppShellTemplate } from "./CustomerAppShellTemplate.js";

export const customerAppShellSlice = defineCustomerSlice({
  id: "CSL-01",
  featureId: "entry-guard",
  // CSL-01 wraps the route tree at integration time; it is intentionally not
  // registered as a leaf route in this module.
  routePatterns: ["/"],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerAppShellTemplate",
  guards: [],
});

export const customerAuthSlice = defineCustomerSlice({
  id: "CSL-02",
  featureId: "entry-guard",
  routePatterns: ["/auth/login"],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerAuthTemplate",
  guards: [],
});

export const customerLocationSlice = defineCustomerSlice({
  id: "CSL-03",
  featureId: "entry-guard",
  routePatterns: ["/location"],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerLocationTemplate",
  guards: [],
});

export const customerEntryTemplateRegistrations: readonly CustomerTemplateRegistration[] =
  Object.freeze([
    Object.freeze({
      templateId: "CustomerAppShellTemplate",
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
      component: CustomerAppShellTemplate,
    }),
    Object.freeze({
      templateId: "CustomerAuthTemplate",
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
      component: CustomerAuthTemplate,
    }),
    Object.freeze({
      templateId: "CustomerLocationTemplate",
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
      component: CustomerLocationTemplate,
    }),
  ]);

/**
 * Publishes only the two leaf entry routes. The shell wrapper and final route
 * tree remain integration-owned as required by the B0 foundation.
 */
export const customerEntryFeatureRouteModule: CustomerFeatureRouteModule =
  Object.freeze({
    featureId: "entry-guard",
    ownedDirectories: Object.freeze([
      "apps/customer/src/features/shell",
      "apps/customer/src/features/auth",
      "apps/customer/src/features/location",
    ] as const),
    routes: Object.freeze([
      Object.freeze({
        slice: customerAuthSlice,
        async load() {
          const module = await import("../auth/CustomerAuthRoute.js");
          return { RouteComponent: module.CustomerAuthRoute };
        },
      }),
      Object.freeze({
        slice: customerLocationSlice,
        async load() {
          const module = await import("../location/CustomerLocationRoute.js");
          return { RouteComponent: module.CustomerLocationRoute };
        },
      }),
    ]),
  });
