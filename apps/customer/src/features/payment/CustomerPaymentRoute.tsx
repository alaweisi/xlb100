import { useMemo } from "react";
import type {
  CustomerFeatureRouteComponentProps,
} from "../../platform/slices/index.js";
import {
  CustomerPaymentActionController,
  type CustomerPaymentNavigation,
} from "./CustomerPaymentActionController.js";
import { CustomerPaymentTemplate } from "./CustomerPaymentTemplate.js";
import {
  customerPaymentStateForRoute,
  type CustomerPaymentRouteInput,
} from "./CustomerPaymentTypes.js";
import "./customer-payment.css";

const SAFE_PAYMENT_ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

function changeBrowserRoute(path: "/orders"): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createBrowserCustomerPaymentNavigation():
Readonly<CustomerPaymentNavigation> {
  return Object.freeze({
    openOrders() {
      changeBrowserRoute("/orders");
    },
  });
}

export function parseCustomerPaymentRoute(
  route: CustomerFeatureRouteComponentProps["route"],
): CustomerPaymentRouteInput | null {
  const paymentOrderId = route.params.paymentOrderId;
  if (
    route.pattern !== "/payment/:paymentOrderId" ||
    typeof paymentOrderId !== "string" ||
    !SAFE_PAYMENT_ORDER_ID.test(paymentOrderId) ||
    route.pathname !== `/payment/${paymentOrderId}` ||
    Object.keys(route.params).length !== 1 ||
    Object.keys(route.query).length !== 0
  ) {
    return null;
  }
  return Object.freeze({ paymentOrderId });
}

export interface CustomerPaymentPageProps
  extends CustomerFeatureRouteComponentProps {
  readonly navigation?: CustomerPaymentNavigation;
}

export function CustomerPaymentPage({
  slice,
  route,
  navigation: providedNavigation,
}: CustomerPaymentPageProps) {
  const navigation = useMemo(
    () => providedNavigation ?? createBrowserCustomerPaymentNavigation(),
    [providedNavigation],
  );
  const controller = useMemo(
    () => new CustomerPaymentActionController(navigation),
    [navigation],
  );

  // Syntax validation is deliberately not used as evidence of object existence.
  parseCustomerPaymentRoute(route);
  const state = customerPaymentStateForRoute(route);
  const actions = useMemo(() => Object.freeze({
    returnToOrders() {
      controller.returnToOrders();
    },
  }), [controller]);

  return (
    <CustomerPaymentTemplate
      slice={slice}
      route={route}
      state={state}
      actions={actions}
    />
  );
}

export const RouteComponent = CustomerPaymentPage;
