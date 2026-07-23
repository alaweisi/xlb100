import { CustomerStatePanel } from "@xlb/customer-components";
import type {
  CustomerL1TemplateProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  createCustomerNotificationBoundaryRegistry,
  createCustomerNotificationComponentRegistry,
  type CustomerNotificationComponentType,
} from "./NotificationComponentRegistry.js";
import type {
  CustomerNotificationTemplateReadyData,
} from "./notificationCenterTypes.js";

type NotificationTemplateState =
  CustomerSliceState<CustomerNotificationTemplateReadyData>;

function dispatchRecovery(actionKey: string): void {
  window.dispatchEvent(new CustomEvent(actionKey));
}

function renderBoundaryHeader() {
  const Component = createCustomerNotificationBoundaryRegistry()
    .resolve("state-header");
  if (Component === null) {
    throw new Error("Notification boundary header is not registered");
  }
  return <Component />;
}

function StateBoundary({
  state,
}: {
  readonly state: Exclude<
    NotificationTemplateState,
    { readonly status: "ready" }
  >;
}) {
  switch (state.status) {
    case "loading":
      return (
        <CustomerStatePanel
          kind="loading"
          title="正在读取通知"
          description="正在从正式通知 API 获取当前视图与未读数。"
        />
      );
    case "empty":
      return (
        <CustomerStatePanel
          kind="empty"
          title="暂时没有通知"
          description="此处只显示服务端返回的订单创建与客服工单解决通知。"
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
          title="通知加载失败"
          description={state.retryable
            ? "网络或服务暂时异常，可以重试。"
            : "通知响应无法安全展示，请稍后重试。"}
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
          title="通知状态已变化"
          description="页面不会覆盖较新的服务端状态，已要求重新读取通知。"
          actionLabel={state.recovery.labelKey}
          onAction={() => dispatchRecovery(state.recovery.actionKey)}
        />
      );
    case "unavailable":
      return (
        <CustomerStatePanel
          kind="offline"
          title="通知能力暂不可用"
          description="正式通知 API 当前不可用；页面不会用本地历史或演示数据补齐。"
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
  }
}

function renderRegistered(
  type: CustomerNotificationComponentType,
  props: CustomerNotificationTemplateReadyData,
) {
  const Component = createCustomerNotificationComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Notification component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

export function CustomerNotificationTemplate({
  state,
}: CustomerL1TemplateProps) {
  const notificationState = state as NotificationTemplateState;

  if (notificationState.status !== "ready") {
    return (
      <main className="xlb-notifications-shell">
        {renderBoundaryHeader()}
        <div className="xlb-notifications-state">
          <StateBoundary state={notificationState} />
        </div>
      </main>
    );
  }

  const props = notificationState.data;
  return (
    <main className="xlb-notifications-shell">
      {renderRegistered("header", props)}
      {renderRegistered("view-tabs", props)}
      {renderRegistered("feedback", props)}
      {renderRegistered("notification-list", props)}
    </main>
  );
}
