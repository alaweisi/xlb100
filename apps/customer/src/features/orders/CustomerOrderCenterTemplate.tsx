import { CustomerStatePanel } from "@xlb/customer-components";
import type {
  CustomerL1TemplateProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  createCustomerOrderCenterBoundaryRegistry,
  createCustomerOrderCenterComponentRegistry,
  type CustomerOrderCenterComponentType,
} from "./CustomerOrderCenterComponentRegistry.js";
import type {
  CustomerOrderCenterTemplateReadyData,
} from "./CustomerOrderCenterTypes.js";

type OrderCenterTemplateState =
  CustomerSliceState<CustomerOrderCenterTemplateReadyData>;

function dispatchRecovery(actionKey: string): void {
  window.dispatchEvent(new CustomEvent(actionKey));
}

function renderBoundaryHeader() {
  const Component = createCustomerOrderCenterBoundaryRegistry()
    .resolve("state-header");
  if (Component === null) {
    throw new Error("Customer Order Center boundary header is not registered");
  }
  return <Component />;
}

function CustomerOrderCenterStateBoundary({
  state,
}: {
  readonly state: Exclude<
    OrderCenterTemplateState,
    { readonly status: "ready" }
  >;
}) {
  switch (state.status) {
    case "loading":
      return (
        <CustomerStatePanel
          kind="loading"
          title="正在读取订单"
          description="正在从正式订单列表 API 获取当前分组。"
        />
      );
    case "empty":
      return (
        <CustomerStatePanel
          kind="empty"
          title="暂时没有订单"
          description="这里不会从通知历史、当前会话或本地记录拼接订单。"
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
    case "error":
      return (
        <CustomerStatePanel
          kind="error"
          title={state.errorCode === "customer_session_expired"
            ? "登录状态已失效"
            : "订单加载失败"}
          description={state.errorCode === "customer_session_expired"
            ? "请重新登录后读取本人订单。"
            : state.retryable
              ? "网络或服务暂时异常，可以重试。"
              : "订单响应无法安全展示，请稍后重试。"}
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
    case "conflict":
      return (
        <CustomerStatePanel
          kind="error"
          title="订单列表已变化"
          description="页面不会覆盖较新的服务端事实，请重新读取。"
          actionLabel={state.recovery.labelKey}
          onAction={() => dispatchRecovery(state.recovery.actionKey)}
        />
      );
    case "unavailable":
      return (
        <CustomerStatePanel
          kind="offline"
          title="订单能力暂不可用"
          description={state.reasonCode === "orders_scope_unavailable"
            ? "当前请求无法安全展示订单，页面不会确认任何订单是否存在或属于其他人。"
            : "正式订单列表 API 当前不可用；页面不会使用本地记录补齐。"}
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
  }
}

function renderRegistered(
  type: CustomerOrderCenterComponentType,
  props: CustomerOrderCenterTemplateReadyData,
) {
  const Component = createCustomerOrderCenterComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Order Center component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

export function CustomerOrderCenterTemplate({
  state,
}: CustomerL1TemplateProps) {
  const orderCenterState = state as OrderCenterTemplateState;

  if (orderCenterState.status !== "ready") {
    return (
      <main className="xlb-order-center-shell">
        {renderBoundaryHeader()}
        <div className="xlb-order-center-state">
          <CustomerOrderCenterStateBoundary state={orderCenterState} />
        </div>
      </main>
    );
  }

  const props = orderCenterState.data;
  return (
    <main className="xlb-order-center-shell">
      {renderRegistered("header", props)}
      {renderRegistered("filters", props)}
      {renderRegistered("feedback", props)}
      {renderRegistered("order-list", props)}
    </main>
  );
}
