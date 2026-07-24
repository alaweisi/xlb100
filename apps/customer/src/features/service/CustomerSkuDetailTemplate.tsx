import { CustomerStatePanel } from "@xlb/customer-components";
import type {
  CustomerL2TemplateProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  createCustomerServiceDetailBoundaryRegistry,
  createCustomerServiceDetailComponentRegistry,
  parseCustomerServiceDetailPresentationPlan,
  type CustomerServiceDetailComponentType,
} from "./DetailComponentRegistry.js";
import type {
  CustomerServiceDetailComponentActions,
  CustomerServiceDetailComponentProps,
} from "./detailComponents.js";
import type { CustomerServiceDetailViewModel } from "./serviceDetail.js";

export interface CustomerSkuDetailTemplateReadyData {
  readonly viewModel: CustomerServiceDetailViewModel;
  readonly actions: CustomerServiceDetailComponentActions;
}

type DetailTemplateState = CustomerSliceState<CustomerSkuDetailTemplateReadyData>;

function renderRegistered(
  type: CustomerServiceDetailComponentType,
  props: CustomerServiceDetailComponentProps,
) {
  const Component = createCustomerServiceDetailComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Service Detail component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

function renderBoundaryHeader() {
  const Component = createCustomerServiceDetailBoundaryRegistry().resolve("state-header");
  if (Component === null) {
    throw new Error("Customer Service Detail boundary header is not registered");
  }
  return <Component />;
}

function dispatchRecovery(actionKey: string): void {
  window.dispatchEvent(new CustomEvent(actionKey));
}

function StateBoundary({
  state,
}: {
  readonly state: Exclude<DetailTemplateState, { readonly status: "ready" }>;
}) {
  switch (state.status) {
    case "loading":
      return (
        <div className="xlb-service-detail-state" aria-busy="true">
          <CustomerStatePanel
            kind="loading"
            title="正在读取服务详情"
            description="正在核验当前城市的正式服务与报价。"
          />
        </div>
      );
    case "empty":
      return (
        <div className="xlb-service-detail-state">
          <CustomerStatePanel
            kind="empty"
            title="暂无可展示的服务详情"
            description="正式接口没有返回可展示内容，请返回服务列表重新选择。"
            actionLabel={state.recovery?.labelKey}
            onAction={state.recovery
              ? () => dispatchRecovery(state.recovery!.actionKey)
              : undefined}
          />
        </div>
      );
    case "error":
      return (
        <div className="xlb-service-detail-state">
          <CustomerStatePanel
            kind="error"
            title="服务详情加载失败"
            description={state.retryable
              ? "网络或服务暂时异常，可以重试。"
              : "接口返回内容无法安全展示。"}
            actionLabel={state.recovery?.labelKey}
            onAction={state.recovery
              ? () => dispatchRecovery(state.recovery!.actionKey)
              : undefined}
          />
        </div>
      );
    case "conflict":
      return (
        <div className="xlb-service-detail-state">
          <CustomerStatePanel
            kind="error"
            title="报价状态已变化"
            description="需要重新读取当前城市的正式报价后再继续。"
            actionLabel={state.recovery.labelKey}
            onAction={() => dispatchRecovery(state.recovery.actionKey)}
          />
        </div>
      );
    case "unavailable":
      return (
        <div className="xlb-service-detail-state">
          <CustomerStatePanel
            kind="offline"
            title={state.reasonCode === "sku_not_found"
              ? "服务不存在或当前城市不可用"
              : "服务详情暂不可用"}
            description={state.reasonCode === "sku_not_found"
              ? "无法在当前城市正式启用的服务目录中核验该服务。"
              : "正式目录或报价接口当前不可用，页面不会拼装替代数据。"}
            actionLabel={state.recovery?.labelKey}
            onAction={state.recovery
              ? () => dispatchRecovery(state.recovery!.actionKey)
              : undefined}
          />
        </div>
      );
  }
}

export function CustomerSkuDetailTemplate({
  state,
  operationalManifest,
}: CustomerL2TemplateProps) {
  const detailState = state as DetailTemplateState;
  const plan = parseCustomerServiceDetailPresentationPlan(operationalManifest);

  if (detailState.status !== "ready") {
    return (
      <main className="xlb-service-detail-shell">
        {renderBoundaryHeader()}
        <StateBoundary state={detailState} />
      </main>
    );
  }

  const props: CustomerServiceDetailComponentProps = Object.freeze({
    viewModel: detailState.data.viewModel,
    actions: detailState.data.actions,
  });
  const afterPrice = plan.slots.filter((slot) => slot.position === "after-price");
  const beforeStandards = plan.slots.filter((slot) => slot.position === "before-standards");

  return (
    <main
      className="xlb-service-detail-shell"
      data-detail-freshness={props.viewModel.freshness}
    >
      {renderRegistered("header", props)}
      {props.viewModel.freshness === "stale" ? (
        <div className="xlb-service-detail-stale" role="status">
          当前展示最近一次成功读取的详情与报价；继续预约前会重新读取正式报价。
        </div>
      ) : null}
      {renderRegistered("service-identity", props)}
      {renderRegistered("price-quote-panel", props)}
      {afterPrice.map((slot) => renderRegistered(slot.type, props))}
      {renderRegistered("fee-breakdown", props)}
      {beforeStandards.map((slot) => renderRegistered(slot.type, props))}
      {renderRegistered("service-standards", props)}
      {renderRegistered("sticky-task-action", props)}
    </main>
  );
}
