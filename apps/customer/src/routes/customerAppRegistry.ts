import {
  customerProfileRouteModule,
  customerProfileTemplateRegistration,
} from "../features/account/customerProfileModule.js";
import {
  customerAddressBookRouteModule,
  customerAddressBookTemplateRegistration,
} from "../features/address/addressBookModule.js";
import {
  customerAftersaleFeatureRouteModule,
  customerAftersaleTemplateRegistration,
} from "../features/aftersale/aftersaleModule.js";
import {
  customerCheckoutFeatureRouteModule,
  customerCheckoutTemplateRegistration,
} from "../features/checkout/checkoutModule.js";
import {
  customerCouponWalletFeatureRouteModule,
  customerCouponWalletTemplateRegistration,
} from "../features/coupons/couponWalletModule.js";
import {
  customerHomeFeatureRouteModule,
  customerHomeTemplateRegistration,
} from "../features/home/customerHomeFeatureRouteModule.js";
import {
  customerNotificationCenterRouteModule,
  customerNotificationTemplateRegistration,
} from "../features/notifications/notificationCenterModule.js";
import {
  customerOrderChangeFeatureRouteModule,
  customerOrderChangeTemplateRegistration,
} from "../features/order-change/orderChangeModule.js";
import {
  customerOrderCenterTemplateRegistration,
  customerOrdersRouteModule,
} from "../features/orders/customerOrderCenterModule.js";
import {
  customerOrderDetailTemplateRegistration,
} from "../features/orders/customerOrderDetailModule.js";
import {
  customerPaymentRouteModule,
  customerPaymentTemplateRegistration,
} from "../features/payment/customerPaymentModule.js";
import {
  customerRefundFeatureRouteModule,
  customerRefundTemplateRegistration,
} from "../features/refund/customerRefundModule.js";
import {
  customerReviewFeatureRouteModule,
  customerReviewTemplateRegistration,
} from "../features/review/reviewModule.js";
import {
  customerDiscoveryTemplateRegistration,
  customerServiceFeatureRouteModule,
  customerSkuDetailTemplateRegistration,
} from "../features/service/serviceDiscoveryModule.js";
import {
  customerAppShellSlice,
  customerEntryFeatureRouteModule,
  customerEntryTemplateRegistrations,
} from "../features/shell/customerEntryFeatureRouteModule.js";
import {
  customerConversationTemplateRegistration,
  customerSupportFeatureRouteModule,
} from "../features/support/CustomerConversationModule.js";
import {
  customerSupportTicketTemplateRegistration,
} from "../features/support/customerSupportTicketModule.js";
import {
  CustomerFeatureRouteRegistry,
  CustomerTemplateRegistry,
  type CustomerFeatureRouteModule,
  type CustomerFeatureRouteRegistration,
  type CustomerRoutePattern,
  type CustomerSliceDefinition,
  type CustomerTemplateRegistration,
} from "../platform/slices/index.js";

export const CUSTOMER_APP_FEATURE_ROUTE_MODULES = Object.freeze([
  customerEntryFeatureRouteModule,
  customerHomeFeatureRouteModule,
  customerServiceFeatureRouteModule,
  customerCheckoutFeatureRouteModule,
  customerPaymentRouteModule,
  customerOrdersRouteModule,
  customerOrderChangeFeatureRouteModule,
  customerRefundFeatureRouteModule,
  customerAftersaleFeatureRouteModule,
  customerReviewFeatureRouteModule,
  customerSupportFeatureRouteModule,
  customerNotificationCenterRouteModule,
  customerCouponWalletFeatureRouteModule,
  customerProfileRouteModule,
  customerAddressBookRouteModule,
] satisfies readonly CustomerFeatureRouteModule[]);

export const CUSTOMER_APP_TEMPLATE_REGISTRATIONS = Object.freeze([
  ...customerEntryTemplateRegistrations,
  customerHomeTemplateRegistration,
  customerDiscoveryTemplateRegistration,
  customerSkuDetailTemplateRegistration,
  customerCheckoutTemplateRegistration,
  customerPaymentTemplateRegistration,
  customerOrderCenterTemplateRegistration,
  customerOrderDetailTemplateRegistration,
  customerOrderChangeTemplateRegistration,
  customerRefundTemplateRegistration,
  customerAftersaleTemplateRegistration,
  customerReviewTemplateRegistration,
  customerSupportTicketTemplateRegistration,
  customerConversationTemplateRegistration,
  customerNotificationTemplateRegistration,
  customerCouponWalletTemplateRegistration,
  customerProfileTemplateRegistration,
  customerAddressBookTemplateRegistration,
] satisfies readonly CustomerTemplateRegistration[]);

export interface CustomerPublishedRoute {
  readonly pattern: CustomerRoutePattern;
  readonly registration: CustomerFeatureRouteRegistration;
}

export interface CustomerAppRouteAssembly {
  readonly featureRegistry: CustomerFeatureRouteRegistry;
  readonly templateRegistry: CustomerTemplateRegistry;
  readonly slices: readonly CustomerSliceDefinition[];
  readonly routes: readonly CustomerPublishedRoute[];
}

export function createCustomerAppRouteAssembly(): CustomerAppRouteAssembly {
  const featureRegistry = new CustomerFeatureRouteRegistry();
  for (const module of CUSTOMER_APP_FEATURE_ROUTE_MODULES) {
    featureRegistry.register(module);
  }
  featureRegistry.seal();

  const templateRegistry = new CustomerTemplateRegistry();
  for (const registration of CUSTOMER_APP_TEMPLATE_REGISTRATIONS) {
    templateRegistry.register(registration);
  }
  templateRegistry.seal();

  const routeSlices = CUSTOMER_APP_FEATURE_ROUTE_MODULES.flatMap((module) =>
    module.routes.map((route) => route.slice)
  );
  const slices = Object.freeze([customerAppShellSlice, ...routeSlices]);
  const sliceIds = new Set(slices.map((slice) => slice.id));
  if (sliceIds.size !== slices.length) {
    throw new Error("Customer App contains duplicate slice ids");
  }
  for (const slice of slices) {
    if (templateRegistry.resolveForSlice(slice) === null) {
      throw new Error(`Customer slice ${slice.id} has no registered template`);
    }
  }

  const routes = Object.freeze(CUSTOMER_APP_FEATURE_ROUTE_MODULES.flatMap((module) =>
    module.routes.flatMap((registration) =>
      registration.slice.routePatterns.map((pattern) =>
        Object.freeze({ pattern, registration })
      )
    )
  ));

  return Object.freeze({
    featureRegistry,
    templateRegistry,
    slices,
    routes,
  });
}

export const customerAppRouteAssembly = createCustomerAppRouteAssembly();
