import { CustomerStatePanel } from "@xlb/customer-components";
import type {
  CustomerL1TemplateProps,
} from "../../platform/slices/index.js";
import {
  createCustomerOrderChangeBoundaryRegistry,
  createCustomerOrderChangeComponentRegistry,
  type CustomerOrderChangeComponentType,
} from "./OrderChangeComponentRegistry.js";
import type {
  CustomerOrderChangeTemplateData,
  CustomerOrderChangeTemplateState,
} from "./orderChangeTypes.js";

export const CUSTOMER_ORDER_CHANGE_RETRY_EVENT =
  "xlb:customer-order-change-retry";

function boundaryHeader() {
  const Component = createCustomerOrderChangeBoundaryRegistry()
    .resolve("state-header");
  if (Component === null) {
    throw new Error("Order Change boundary header is not registered");
  }
  return <Component />;
}

function retryButtonLabel(retryable: boolean): string | undefined {
  return retryable ? "重新读取" : undefined;
}

function Boundary({
  state,
}: {
  readonly state: Exclude<
    CustomerOrderChangeTemplateState,
    { readonly data: CustomerOrderChangeTemplateData }
  >;
}) {
  const retry = () => {
    window.dispatchEvent(
      new CustomEvent(CUSTOMER_ORDER_CHANGE_RETRY_EVENT),
    );
  };
  switch (state.status) {
    case "loading":
      return (
        <CustomerStatePanel
          kind="loading"
          title="正在读取订单变更"
          description="正在同时读取权威订单与变更记录。"
        />
      );
    case "error":
      return (
        <CustomerStatePanel
          kind="error"
          title="订单变更加载失败"
          description={state.retryable
            ? "网络或服务暂时异常，可以重新读取。"
            : "服务端响应无法安全展示，请返回后重试。"}
          actionLabel={retryButtonLabel(state.retryable)}
          onAction={state.retryable ? retry : undefined}
        />
      );
    case "forbidden_or_not_found":
      return (
        <CustomerStatePanel
          kind="offline"
          title="无法查看此订单"
          description="订单不存在或当前会话不可访问；页面不会透露资源归属。"
        />
      );
    case "unavailable":
      return (
        <CustomerStatePanel
          kind="offline"
          title="订单变更暂不可用"
          description="正式订单或 Reverse API 当前不可用；不会使用本地、Mock 或演示数据替代。"
          actionLabel={retryButtonLabel(state.retryable)}
          onAction={state.retryable ? retry : undefined}
        />
      );
  }
}

function registered(
  type: CustomerOrderChangeComponentType,
  data: CustomerOrderChangeTemplateData,
  pageStatus: "ready" | "empty" | "submitting" | "validation_error" | "conflict",
) {
  const Component = createCustomerOrderChangeComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Order Change component is not registered: ${type}`);
  }
  return <Component key={type} {...data} pageStatus={pageStatus} />;
}

export function CustomerOrderChangeTemplate({
  state,
}: CustomerL1TemplateProps) {
  const orderChangeState =
    state as unknown as CustomerOrderChangeTemplateState;
  if (!("data" in orderChangeState)) {
    return (
      <main className="xlb-order-change-shell">
        {boundaryHeader()}
        <div className="xlb-order-change-boundary">
          <Boundary state={orderChangeState} />
        </div>
      </main>
    );
  }
  const data = orderChangeState.data;
  return (
    <main
      className="xlb-order-change-shell"
      data-order-change-state={orderChangeState.status}
    >
      {registered("header", data, orderChangeState.status)}
      {registered("feedback", data, orderChangeState.status)}
      {registered("order-summary", data, orderChangeState.status)}
      {registered("action-form", data, orderChangeState.status)}
      {registered("reverse-history", data, orderChangeState.status)}
    </main>
  );
}
