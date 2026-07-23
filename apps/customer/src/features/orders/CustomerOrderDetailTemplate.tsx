import type { CustomerL1TemplateProps } from "../../platform/slices/index.js";
import type { CustomerSliceState } from "../../platform/slices/index.js";
import {
  createCustomerOrderDetailBoundaryRegistry,
  createCustomerOrderDetailComponentRegistry,
  CUSTOMER_ORDER_DETAIL_COMPONENTS,
  type CustomerOrderDetailComponentType,
} from "./CustomerOrderDetailComponentRegistry.js";
import { CustomerOrderDetailStatePanel } from "./CustomerOrderDetailComponents.js";
import type {
  CustomerOrderDetailTemplateReadyData,
} from "./CustomerOrderDetailTypes.js";

type OrderDetailTemplateState =
  CustomerSliceState<CustomerOrderDetailTemplateReadyData>;

function dispatchRecovery(actionKey: string): void {
  window.dispatchEvent(new CustomEvent(actionKey));
}

function BoundaryHeader() {
  const Component = createCustomerOrderDetailBoundaryRegistry()
    .resolve("state-header");
  if (Component === null) {
    throw new Error("Customer Order Detail boundary header is not registered");
  }
  return <Component />;
}

function StateBoundary({
  state,
}: {
  readonly state: Exclude<
    OrderDetailTemplateState,
    { readonly status: "ready" }
  >;
}) {
  switch (state.status) {
    case "loading":
      return (
        <CustomerOrderDetailStatePanel
          kind="loading"
          title="正在读取订单详情"
          description="正在独立读取订单、履约、确认、逆向、投诉与评价事实。"
        />
      );
    case "empty":
      return (
        <CustomerOrderDetailStatePanel
          kind="empty"
          title="没有可展示的订单详情"
          description="页面不会从本地记录或模拟数据补齐订单。"
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
    case "error":
      return (
        <CustomerOrderDetailStatePanel
          kind="error"
          title={state.errorCode === "customer_session_expired"
            ? "登录状态已失效"
            : state.errorCode === "invalid_order_detail_route"
              ? "订单链接无效"
              : "订单详情加载失败"}
          description={state.errorCode === "customer_session_expired"
            ? "请重新登录后恢复这个安全订单链接。"
            : state.errorCode === "invalid_order_detail_route"
              ? "订单标识未通过校验，已拒绝请求。"
              : "服务端事实暂时无法安全展示。"}
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
    case "conflict":
      return (
        <CustomerOrderDetailStatePanel
          kind="error"
          title="订单事实已变化"
          description="页面不会在前端修改状态；请重新读取权威事实。"
          actionLabel={state.recovery.labelKey}
          onAction={() => dispatchRecovery(state.recovery.actionKey)}
        />
      );
    case "unavailable":
      return (
        <CustomerOrderDetailStatePanel
          kind="offline"
          title="订单详情不可用"
          description={state.reasonCode === "order_scope_unavailable"
            ? "该订单无法安全展示；页面不会透露资源是否存在或是否属于其他人。"
            : "正式订单详情能力暂不可用，页面不会使用本地或模拟事实替代。"}
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
  }
}

function renderRegistered(
  type: CustomerOrderDetailComponentType,
  props: CustomerOrderDetailTemplateReadyData,
) {
  const Component = createCustomerOrderDetailComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Order Detail component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

export function CustomerOrderDetailTemplate({
  state,
}: CustomerL1TemplateProps) {
  const orderDetailState = state as OrderDetailTemplateState;
  if (orderDetailState.status !== "ready") {
    return (
      <main className="xlb-order-detail-shell">
        <BoundaryHeader />
        <div className="xlb-order-detail-boundary">
          <StateBoundary state={orderDetailState} />
        </div>
      </main>
    );
  }
  return (
    <main className="xlb-order-detail-shell">
      {CUSTOMER_ORDER_DETAIL_COMPONENTS.map((type) =>
        renderRegistered(type, orderDetailState.data)
      )}
    </main>
  );
}
