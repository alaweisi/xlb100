import {
  BrandLogo,
  CustomerButton,
  CustomerStatePanel,
} from "@xlb/customer-components";
import type {
  OrderReverseStatus,
  OrderReverseType,
  ScheduledTimeSlot,
} from "@xlb/types";
import type {
  CustomerOrderChangeTemplateData,
} from "./orderChangeTypes.js";

export type CustomerOrderChangeComponentProps =
  CustomerOrderChangeTemplateData & {
    readonly pageStatus:
      | "ready"
      | "empty"
      | "submitting"
      | "validation_error"
      | "conflict";
  };

const TYPE_COPY: Readonly<Record<
  OrderReverseType,
  { readonly label: string; readonly description: string }
>> = Object.freeze({
  cancel: {
    label: "申请取消",
    description: "服务端会按订单当前状态裁决是否允许取消。",
  },
  reschedule: {
    label: "申请改期",
    description: "需要待派单且服务端明确确认尚未开工。",
  },
  reassign: {
    label: "申请改派",
    description: "需要待派单且服务端明确确认尚未开工。",
  },
});

function displayTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间不可用";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function orderStatusLabel(status: string): string {
  switch (status) {
    case "draft": return "草稿";
    case "pending_dispatch": return "待派单";
    case "service_completed": return "服务已完成";
    case "pending_payment": return "待支付";
    case "paid": return "已支付";
    case "cancelled": return "已取消";
    default: return "未知状态";
  }
}

function reverseStatusCopy(status: OrderReverseStatus): {
  readonly label: string;
  readonly description: string;
} {
  switch (status) {
    case "requested":
      return { label: "已申请", description: "等待服务端审核。" };
    case "approved":
      return { label: "已批准", description: "等待服务端应用变更。" };
    case "rejected":
      return { label: "未批准", description: "订单事实没有由前端改变。" };
    case "applied":
      return { label: "已应用", description: "变更已由服务端完成。" };
  }
}

function slotLabel(slot: ScheduledTimeSlot | null): string {
  if (slot === "morning") return "上午";
  if (slot === "afternoon") return "下午";
  if (slot === "evening") return "晚上";
  return "";
}

export function OrderChangeStateHeader() {
  return (
    <header className="xlb-order-change-header xlb-order-change-header--boundary">
      <BrandLogo variant="compact" />
      <div>
        <p>订单变更与审核进度</p>
        <h1>订单变更</h1>
      </div>
    </header>
  );
}

export function OrderChangeHeader({
  viewModel,
  actions,
}: CustomerOrderChangeComponentProps) {
  const busy = viewModel.refreshing;
  return (
    <header
      className="xlb-order-change-header"
      data-order-change-component="header"
    >
      <button
        type="button"
        className="xlb-order-change-header__back"
        aria-label="返回订单详情"
        onClick={actions.onBack}
      >
        返回
      </button>
      <div className="xlb-order-change-header__brand">
        <BrandLogo variant="compact" />
        <div>
          <p>申请后由服务端审核</p>
          <h1>订单变更</h1>
        </div>
      </div>
      <CustomerButton
        variant="quiet"
        busy={busy}
        disabled={busy}
        onClick={actions.onRefresh}
      >
        {busy ? "刷新中" : "刷新"}
      </CustomerButton>
    </header>
  );
}

export function OrderChangeFeedback({
  viewModel,
  pageStatus,
}: CustomerOrderChangeComponentProps) {
  if (viewModel.notice !== null) {
    return (
      <div
        className="xlb-order-change-feedback"
        data-kind={viewModel.notice.kind}
        role="status"
        aria-live="polite"
      >
        {viewModel.notice.message}
      </div>
    );
  }
  if (pageStatus === "validation_error") {
    return (
      <div className="xlb-order-change-feedback" data-kind="error" role="alert">
        请修正表单中的问题后再提交。
      </div>
    );
  }
  return null;
}

export function OrderChangeOrderSummary({
  viewModel,
}: CustomerOrderChangeComponentProps) {
  const { order } = viewModel.aggregate;
  return (
    <section
      className="xlb-order-change-summary"
      data-order-change-component="order-summary"
    >
      <div className="xlb-order-change-section-heading">
        <div>
          <p>当前订单事实</p>
          <h2>{order.skuName}</h2>
        </div>
        <span data-order-status={order.status}>
          {orderStatusLabel(order.status)}
        </span>
      </div>
      <dl>
        <div>
          <dt>预约时间</dt>
          <dd>
            {displayTime(order.scheduledAt)} ·
            {slotLabel(order.scheduledTimeSlot)}
          </dd>
        </div>
        <div>
          <dt>订单号</dt>
          <dd>{order.orderId}</dd>
        </div>
      </dl>
      <p className="xlb-order-change-authority">
        页面只展示服务端返回事实，不会自行修改订单状态。
      </p>
    </section>
  );
}

export function OrderChangeActionForm({
  viewModel,
  actions,
  pageStatus,
}: CustomerOrderChangeComponentProps) {
  const locked = pageStatus === "submitting" || viewModel.refreshing;
  const selectedEligibility =
    viewModel.eligibility[viewModel.draft.reverseType];
  const submitDisabled = locked ||
    !selectedEligibility.enabled ||
    viewModel.draft.reason.trim().length < 2 ||
    viewModel.draft.reason.trim().length > 500;

  return (
    <form
      className="xlb-order-change-form"
      data-order-change-component="action-form"
      onSubmit={(event) => {
        event.preventDefault();
        actions.onSubmit();
      }}
    >
      <div className="xlb-order-change-section-heading">
        <div>
          <p>选择正式申请类型</p>
          <h2>发起变更</h2>
        </div>
        <span>后端最终裁决</span>
      </div>
      <div
        className="xlb-order-change-type-grid"
        role="radiogroup"
        aria-label="订单变更类型"
      >
        {(["cancel", "reschedule", "reassign"] as const).map((type) => {
          const eligibility = viewModel.eligibility[type];
          const selected = viewModel.draft.reverseType === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={!eligibility.enabled}
              disabled={locked || !eligibility.enabled}
              data-selected={selected ? "true" : "false"}
              onClick={() => actions.onSelectType(type)}
            >
              <strong>{TYPE_COPY[type].label}</strong>
              <span>{TYPE_COPY[type].description}</span>
              {!eligibility.enabled ? (
                <small>
                  {eligibility.reasonCode === "fulfillment_start_fact_missing"
                    ? "当前响应缺少“未开工”权威事实，暂不可提交。"
                    : "当前订单状态不支持此操作。"}
                </small>
              ) : null}
            </button>
          );
        })}
      </div>

      {viewModel.draft.reverseType === "reschedule" ? (
        <div className="xlb-order-change-schedule">
          <label>
            <span>新的预约时间</span>
            <input
              type="datetime-local"
              value={viewModel.draft.requestedScheduledAt}
              disabled={locked || !selectedEligibility.enabled}
              aria-invalid={viewModel.errors.requestedScheduledAt
                ? "true"
                : undefined}
              onChange={(event) =>
                actions.onScheduledAtChange(event.target.value)}
            />
          </label>
          <label>
            <span>预约时段</span>
            <select
              value={viewModel.draft.requestedTimeSlot}
              disabled={locked || !selectedEligibility.enabled}
              onChange={(event) =>
                actions.onTimeSlotChange(
                  event.target.value as ScheduledTimeSlot,
                )}
            >
              <option value="morning">上午</option>
              <option value="afternoon">下午</option>
              <option value="evening">晚上</option>
            </select>
          </label>
        </div>
      ) : null}

      <label className="xlb-order-change-reason">
        <span>申请原因</span>
        <textarea
          value={viewModel.draft.reason}
          rows={4}
          maxLength={500}
          disabled={locked || !selectedEligibility.enabled}
          aria-invalid={viewModel.errors.reason ? "true" : undefined}
          aria-describedby="order-change-reason-help"
          placeholder="请简要说明原因"
          onChange={(event) => actions.onReasonChange(event.target.value)}
        />
      </label>
      <div id="order-change-reason-help" className="xlb-order-change-help">
        <span>
          {viewModel.errors.reason ??
            "资格提示仅用于交互，提交结果以服务端裁决为准。"}
        </span>
        <span>{viewModel.draft.reason.length} / 500</span>
      </div>
      <CustomerButton
        type="submit"
        className="xlb-order-change-submit"
        busy={pageStatus === "submitting"}
        disabled={submitDisabled}
      >
        {pageStatus === "submitting" ? "正在提交申请" : "提交变更申请"}
      </CustomerButton>
    </form>
  );
}

export function OrderChangeHistory({
  viewModel,
}: CustomerOrderChangeComponentProps) {
  const history = [...viewModel.aggregate.reverseRequests].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
  return (
    <section
      className="xlb-order-change-history"
      data-order-change-component="reverse-history"
    >
      <div className="xlb-order-change-section-heading">
        <div>
          <p>只读服务端记录</p>
          <h2>变更进度</h2>
        </div>
        <span>{history.length} 条</span>
      </div>
      {history.length === 0 ? (
        <CustomerStatePanel
          kind="empty"
          title="暂无变更记录"
          description="提交成功后，页面会重新读取正式 Reverse API。"
        />
      ) : (
        <ol>
          {history.map((item) => {
            const status = reverseStatusCopy(item.status);
            return (
              <li
                key={item.reverseRequestId}
                data-reverse-status={item.status}
              >
                <div>
                  <strong>{TYPE_COPY[item.reverseType].label}</strong>
                  <span>{status.label}</span>
                </div>
                <p>{item.reason}</p>
                {item.reverseType === "reschedule" &&
                item.requestedScheduledAt !== null ? (
                  <small>
                    请求时间 {displayTime(item.requestedScheduledAt)} ·
                    {slotLabel(item.requestedTimeSlot)}
                  </small>
                ) : null}
                <small>{status.description}</small>
                {item.reviewNote ? <small>审核说明：{item.reviewNote}</small> : null}
                <time dateTime={item.updatedAt}>
                  更新于 {displayTime(item.updatedAt)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
