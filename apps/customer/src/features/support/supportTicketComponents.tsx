import {
  CustomerButton,
  GlassCard,
} from "@xlb/customer-components";
import type {
  SupportTicket,
  SupportTicketEvent,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketType,
} from "@xlb/types";
import {
  supportTicketPrioritySchema,
  supportTicketTypeSchema,
} from "@xlb/validators";
import type {
  CustomerSupportTicketActions,
  CustomerSupportTicketViewModel,
} from "./supportTicketTypes.js";

export interface CustomerSupportTicketComponentProps {
  readonly viewModel: CustomerSupportTicketViewModel;
  readonly actions: CustomerSupportTicketActions;
}

const TYPE_LABELS = Object.freeze({
  order_question: "订单咨询",
  order_dispute: "订单争议",
  service_complaint: "服务投诉",
  withdrawal_issue: "提现问题",
  account_issue: "账户问题",
  safety: "安全问题",
  other: "其他问题",
}) satisfies Readonly<Record<SupportTicketType, string>>;

const PRIORITY_LABELS = Object.freeze({
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
  critical: "严重",
}) satisfies Readonly<Record<SupportTicketPriority, string>>;

const STATUS_LABELS = Object.freeze({
  open: "已创建",
  processing: "处理中",
  waiting_requester: "等待你的回复",
  escalated: "已升级",
  resolved: "已解决",
  closed: "已关闭",
}) satisfies Readonly<Record<SupportTicketStatus, string>>;

const EVENT_LABELS: Readonly<Record<SupportTicketEvent["eventType"], string>> =
  Object.freeze({
    created: "工单已创建",
    commented: "新增留言",
    assigned: "已分派",
    claimed: "已接手",
    status_changed: "状态已更新",
    escalated: "工单已升级",
    resolved: "工单已解决",
    reopened: "工单已重开",
    closed: "工单已关闭",
    sla_breached: "服务时限已更新",
  });

function dateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "时间待确认"
    : new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(parsed);
}

function StatusTag({ status }: { readonly status: SupportTicketStatus }) {
  return (
    <span className="xlb-support-status" data-status={status}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function CustomerSupportHeader({
  viewModel,
  actions,
}: CustomerSupportTicketComponentProps) {
  const title = viewModel.route.view === "hub"
    ? "客服中心"
    : viewModel.route.view === "tickets"
      ? "我的客服工单"
      : "工单详情";
  return (
    <header className="xlb-support-header">
      <CustomerButton
        variant="quiet"
        className="xlb-support-header__back"
        onClick={actions.onBack}
        aria-label="返回上一页"
      >
        返回
      </CustomerButton>
      <div>
        <p className="xlb-support-eyebrow">喜乐帮 · 安心服务</p>
        <h1>{title}</h1>
      </div>
      {viewModel.route.view !== "hub" ? (
        <CustomerButton
          variant="quiet"
          onClick={actions.onRefresh}
          disabled={viewModel.refreshing || viewModel.operation !== null}
        >
          {viewModel.refreshing ? "刷新中" : "刷新"}
        </CustomerButton>
      ) : <span className="xlb-support-header__spacer" aria-hidden="true" />}
    </header>
  );
}

export function CustomerSupportNotice({
  viewModel,
  actions,
}: CustomerSupportTicketComponentProps) {
  if (viewModel.notice === null) return null;
  return (
    <div
      className="xlb-support-notice"
      data-kind={viewModel.notice.kind}
      role={viewModel.notice.kind === "error" ? "alert" : "status"}
    >
      <span>{viewModel.notice.message}</span>
      <CustomerButton variant="quiet" onClick={actions.onDismissNotice}>
        关闭
      </CustomerButton>
    </div>
  );
}

export function CustomerSupportChannelChoice({
  viewModel,
  actions,
}: CustomerSupportTicketComponentProps) {
  const references = viewModel.route.view === "hub"
    ? viewModel.route.references
    : { orderId: null, complaintId: null };
  return (
    <section className="xlb-support-channel" aria-labelledby="support-channel-title">
      <div className="xlb-support-section-heading">
        <p className="xlb-support-eyebrow">选择支持方式</p>
        <h2 id="support-channel-title">我们可以怎样帮你？</h2>
        <p>工单会保留正式处理时间线，并可安全关联订单或售后事项。</p>
      </div>
      {references.orderId !== null ? (
        <p className="xlb-support-reference-note">
          已安全带入订单引用
          {references.complaintId !== null ? "与售后引用" : ""}
        </p>
      ) : null}
      <div className="xlb-support-channel__grid">
        <GlassCard className="xlb-support-channel__card">
          <span className="xlb-support-channel__index">01</span>
          <h3>提交客服工单</h3>
          <p>描述问题、查看进度、补充留言，并在服务端允许时重开或评价。</p>
          <CustomerButton onClick={actions.onOpenTickets}>
            进入工单
          </CustomerButton>
        </GlassCard>
        <GlassCard className="xlb-support-channel__card" data-unavailable="true">
          <span className="xlb-support-channel__index">02</span>
          <h3>实时会话</h3>
          <p>会话读取与消息契约尚未完成对齐（GAP-07），当前不会伪装成可用能力。</p>
          <CustomerButton disabled aria-disabled="true">
            暂未开放
          </CustomerButton>
        </GlassCard>
      </div>
    </section>
  );
}

export function CustomerSupportTicketForm({
  viewModel,
  actions,
}: CustomerSupportTicketComponentProps) {
  const { draft, draftErrors } = viewModel;
  const busy = viewModel.operation === "creating";
  const canSubmit = draft.subject.trim() !== "" &&
    draft.description.trim() !== "" &&
    (draft.complaintId.trim() === "" || draft.orderId.trim() !== "");
  return (
    <GlassCard className="xlb-support-form">
      <div className="xlb-support-section-heading">
        <p className="xlb-support-eyebrow">新工单</p>
        <h2>告诉我们发生了什么</h2>
        <p>类型与优先级固定来自正式工单契约，最终处理仍由服务端裁决。</p>
      </div>
      <form onSubmit={(event) => {
        event.preventDefault();
        actions.onCreate();
      }}>
        <div className="xlb-support-form__row">
          <label>
            工单类型
            <select
              value={draft.type}
              onChange={(event) => actions.onDraftChange("type", event.target.value)}
              aria-invalid={draftErrors.type !== undefined}
            >
              {supportTicketTypeSchema.options.map((type) => (
                <option key={type} value={type}>{TYPE_LABELS[type]}</option>
              ))}
            </select>
            {draftErrors.type ? <span role="alert">{draftErrors.type}</span> : null}
          </label>
          <label>
            优先级
            <select
              value={draft.priority}
              onChange={(event) =>
                actions.onDraftChange("priority", event.target.value)}
              aria-invalid={draftErrors.priority !== undefined}
            >
              {supportTicketPrioritySchema.options.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
            {draftErrors.priority
              ? <span role="alert">{draftErrors.priority}</span>
              : null}
          </label>
        </div>
        <label>
          问题主题
          <input
            value={draft.subject}
            maxLength={160}
            onChange={(event) => actions.onDraftChange("subject", event.target.value)}
            aria-invalid={draftErrors.subject !== undefined}
            placeholder="用一句话概括问题"
          />
          {draftErrors.subject
            ? <span role="alert">{draftErrors.subject}</span>
            : null}
        </label>
        <label>
          问题描述
          <textarea
            value={draft.description}
            maxLength={10_000}
            rows={5}
            onChange={(event) =>
              actions.onDraftChange("description", event.target.value)}
            aria-invalid={draftErrors.description !== undefined}
            placeholder="请说明发生经过和你希望获得的帮助"
          />
          {draftErrors.description
            ? <span role="alert">{draftErrors.description}</span>
            : null}
        </label>
        <details className="xlb-support-form__references">
          <summary>关联业务事项（可选）</summary>
          <p>引用只用于服务端验证和关联；售后引用必须同时提供订单引用。</p>
          <label>
            订单 ID
            <input
              value={draft.orderId}
              maxLength={64}
              autoComplete="off"
              onChange={(event) => actions.onDraftChange("orderId", event.target.value)}
              aria-invalid={draftErrors.orderId !== undefined}
            />
            {draftErrors.orderId
              ? <span role="alert">{draftErrors.orderId}</span>
              : null}
          </label>
          <label>
            售后投诉 ID
            <input
              value={draft.complaintId}
              maxLength={64}
              autoComplete="off"
              onChange={(event) =>
                actions.onDraftChange("complaintId", event.target.value)}
              aria-invalid={draftErrors.complaintId !== undefined}
            />
            {draftErrors.complaintId
              ? <span role="alert">{draftErrors.complaintId}</span>
              : null}
          </label>
        </details>
        <CustomerButton
          type="submit"
          busy={busy}
          disabled={!canSubmit || viewModel.operation !== null}
        >
          {busy ? "正在提交" : "提交工单"}
        </CustomerButton>
      </form>
    </GlassCard>
  );
}

function TicketCard({
  ticket,
  onOpen,
}: {
  readonly ticket: SupportTicket;
  readonly onOpen: () => void;
}) {
  return (
    <article className="xlb-support-ticket-card" aria-label={`工单：${ticket.subject}`}>
      <div className="xlb-support-ticket-card__top">
        <div>
          <p>{TYPE_LABELS[ticket.type]} · {PRIORITY_LABELS[ticket.priority]}优先级</p>
          <h3>{ticket.subject}</h3>
        </div>
        <StatusTag status={ticket.status} />
      </div>
      <p className="xlb-support-ticket-card__description">{ticket.description}</p>
      <div className="xlb-support-ticket-card__footer">
        <time dateTime={ticket.updatedAt}>更新于 {dateTime(ticket.updatedAt)}</time>
        <CustomerButton variant="quiet" onClick={onOpen}>
          查看详情
        </CustomerButton>
      </div>
    </article>
  );
}

export function CustomerSupportTicketList({
  viewModel,
  actions,
}: CustomerSupportTicketComponentProps) {
  return (
    <section className="xlb-support-list" aria-labelledby="support-list-title">
      <div className="xlb-support-section-heading">
        <p className="xlb-support-eyebrow">处理记录</p>
        <h2 id="support-list-title">我的工单</h2>
      </div>
      {viewModel.tickets.length === 0 ? (
        <div className="xlb-support-list__empty" role="status">
          <h3>还没有客服工单</h3>
          <p>提交后的工单会在这里显示正式处理状态。</p>
        </div>
      ) : (
        <div className="xlb-support-list__items">
          {viewModel.tickets.map((ticket) => (
            <TicketCard
              key={ticket.ticketId}
              ticket={ticket}
              onOpen={() => actions.onOpenTicket(ticket.ticketId)}
            />
          ))}
        </div>
      )}
      {viewModel.nextCursor !== null ? (
        <CustomerButton
          variant="secondary"
          className="xlb-support-list__more"
          busy={viewModel.loadingMore}
          disabled={viewModel.operation !== null || viewModel.refreshing}
          onClick={actions.onLoadMore}
        >
          {viewModel.loadingMore ? "正在加载" : "加载更多"}
        </CustomerButton>
      ) : null}
    </section>
  );
}

export function CustomerSupportTicketDetail({
  viewModel,
}: CustomerSupportTicketComponentProps) {
  const detail = viewModel.detail;
  if (detail === null) return null;
  const { ticket } = detail;
  return (
    <GlassCard className="xlb-support-detail">
      <div className="xlb-support-detail__heading">
        <div>
          <p>{TYPE_LABELS[ticket.type]} · {PRIORITY_LABELS[ticket.priority]}优先级</p>
          <h2>{ticket.subject}</h2>
        </div>
        <StatusTag status={ticket.status} />
      </div>
      <p className="xlb-support-detail__description">{ticket.description}</p>
      <dl className="xlb-support-detail__facts">
        <div>
          <dt>创建时间</dt>
          <dd>{dateTime(ticket.createdAt)}</dd>
        </div>
        <div>
          <dt>最后更新</dt>
          <dd>{dateTime(ticket.updatedAt)}</dd>
        </div>
        {ticket.relatedOrderId !== null ? (
          <div>
            <dt>关联订单</dt>
            <dd className="xlb-support-sensitive-id">{ticket.relatedOrderId}</dd>
          </div>
        ) : null}
        {ticket.linkedAftersaleComplaintId !== null ? (
          <div>
            <dt>关联售后</dt>
            <dd className="xlb-support-sensitive-id">
              {ticket.linkedAftersaleComplaintId}
            </dd>
          </div>
        ) : null}
      </dl>
    </GlassCard>
  );
}

export function CustomerSupportTicketTimeline({
  viewModel,
}: CustomerSupportTicketComponentProps) {
  const events = viewModel.detail?.events ?? [];
  return (
    <section className="xlb-support-timeline" aria-labelledby="support-timeline-title">
      <div className="xlb-support-section-heading">
        <p className="xlb-support-eyebrow">正式记录</p>
        <h2 id="support-timeline-title">处理时间线</h2>
      </div>
      {events.length === 0 ? (
        <div className="xlb-support-list__empty" role="status">
          <h3>暂无可见事件</h3>
          <p>仅展示服务端标记为 requester 或 all 的事件。</p>
        </div>
      ) : (
        <ol>
          {events.map((event) => (
            <li key={event.ticketEventId}>
              <span className="xlb-support-timeline__marker" aria-hidden="true" />
              <div>
                <div className="xlb-support-timeline__heading">
                  <strong>{EVENT_LABELS[event.eventType]}</strong>
                  <time dateTime={event.createdAt}>{dateTime(event.createdAt)}</time>
                </div>
                {event.content !== null ? <p>{event.content}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function CustomerSupportTicketFollowup({
  viewModel,
  actions,
}: CustomerSupportTicketComponentProps) {
  const ticket = viewModel.detail?.ticket;
  if (ticket === undefined || ticket.status === "closed") return null;
  const busy = viewModel.operation === "commenting";
  return (
    <GlassCard className="xlb-support-followup">
      <div className="xlb-support-section-heading">
        <h2>补充留言</h2>
        <p>留言经服务端确认后才会加入时间线。</p>
      </div>
      <label>
        留言内容
        <textarea
          rows={4}
          maxLength={10_000}
          value={viewModel.comment}
          onChange={(event) => actions.onCommentChange(event.target.value)}
        />
      </label>
      <CustomerButton
        busy={busy}
        disabled={
          viewModel.comment.trim() === "" ||
          viewModel.operation !== null
        }
        onClick={actions.onComment}
      >
        {busy ? "正在提交" : "提交留言"}
      </CustomerButton>
    </GlassCard>
  );
}

export function CustomerSupportTicketReopen({
  viewModel,
  actions,
}: CustomerSupportTicketComponentProps) {
  const ticket = viewModel.detail?.ticket;
  if (ticket?.status !== "resolved") return null;
  const busy = viewModel.operation === "reopening";
  return (
    <GlassCard className="xlb-support-followup">
      <div className="xlb-support-section-heading">
        <h2>问题仍未解决？</h2>
        <p>当前状态允许请求重开；服务端将重新裁决并返回最新状态。</p>
      </div>
      <label>
        重开说明（可选）
        <textarea
          rows={3}
          maxLength={2_000}
          value={viewModel.reopenReason}
          onChange={(event) => actions.onReopenReasonChange(event.target.value)}
        />
      </label>
      <CustomerButton
        variant="secondary"
        busy={busy}
        disabled={viewModel.operation !== null}
        onClick={actions.onReopen}
      >
        {busy ? "正在请求" : "请求重开"}
      </CustomerButton>
    </GlassCard>
  );
}

export function CustomerSupportTicketCsat({
  viewModel,
  actions,
}: CustomerSupportTicketComponentProps) {
  const ticket = viewModel.detail?.ticket;
  if (ticket?.status !== "closed") return null;
  if (viewModel.csatReceipt !== null || viewModel.csatServerDecided) {
    return (
      <GlassCard className="xlb-support-csat" role="status">
        <p className="xlb-support-eyebrow">服务评价</p>
        <h2>
          {viewModel.csatReceipt !== null
            ? "评价已由服务端确认"
            : "服务端已裁决该工单的评价状态"}
        </h2>
        <p>
          {viewModel.csatReceipt !== null
            ? `本次提交为 ${viewModel.csatReceipt.score} 分。`
            : "不会再次提交或在本地伪造评价结果。"}
        </p>
      </GlassCard>
    );
  }
  const busy = viewModel.operation === "rating";
  return (
    <GlassCard className="xlb-support-csat">
      <div className="xlb-support-section-heading">
        <p className="xlb-support-eyebrow">服务评价</p>
        <h2>这次处理体验如何？</h2>
        <p>每个已关闭工单只能评价一次，是否可提交由服务端最终裁决。</p>
      </div>
      <fieldset>
        <legend>满意度评分</legend>
        <div className="xlb-support-csat__scores">
          {([1, 2, 3, 4, 5] as const).map((score) => (
            <label key={score}>
              <input
                type="radio"
                name="support-csat-score"
                value={score}
                checked={viewModel.csatScore === score}
                onChange={() => actions.onCsatScoreChange(score)}
              />
              <span>{score} 分</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        评价说明（可选）
        <textarea
          rows={3}
          maxLength={1_000}
          value={viewModel.csatComment}
          onChange={(event) => actions.onCsatCommentChange(event.target.value)}
        />
      </label>
      <CustomerButton
        busy={busy}
        disabled={viewModel.csatScore === null || viewModel.operation !== null}
        onClick={actions.onSubmitCsat}
      >
        {busy ? "正在提交" : "提交评价"}
      </CustomerButton>
    </GlassCard>
  );
}

export interface CustomerSupportHelpSlotProps {
  readonly title: string;
  readonly body: string;
  readonly items: readonly string[];
}

export function CustomerSupportHelpSlot({
  title,
  body,
  items,
}: CustomerSupportHelpSlotProps) {
  return (
    <aside className="xlb-support-help" aria-label={title}>
      <p className="xlb-support-eyebrow">帮助信息</p>
      <h2>{title}</h2>
      <p>{body}</p>
      {items.length > 0 ? (
        <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
      ) : null}
    </aside>
  );
}
