import type {
  CustomerSliceState,
  CustomerTemplateRouteContext,
} from "../../platform/slices/index.js";

export const CUSTOMER_PAYMENT_CAPABILITY = "customer.payment";
export const CUSTOMER_PAYMENT_GAP_REASON = "blocked_by_gap_02";

export interface CustomerPaymentRouteInput {
  readonly paymentOrderId: string;
}

export interface CustomerPaymentTemplateActions {
  returnToOrders(): void;
}

export type CustomerPaymentTemplateState = CustomerSliceState<never>;

export interface CustomerPaymentComponentProps {
  readonly state: CustomerPaymentTemplateState;
  readonly actions: CustomerPaymentTemplateActions;
}

export function blockedCustomerPaymentState():
CustomerPaymentTemplateState {
  return Object.freeze({
    status: "unavailable",
    capability: CUSTOMER_PAYMENT_CAPABILITY,
    reasonCode: CUSTOMER_PAYMENT_GAP_REASON,
    recovery: null,
  });
}

/**
 * CSL-08 remains fail-closed while GAP-02 is open. Parsing a route may prove
 * only that its syntax is safe; it never proves that a payment order exists.
 */
export function customerPaymentStateForRoute(
  _route: CustomerTemplateRouteContext,
): CustomerPaymentTemplateState {
  return blockedCustomerPaymentState();
}
