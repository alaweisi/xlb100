import { CustomerStatePanel } from "@xlb/customer-components";
import type {
  CustomerL2TemplateProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  createCustomerSupportHelpComponentRegistry,
  createCustomerSupportTicketComponentRegistry,
  parseCustomerSupportTicketPresentationPlan,
  type CustomerSupportHelpPresentationSlot,
  type CustomerSupportTicketCoreComponent,
} from "./SupportTicketComponentRegistry.js";
import type {
  CustomerSupportTicketComponentProps,
} from "./supportTicketComponents.js";
import type {
  CustomerSupportTicketTemplateReadyData,
} from "./supportTicketTypes.js";

type SupportTemplateState =
  CustomerSliceState<CustomerSupportTicketTemplateReadyData>;

function dispatchRecovery(actionKey: string): void {
  window.dispatchEvent(new CustomEvent(actionKey));
}

function StateBoundary({
  state,
}: {
  readonly state: Exclude<SupportTemplateState, { readonly status: "ready" }>;
}) {
  switch (state.status) {
    case "loading":
      return (
        <CustomerStatePanel
          kind="loading"
          title="正在读取客服工单"
          description="正在从服务端读取当前顾客与城市范围内的正式工单事实。"
        />
      );
    case "empty":
      return (
        <CustomerStatePanel
          kind="empty"
          title="还没有客服工单"
          description="你可以创建工单，提交后会显示服务端确认的处理状态。"
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
          title="客服工单加载失败"
          description={state.errorCode === "support_ticket_not_found"
            ? "无法读取该工单。它可能不存在，也可能不在你的访问范围内。"
            : state.retryable
              ? "网络或服务暂时异常，可以安全重试。"
              : "服务端响应无法安全展示，页面已停止使用该数据。"}
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
          title="工单状态已变化"
          description="页面需要重新读取服务端事实，不会自动重放上一次写操作。"
          actionLabel={state.recovery.labelKey}
          onAction={() => dispatchRecovery(state.recovery.actionKey)}
        />
      );
    case "unavailable":
      return (
        <CustomerStatePanel
          kind="offline"
          title={state.reasonCode === "support_ticket_not_found"
            ? "无法读取该工单"
            : "客服工单暂不可用"}
          description={state.reasonCode === "support_ticket_not_found"
            ? "该资源不存在或不可访问；为保护隐私，页面不会区分具体原因。"
            : state.reasonCode === "support_ticket_visibility_violation"
              ? "服务端返回了不应向顾客展示的内部事件，页面已拒绝渲染。"
              : "页面不会使用本地、演示或会话数据替代正式工单能力。"}
          actionLabel={state.recovery?.labelKey}
          onAction={state.recovery
            ? () => dispatchRecovery(state.recovery!.actionKey)
            : undefined}
        />
      );
  }
}

function renderCore(
  type: CustomerSupportTicketCoreComponent,
  props: CustomerSupportTicketComponentProps,
) {
  const Component = createCustomerSupportTicketComponentRegistry().resolve(type);
  if (Component === null) {
    throw new Error(`Customer Support component is not registered: ${type}`);
  }
  return <Component key={type} {...props} />;
}

function renderHelp(slot: CustomerSupportHelpPresentationSlot) {
  const Component = createCustomerSupportHelpComponentRegistry().resolve(slot.type);
  if (Component === null) {
    throw new Error(`Customer Support help component is not registered: ${slot.type}`);
  }
  return (
    <Component
      key={`${slot.type}:${slot.position}`}
      title={slot.title}
      body={slot.body}
      items={slot.items}
    />
  );
}

export function CustomerSupportTicketTemplate({
  state,
  operationalManifest,
}: CustomerL2TemplateProps) {
  const supportState = state as SupportTemplateState;
  const plan = parseCustomerSupportTicketPresentationPlan(operationalManifest);

  if (supportState.status !== "ready") {
    return (
      <main className="xlb-support-shell">
        <div className="xlb-support-boundary-header">
          <p className="xlb-support-eyebrow">喜乐帮 · 客服中心</p>
          <h1>客服工单</h1>
        </div>
        <div className="xlb-support-boundary">
          <StateBoundary state={supportState} />
        </div>
      </main>
    );
  }

  const props: CustomerSupportTicketComponentProps = Object.freeze({
    viewModel: supportState.data.viewModel,
    actions: supportState.data.actions,
  });
  const view = props.viewModel.route.view;

  return (
    <main className="xlb-support-shell" data-view={view}>
      {renderCore("header", props)}
      {renderCore("notice", props)}
      {view === "hub" ? (
        <>
          {renderCore("channel-choice", props)}
          {plan.slots
            .filter((slot) => slot.position === "hub-after-channels")
            .map(renderHelp)}
        </>
      ) : null}
      {view === "tickets" ? (
        <>
          {renderCore("ticket-form", props)}
          {plan.slots
            .filter((slot) => slot.position === "tickets-after-form")
            .map(renderHelp)}
          {renderCore("ticket-list", props)}
        </>
      ) : null}
      {view === "detail" ? (
        <>
          {renderCore("ticket-detail", props)}
          {renderCore("ticket-timeline", props)}
          {renderCore("ticket-followup", props)}
          {renderCore("ticket-reopen", props)}
          {renderCore("ticket-csat", props)}
        </>
      ) : null}
    </main>
  );
}
