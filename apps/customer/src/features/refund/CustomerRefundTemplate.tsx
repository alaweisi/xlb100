import { CustomerStatePanel } from "@xlb/customer-components";
import type {
  CustomerL1TemplateProps,
} from "../../platform/slices/index.js";
import {
  createCustomerRefundBoundaryRegistry,
  createCustomerRefundComponentRegistry,
  type CustomerRefundComponentType,
} from "./CustomerRefundComponentRegistry.js";
import type {
  CustomerRefundDataStatus,
  CustomerRefundTemplateData,
  CustomerRefundTemplateState,
} from "./refundTypes.js";

export const CUSTOMER_REFUND_RETRY_EVENT = "xlb:customer-refund-retry";

function boundaryHeader() {
  const Component = createCustomerRefundBoundaryRegistry()
    .resolve("state-header");
  if (Component === null) {
    throw new Error("Customer Refund boundary header is not registered");
  }
  return <Component />;
}

function retry() {
  window.dispatchEvent(new CustomEvent(CUSTOMER_REFUND_RETRY_EVENT));
}

function Boundary({
  state,
}: {
  readonly state: Exclude<
    CustomerRefundTemplateState,
    { readonly data: CustomerRefundTemplateData }
  >;
}) {
  switch (state.status) {
    case "order-loading":
      return (
        <CustomerStatePanel
          kind="loading"
          title="正在读取订单"
          description="先读取正式订单并核验当前身份、城市和订单归属。"
        />
      );
    case "error":
      return (
        <CustomerStatePanel
          kind="error"
          title="退款页面加载失败"
          description={state.retryable
            ? "网络或服务暂时异常；操作尚未获得服务端确认。"
            : "响应无法通过正式契约与作用域核验，页面已拒绝展示。"}
          actionLabel={state.retryable ? "重新读取" : undefined}
          onAction={state.retryable ? retry : undefined}
        />
      );
    case "forbidden_or_not_found":
      return (
        <CustomerStatePanel
          kind="offline"
          title="无法查看此订单"
          description="订单不存在或当前会话不可访问；页面不会透露资源是否属于他人。"
        />
      );
    case "unavailable":
      return (
        <CustomerStatePanel
          kind="offline"
          title="退款能力暂不可用"
          description="正式订单或退款 API 当前不可用；页面不会使用本地、Mock 或内部审批接口替代。"
          actionLabel={state.retryable ? "重新读取" : undefined}
          onAction={state.retryable ? retry : undefined}
        />
      );
  }
}

function registered(
  type: CustomerRefundComponentType,
  data: CustomerRefundTemplateData,
  pageStatus: CustomerRefundDataStatus,
) {
  const Component = createCustomerRefundComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Refund component is not registered: ${type}`);
  }
  return <Component key={type} {...data} pageStatus={pageStatus} />;
}

export function CustomerRefundTemplate({
  state,
}: CustomerL1TemplateProps) {
  const refundState = state as unknown as CustomerRefundTemplateState;
  if (!("data" in refundState)) {
    return (
      <main
        className="xlb-refund-shell"
        data-refund-state={refundState.status}
      >
        {boundaryHeader()}
        <div className="xlb-refund-boundary">
          <Boundary state={refundState} />
        </div>
      </main>
    );
  }
  const data = refundState.data;
  return (
    <main
      className="xlb-refund-shell"
      data-refund-state={refundState.status}
    >
      {registered("header", data, refundState.status)}
      {registered("feedback", data, refundState.status)}
      {registered("order-summary", data, refundState.status)}
      {registered("eligibility-notice", data, refundState.status)}
      {registered("request-form", data, refundState.status)}
      {registered("result", data, refundState.status)}
    </main>
  );
}
