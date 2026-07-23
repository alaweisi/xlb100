import { CustomerStatePanel } from "@xlb/customer-components";
import type {
  CustomerL1TemplateProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  createCustomerReviewBoundaryRegistry,
  createCustomerReviewComponentRegistry,
  type CustomerReviewComponentType,
} from "./ReviewComponentRegistry.js";
import type {
  CustomerReviewTemplateReadyData,
} from "./reviewTypes.js";

type ReviewTemplateState =
  CustomerSliceState<CustomerReviewTemplateReadyData>;

function dispatchRecovery(actionKey: string): void {
  window.dispatchEvent(new CustomEvent(actionKey));
}

function renderBoundaryHeader() {
  const Component = createCustomerReviewBoundaryRegistry()
    .resolve("state-header");
  if (Component === null) {
    throw new Error("Review boundary header is not registered");
  }
  return <Component />;
}

function StateBoundary({
  state,
}: {
  readonly state: Exclude<ReviewTemplateState, { readonly status: "ready" }>;
}) {
  switch (state.status) {
    case "loading":
      return (
        <CustomerStatePanel
          kind="loading"
          title="正在读取评价"
          description="正在从正式评价 API 读取评价、可见性与申诉。"
        />
      );
    case "empty":
      return (
        <CustomerStatePanel
          kind="empty"
          title="尚未提交评价"
          description="订单评价是否可创建仍由服务端资格与唯一性规则裁决。"
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
          title="评价加载失败"
          description={state.retryable
            ? "网络或服务暂时异常，可以重新读取。"
            : "评价响应无法安全展示，请返回后重试。"}
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
          title="评价状态已变化"
          description="页面不会推进本地状态，请重新读取服务端事实。"
          actionLabel={state.recovery.labelKey}
          onAction={() => dispatchRecovery(state.recovery.actionKey)}
        />
      );
    case "unavailable": {
      const protectedResource = state.reasonCode === "review_not_accessible";
      const byIdGap = state.reasonCode === "review_lookup_requires_order_id";
      return (
        <CustomerStatePanel
          kind="offline"
          title={protectedResource ? "无法查看此评价" : "评价能力暂不可用"}
          description={protectedResource
            ? "该评价不存在或当前会话不可访问；页面不会透露资源归属。"
            : byIdGap
              ? "现有正式 API 只能按订单读取评价；请从订单评价页进入申诉。"
              : "正式评价 API 当前不可用；页面不会用本地或演示数据替代。"}
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
    }
  }
}

function renderRegistered(
  type: CustomerReviewComponentType,
  props: CustomerReviewTemplateReadyData,
) {
  const Component = createCustomerReviewComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Review component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

export function CustomerReviewTemplate({
  state,
}: CustomerL1TemplateProps) {
  const reviewState = state as ReviewTemplateState;

  if (reviewState.status !== "ready") {
    return (
      <main className="xlb-review-shell">
        {renderBoundaryHeader()}
        <div className="xlb-review-state">
          <StateBoundary state={reviewState} />
        </div>
      </main>
    );
  }

  const props = reviewState.data;
  return (
    <main className="xlb-review-shell">
      {renderRegistered("header", props)}
      {renderRegistered("feedback", props)}
      {renderRegistered("review-summary", props)}
      {renderRegistered("review-composer", props)}
      {renderRegistered("appeal-manager", props)}
    </main>
  );
}
