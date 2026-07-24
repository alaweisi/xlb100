import { CustomerStatePanel } from "@xlb/customer-components";
import type {
  CustomerL1TemplateProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  createCustomerCheckoutComponentRegistry,
  type CustomerCheckoutComponentType,
} from "./CheckoutComponentRegistry.js";
import type { CustomerCheckoutComponentProps } from "./checkoutComponents.js";
import type { CustomerCheckoutTemplateReadyData } from "./checkoutTypes.js";

type CheckoutTemplateState = CustomerSliceState<CustomerCheckoutTemplateReadyData>;

function dispatchRecovery(actionKey: string): void {
  window.dispatchEvent(new CustomEvent(actionKey));
}

function Boundary({
  state,
}: {
  readonly state: Exclude<CheckoutTemplateState, { readonly status: "ready" }>;
}) {
  switch (state.status) {
    case "loading":
      return (
        <div className="xlb-checkout-state" aria-busy="true">
          <CustomerStatePanel
            kind="loading"
            title="正在准备预约"
            description="正在核验当前城市的服务、报价与地址。"
          />
        </div>
      );
    case "empty":
      return (
        <div className="xlb-checkout-state">
          <CustomerStatePanel
            kind="empty"
            title="预约信息暂不完整"
            description="正式接口没有返回完成预约所需的信息。"
            actionLabel={state.recovery?.labelKey}
            onAction={state.recovery
              ? () => dispatchRecovery(state.recovery!.actionKey)
              : undefined}
          />
        </div>
      );
    case "error":
      return (
        <div className="xlb-checkout-state">
          <CustomerStatePanel
            kind="error"
            title="预约信息加载失败"
            description={state.retryable
              ? "网络或服务暂时异常，可以重新读取。"
              : "接口响应无法通过安全校验，页面不会拼装替代数据。"}
            actionLabel={state.recovery?.labelKey}
            onAction={state.recovery
              ? () => dispatchRecovery(state.recovery!.actionKey)
              : undefined}
          />
        </div>
      );
    case "conflict":
      return (
        <div className="xlb-checkout-state">
          <CustomerStatePanel
            kind="error"
            title="预约事实已经变化"
            description="报价或地址状态发生变化，需要重新读取后再继续。"
            actionLabel={state.recovery.labelKey}
            onAction={() => dispatchRecovery(state.recovery.actionKey)}
          />
        </div>
      );
    case "unavailable":
      return (
        <div className="xlb-checkout-state">
          <CustomerStatePanel
            kind="offline"
            title={state.reasonCode === "sku_not_found"
              ? "该服务无法预约"
              : "预约能力暂不可用"}
            description={state.reasonCode === "sku_not_found"
              ? "无法在当前城市正式启用的 Catalog 中核验该 SKU。"
              : "正式目录、报价、地址或下单接口不可用，页面不会使用演示数据替代。"}
            actionLabel={state.recovery?.labelKey}
            onAction={state.recovery
              ? () => dispatchRecovery(state.recovery!.actionKey)
              : undefined}
          />
        </div>
      );
  }
}

function renderRegistered(
  type: CustomerCheckoutComponentType,
  props: CustomerCheckoutComponentProps,
) {
  const Component = createCustomerCheckoutComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Checkout component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

export function CustomerCheckoutStepperTemplate({
  state,
}: CustomerL1TemplateProps) {
  const checkoutState = state as CheckoutTemplateState;
  if (checkoutState.status !== "ready") {
    return (
      <main className="xlb-checkout-shell">
        <Boundary state={checkoutState} />
      </main>
    );
  }

  const props: CustomerCheckoutComponentProps = Object.freeze({
    viewModel: checkoutState.data.viewModel,
    actions: checkoutState.data.actions,
  });
  const stepComponent: Record<
    CustomerCheckoutTemplateReadyData["viewModel"]["currentStep"],
    CustomerCheckoutComponentType
  > = {
    service: "service-quantity",
    address: "address-picker",
    schedule: "schedule-picker",
    coupon: "coupon-boundary",
    review: "order-review",
  };

  return (
    <main
      className="xlb-checkout-shell"
      data-checkout-step={props.viewModel.currentStep}
    >
      {renderRegistered("header", props)}
      {renderRegistered("step-progress", props)}
      {renderRegistered("notice", props)}
      {renderRegistered(stepComponent[props.viewModel.currentStep], props)}
    </main>
  );
}
