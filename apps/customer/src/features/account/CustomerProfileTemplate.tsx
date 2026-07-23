import { CustomerStatePanel } from "@xlb/customer-components";
import type {
  CustomerL1TemplateProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  createCustomerProfileBoundaryRegistry,
  createCustomerProfileComponentRegistry,
  type CustomerProfileComponentType,
} from "./ProfileComponentRegistry.js";
import type {
  CustomerProfileTemplateReadyData,
} from "./profileTypes.js";

type ProfileTemplateState =
  CustomerSliceState<CustomerProfileTemplateReadyData>;

function dispatchRecovery(actionKey: string): void {
  window.dispatchEvent(new CustomEvent(actionKey));
}

function renderBoundaryHeader() {
  const Component = createCustomerProfileBoundaryRegistry()
    .resolve("state-header");
  if (Component === null) {
    throw new Error("Profile boundary header is not registered");
  }
  return <Component />;
}

function StateBoundary({
  state,
}: {
  readonly state: Exclude<ProfileTemplateState, { readonly status: "ready" }>;
}) {
  switch (state.status) {
    case "loading":
      return (
        <CustomerStatePanel
          kind="loading"
          title="正在读取个人资料"
          description="正在从服务端读取当前登录顾客的资料。"
        />
      );
    case "empty":
      return (
        <CustomerStatePanel
          kind="error"
          title="个人资料不可为空"
          description="服务端没有返回可安全展示的顾客资料。"
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
          title="个人资料加载失败"
          description={state.retryable
            ? "网络或服务暂时异常，可以重新读取。"
            : "当前响应无法安全展示，请返回后重试。"}
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
          title="个人资料已变化"
          description="页面不会覆盖较新的服务端资料，请刷新后再编辑。"
          actionLabel={state.recovery.labelKey}
          onAction={() => dispatchRecovery(state.recovery.actionKey)}
        />
      );
    case "unavailable":
      return (
        <CustomerStatePanel
          kind="offline"
          title="个人资料能力暂不可用"
          description="正式 Profile API 当前不可用；页面不会用本地或演示资料替代。"
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
  }
}

function renderRegistered(
  type: CustomerProfileComponentType,
  props: CustomerProfileTemplateReadyData,
) {
  const Component = createCustomerProfileComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Profile component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

export function CustomerProfileTemplate({
  state,
}: CustomerL1TemplateProps) {
  const profileState = state as ProfileTemplateState;

  if (profileState.status !== "ready") {
    return (
      <main className="xlb-profile-shell">
        {renderBoundaryHeader()}
        <div className="xlb-profile-state">
          <StateBoundary state={profileState} />
        </div>
      </main>
    );
  }

  const props = profileState.data;
  return (
    <main className="xlb-profile-shell">
      {renderRegistered("header", props)}
      {renderRegistered("feedback", props)}
      {renderRegistered("summary", props)}
      {renderRegistered("editor", props)}
      {renderRegistered("account-actions", props)}
      {renderRegistered("logout", props)}
      {renderRegistered("city-switch-confirmation", props)}
    </main>
  );
}
