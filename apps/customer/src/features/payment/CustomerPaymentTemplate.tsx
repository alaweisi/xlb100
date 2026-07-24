import type {
  CustomerL1TemplateProps,
} from "../../platform/slices/index.js";
import {
  createCustomerPaymentComponentRegistry,
  type CustomerPaymentComponentType,
} from "./CustomerPaymentComponentRegistry.js";
import {
  blockedCustomerPaymentState,
  type CustomerPaymentComponentProps,
  type CustomerPaymentTemplateActions,
  type CustomerPaymentTemplateState,
} from "./CustomerPaymentTypes.js";

const SAFE_NOOP_ACTIONS: CustomerPaymentTemplateActions = Object.freeze({
  returnToOrders() {},
});

export interface CustomerPaymentTemplateProps
  extends CustomerL1TemplateProps {
  readonly actions?: CustomerPaymentTemplateActions;
}

function renderRegistered(
  type: CustomerPaymentComponentType,
  props: CustomerPaymentComponentProps,
) {
  const Component = createCustomerPaymentComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Payment component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

export function CustomerPaymentTemplate({
  state,
  actions = SAFE_NOOP_ACTIONS,
}: CustomerPaymentTemplateProps) {
  const paymentState = state as CustomerPaymentTemplateState;
  const props = Object.freeze({
    state: paymentState.status === "ready"
      ? blockedCustomerPaymentState()
      : paymentState,
    actions,
  });

  return (
    <main className="xlb-payment-shell">
      {renderRegistered("header", props)}
      {renderRegistered("gap-boundary", props)}
      {renderRegistered("safe-actions", props)}
    </main>
  );
}
