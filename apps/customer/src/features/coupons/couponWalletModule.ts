import {
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
  type CustomerTemplateRegistration,
} from "../../platform/slices/index.js";
import { CustomerCouponWalletTemplate } from "./CustomerCouponWalletTemplate.js";

export const customerCouponWalletSlice = defineCustomerSlice({
  id: "CSL-18",
  featureId: "coupons",
  routePatterns: ["/coupons"],
  orchestration: orchestrationPolicy("L1"),
  templateId: "CustomerCouponWalletTemplate",
  guards: ["session", "city", "protected-route"],
});

export const customerCouponWalletTemplateRegistration = Object.freeze({
  templateId: "CustomerCouponWalletTemplate",
  orchestrationLevel: "L1",
  operationalManifest: "forbidden",
  component: CustomerCouponWalletTemplate,
}) satisfies CustomerTemplateRegistration;

export const customerCouponWalletFeatureRouteModule = Object.freeze({
  featureId: "coupons",
  ownedDirectories: ["apps/customer/src/features/coupons"] as const,
  routes: [{
    slice: customerCouponWalletSlice,
    async load() {
      return import("./CouponWalletRoute.js");
    },
  }],
}) satisfies CustomerFeatureRouteModule;
