import { CustomerStatePanel } from "@xlb/customer-components";
import type {
  CustomerL2TemplateProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  createCustomerDiscoveryBoundaryRegistry,
  createCustomerDiscoveryComponentRegistry,
  parseCustomerDiscoveryPresentationPlan,
  type CustomerDiscoveryComponentType,
} from "./DiscoveryComponentRegistry.js";
import type {
  CustomerDiscoveryComponentActions,
  CustomerDiscoveryComponentProps,
} from "./discoveryComponents.js";
import type { CustomerDiscoveryViewModel } from "./catalogDiscovery.js";

export interface CustomerDiscoveryTemplateReadyData {
  readonly viewModel: CustomerDiscoveryViewModel;
  readonly actions: CustomerDiscoveryComponentActions;
  readonly queryChanging: boolean;
}

type DiscoveryTemplateState = CustomerSliceState<CustomerDiscoveryTemplateReadyData>;

function renderRegistered(
  type: CustomerDiscoveryComponentType,
  props: CustomerDiscoveryComponentProps,
) {
  const Component = createCustomerDiscoveryComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Discovery component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

function renderBoundaryHeader() {
  const Component = createCustomerDiscoveryBoundaryRegistry().resolve("state-header");
  if (Component === null) {
    throw new Error("Customer Discovery boundary header is not registered");
  }
  return <Component />;
}

function StateBoundary({
  state,
}: {
  readonly state: Exclude<DiscoveryTemplateState, { readonly status: "ready" }>;
}) {
  switch (state.status) {
    case "loading":
      return (
        <div className="xlb-discovery-state" aria-busy="true">
          <CustomerStatePanel
            kind="loading"
            title="正在读取服务目录"
            description="正在获取当前城市可用的正式服务。"
          />
        </div>
      );
    case "empty":
      return (
        <div className="xlb-discovery-state">
          <CustomerStatePanel
            kind="empty"
            title="当前城市暂无可用服务"
            description="目录中暂时没有可展示的服务，请稍后重试。"
            actionLabel={state.recovery?.labelKey}
            onAction={state.recovery ? () => {
              window.dispatchEvent(new CustomEvent(state.recovery!.actionKey));
            } : undefined}
          />
        </div>
      );
    case "error":
      return (
        <div className="xlb-discovery-state">
          <CustomerStatePanel
            kind="error"
            title="服务目录加载失败"
            description={state.retryable
              ? "网络或服务暂时异常，可以重试。"
              : "返回的服务目录无法安全展示。"}
            actionLabel={state.recovery?.labelKey}
            onAction={state.recovery ? () => {
              window.dispatchEvent(new CustomEvent(state.recovery!.actionKey));
            } : undefined}
          />
        </div>
      );
    case "unavailable":
      return (
        <div className="xlb-discovery-state">
          <CustomerStatePanel
            kind="offline"
            title="服务发现暂不可用"
            description="正式服务目录当前不可用，页面不会展示替代或演示数据。"
            actionLabel={state.recovery?.labelKey}
            onAction={state.recovery ? () => {
              window.dispatchEvent(new CustomEvent(state.recovery!.actionKey));
            } : undefined}
          />
        </div>
      );
    case "conflict":
      return (
        <div className="xlb-discovery-state">
          <CustomerStatePanel
            kind="error"
            title="服务目录需要刷新"
            description="当前目录状态已变化，请刷新后继续。"
            actionLabel={state.recovery.labelKey}
            onAction={() => {
              window.dispatchEvent(new CustomEvent(state.recovery.actionKey));
            }}
          />
        </div>
      );
  }
}

export function CustomerDiscoveryTemplate({
  state,
  operationalManifest,
}: CustomerL2TemplateProps) {
  const discoveryState = state as DiscoveryTemplateState;
  const plan = parseCustomerDiscoveryPresentationPlan(operationalManifest);

  if (discoveryState.status !== "ready") {
    return (
      <main className="xlb-discovery-shell">
        {renderBoundaryHeader()}
        <StateBoundary state={discoveryState} />
      </main>
    );
  }

  const props: CustomerDiscoveryComponentProps = Object.freeze({
    viewModel: discoveryState.data.viewModel,
    actions: discoveryState.data.actions,
    queryChanging: discoveryState.data.queryChanging,
  });
  const slotsBefore = plan.slots.filter((slot) => slot.position === "before-results");
  const slotsAfter = plan.slots.filter((slot) => slot.position === "after-results");

  return (
    <main
      className="xlb-discovery-shell"
      data-catalog-freshness={props.viewModel.freshness}
    >
      {renderRegistered("header", props)}
      {props.viewModel.freshness === "stale" ? (
        <div className="xlb-discovery-stale" role="status">
          当前展示最近成功读取的目录，网络恢复后可刷新。
        </div>
      ) : null}
      {renderRegistered("search-field", props)}
      {renderRegistered("category-filter", props)}
      {slotsBefore.map((slot) => renderRegistered(slot.type, props))}
      {renderRegistered("result-count", props)}
      {renderRegistered("service-result-list", props)}
      {slotsAfter.map((slot) => renderRegistered(slot.type, props))}
    </main>
  );
}
