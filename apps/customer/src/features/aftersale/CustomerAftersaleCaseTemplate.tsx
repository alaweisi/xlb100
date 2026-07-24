import { CustomerStatePanel } from "@xlb/customer-components";
import type {
  CustomerL1TemplateProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  createCustomerAftersaleComponentRegistry,
  type CustomerAftersaleComponentType,
} from "./AftersaleComponentRegistry.js";
import type {
  CustomerAftersaleTemplateReadyData,
} from "./aftersaleTypes.js";

type AftersaleTemplateState =
  CustomerSliceState<CustomerAftersaleTemplateReadyData>;

function dispatchRecovery(actionKey: string): void {
  window.dispatchEvent(new CustomEvent(actionKey));
}

function StateBoundary({
  state,
}: {
  readonly state: Exclude<
    AftersaleTemplateState,
    { readonly status: "ready" }
  >;
}) {
  switch (state.status) {
    case "loading":
      return (
        <CustomerStatePanel
          kind="loading"
          title="正在读取售后记录"
          description="正在从正式售后 API 读取投诉、返修与处理时间线。"
        />
      );
    case "empty":
      return (
        <CustomerStatePanel
          kind="empty"
          title="暂无投诉记录"
          description="可填写正式类别、优先级和问题描述；资格与订单归属由服务端裁决。"
        />
      );
    case "error":
      return (
        <CustomerStatePanel
          kind="error"
          title="售后记录加载失败"
          description={state.retryable
            ? "网络或服务暂时异常，可以重新读取。"
            : "服务端响应无法安全展示，请返回后重试。"}
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
          title="售后状态已变化"
          description="页面不会在本地推进处理状态，请重新读取服务端事实。"
          actionLabel={state.recovery.labelKey}
          onAction={() => dispatchRecovery(state.recovery.actionKey)}
        />
      );
    case "unavailable": {
      const protectedResource =
        state.reasonCode === "aftersale_not_accessible";
      return (
        <CustomerStatePanel
          kind="offline"
          title={protectedResource
            ? "无法查看此售后事项"
            : "售后能力暂不可用"}
          description={protectedResource
            ? "该订单或投诉不存在，或当前会话不可访问；页面不会透露资源归属。"
            : "正式售后 API 当前不可用；页面不会以本地数据替代。"}
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
  type: CustomerAftersaleComponentType,
  props: CustomerAftersaleTemplateReadyData,
) {
  const Component = createCustomerAftersaleComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Aftersale component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

export function CustomerAftersaleCaseTemplate({
  state,
}: CustomerL1TemplateProps) {
  const aftersaleState = state as AftersaleTemplateState;
  if (aftersaleState.status !== "ready") {
    return (
      <main className="xlb-aftersale-shell">
        <header className="xlb-aftersale-boundary-header">
          <p>喜乐帮 · 安心服务</p>
          <h1>售后处理</h1>
        </header>
        <div className="xlb-aftersale-state">
          <StateBoundary state={aftersaleState} />
        </div>
      </main>
    );
  }
  const props = aftersaleState.data;
  return (
    <main className="xlb-aftersale-shell">
      {renderRegistered("header", props)}
      {renderRegistered("feedback", props)}
      {renderRegistered("case-list", props)}
      {renderRegistered("complaint-composer", props)}
      {renderRegistered("case-detail", props)}
      {renderRegistered("note-composer", props)}
    </main>
  );
}
