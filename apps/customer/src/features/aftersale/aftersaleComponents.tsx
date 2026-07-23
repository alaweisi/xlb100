import {
  CustomerButton,
  CustomerStatePanel,
  GlassCard,
} from "@xlb/customer-components";
import type {
  AftersaleComplaint,
  AftersaleTimelineEvent,
  ComplaintCategory,
  ComplaintPriority,
  ComplaintStatus,
} from "@xlb/types";
import {
  complaintCategorySchema,
  complaintPrioritySchema,
} from "@xlb/validators";
import type {
  CustomerAftersaleTemplateReadyData,
  CustomerVisibleAftersaleTimelineEvent,
} from "./aftersaleTypes.js";

export type CustomerAftersaleComponentProps =
  CustomerAftersaleTemplateReadyData;

const CATEGORY_LABELS = Object.freeze({
  service_quality: "服务质量",
  price_dispute: "价格争议",
  material: "材料问题",
  timeliness: "时效问题",
  attitude: "服务态度",
  safety: "安全问题",
  damage: "物品损坏",
  other: "其他问题",
}) satisfies Readonly<Record<ComplaintCategory, string>>;

const PRIORITY_LABELS = Object.freeze({
  normal: "普通",
  urgent: "紧急",
  critical: "严重",
}) satisfies Readonly<Record<ComplaintPriority, string>>;

const STATUS_LABELS = Object.freeze({
  submitted: "已提交",
  triaged: "已受理",
  in_progress: "处理中",
  waiting_customer: "等待你的响应",
  resolved: "已给出处理结果",
  closed: "已关闭",
  rejected: "未受理",
}) satisfies Readonly<Record<ComplaintStatus, string>>;

const EVENT_LABELS: Readonly<
  Partial<Record<AftersaleTimelineEvent["eventType"], string>>
> = Object.freeze({
  "complaint.submitted": "投诉已提交",
  "complaint.triaged": "投诉已受理",
  "complaint.status_changed": "处理状态已更新",
  "complaint.resolved": "已给出处理结果",
  "complaint.closed": "投诉已关闭",
  "repair.created": "已创建返修安排",
  "repair.started": "返修已开始",
  "repair.completed": "返修已完成",
  "liability.decided": "责任判定已更新",
  "compensation.proposed": "已提出补偿意向",
  "compensation.approved": "补偿意向审核通过",
  "compensation.rejected": "补偿意向未通过",
  "fulfillment.customer_disputed": "顾客已提出履约异议",
  "customer_service.note": "你补充了说明",
});

function displayTime(value: string): string {
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

function ComplaintStatusTag({ complaint }: {
  readonly complaint: AftersaleComplaint;
}) {
  return (
    <span
      className="xlb-aftersale-status"
      data-status={complaint.status}
    >
      {STATUS_LABELS[complaint.status]}
    </span>
  );
}

export function AftersaleHeader({
  viewModel,
  actions,
}: CustomerAftersaleComponentProps) {
  return (
    <header className="xlb-aftersale-header">
      <CustomerButton
        variant="quiet"
        onClick={actions.onBack}
        aria-label="返回上一页"
      >
        返回
      </CustomerButton>
      <div>
        <p>喜乐帮 · 安心服务</p>
        <h1>{viewModel.route.view === "order" ? "订单售后" : "投诉详情"}</h1>
      </div>
      <CustomerButton
        variant="quiet"
        busy={viewModel.refreshing}
        disabled={viewModel.operation !== null}
        onClick={actions.onRefresh}
      >
        {viewModel.refreshing ? "刷新中" : "刷新"}
      </CustomerButton>
    </header>
  );
}

export function AftersaleFeedback({
  viewModel,
  actions,
}: CustomerAftersaleComponentProps) {
  if (viewModel.notice === null) return null;
  return (
    <div
      className="xlb-aftersale-feedback"
      data-kind={viewModel.notice.kind}
      role={viewModel.notice.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <span>{viewModel.notice.message}</span>
      <CustomerButton variant="quiet" onClick={actions.onDismissNotice}>
        关闭
      </CustomerButton>
    </div>
  );
}

function ComplaintCard({
  complaint,
  onOpen,
}: {
  readonly complaint: AftersaleComplaint;
  readonly onOpen: () => void;
}) {
  return (
    <article className="xlb-aftersale-case-card">
      <div className="xlb-aftersale-card-heading">
        <div>
          <p>
            {CATEGORY_LABELS[complaint.category]} ·
            {PRIORITY_LABELS[complaint.priority]}优先级
          </p>
          <h3>{complaint.description}</h3>
        </div>
        <ComplaintStatusTag complaint={complaint} />
      </div>
      {complaint.status === "waiting_customer" ? (
        <p className="xlb-aftersale-waiting" role="status">
          当前需要你的响应，请进入详情补充说明。
        </p>
      ) : null}
      <div className="xlb-aftersale-card-footer">
        <time dateTime={complaint.updatedAt}>
          更新于 {displayTime(complaint.updatedAt)}
        </time>
        <CustomerButton variant="quiet" onClick={onOpen}>
          查看进展
        </CustomerButton>
      </div>
    </article>
  );
}

export function AftersaleCaseList({
  viewModel,
  actions,
}: CustomerAftersaleComponentProps) {
  if (viewModel.route.view !== "order") return null;
  return (
    <section className="xlb-aftersale-section" aria-labelledby="case-list-title">
      <div className="xlb-aftersale-section-heading">
        <p>正式处理记录</p>
        <h2 id="case-list-title">本订单的投诉</h2>
      </div>
      {viewModel.complaints.length === 0 ? (
        <div className="xlb-aftersale-empty">
          <CustomerStatePanel
            kind="empty"
            title="暂无投诉记录"
            description="创建后的投诉会在这里显示服务端返回的处理状态。"
          />
        </div>
      ) : (
        <div className="xlb-aftersale-case-list">
          {viewModel.complaints.map((complaint) => (
            <ComplaintCard
              key={complaint.complaintId}
              complaint={complaint}
              onOpen={() => actions.onOpenComplaint(complaint.complaintId)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function AftersaleComplaintComposer({
  viewModel,
  actions,
}: CustomerAftersaleComponentProps) {
  if (viewModel.route.view !== "order") return null;
  const busy = viewModel.operation === "creating-complaint";
  const disabled = viewModel.operation !== null || viewModel.refreshing;
  const descriptionLength = viewModel.draft.description.trim().length;
  return (
    <GlassCard className="xlb-aftersale-composer">
      <div className="xlb-aftersale-section-heading">
        <p>需要我们介入？</p>
        <h2>发起投诉</h2>
      </div>
      <form onSubmit={(event) => {
        event.preventDefault();
        actions.onCreateComplaint();
      }}>
        <div className="xlb-aftersale-form-row">
          <label>
            投诉类别
            <select
              value={viewModel.draft.category}
              disabled={disabled}
              aria-invalid={viewModel.draftErrors.category !== undefined}
              onChange={(event) =>
                actions.onDraftChange("category", event.target.value)}
            >
              {complaintCategorySchema.options.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>
          <label>
            优先级
            <select
              value={viewModel.draft.priority}
              disabled={disabled}
              aria-invalid={viewModel.draftErrors.priority !== undefined}
              onChange={(event) =>
                actions.onDraftChange("priority", event.target.value)}
            >
              {complaintPrioritySchema.options.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          问题描述
          <textarea
            aria-label="问题描述"
            value={viewModel.draft.description}
            rows={5}
            minLength={5}
            maxLength={2_000}
            disabled={disabled}
            aria-invalid={viewModel.draftErrors.description !== undefined}
            onChange={(event) =>
              actions.onDraftChange("description", event.target.value)}
            placeholder="请说明发生经过和希望获得的处理"
          />
          <span className="xlb-aftersale-field-help">
            {viewModel.draftErrors.description ??
              "订单归属与是否可投诉由服务端最终裁决。"}
          </span>
        </label>
        <CustomerButton
          type="submit"
          busy={busy}
          disabled={disabled || descriptionLength < 5}
        >
          {busy ? "正在创建投诉" : "提交投诉"}
        </CustomerButton>
      </form>
    </GlassCard>
  );
}

function Timeline({
  events,
}: {
  readonly events: readonly CustomerVisibleAftersaleTimelineEvent[];
}) {
  return (
    <section className="xlb-aftersale-timeline" aria-labelledby="timeline-title">
      <div className="xlb-aftersale-section-heading">
        <p>服务端正式记录</p>
        <h2 id="timeline-title">处理时间线</h2>
      </div>
      {events.length === 0 ? (
        <div className="xlb-aftersale-empty" role="status">
          <h3>暂无顾客可见事件</h3>
          <p>后台专用事件与备注不会进入此页面。</p>
        </div>
      ) : (
        <ol>
          {events.map((event) => (
            <li key={event.timelineEventId}>
              <span aria-hidden="true" />
              <div>
                <strong>{EVENT_LABELS[event.eventType] ?? "处理记录已更新"}</strong>
                <time dateTime={event.createdAt}>
                  {displayTime(event.createdAt)}
                </time>
                {event.content !== null ? <p>{event.content}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function AftersaleCaseDetail({
  viewModel,
}: CustomerAftersaleComponentProps) {
  const detail = viewModel.detail;
  if (viewModel.route.view !== "detail" || detail === null) return null;
  const { complaint } = detail;
  return (
    <>
      <GlassCard className="xlb-aftersale-detail">
        <div className="xlb-aftersale-card-heading">
          <div>
            <p>
              {CATEGORY_LABELS[complaint.category]} ·
              {PRIORITY_LABELS[complaint.priority]}优先级
            </p>
            <h2>投诉处理进展</h2>
          </div>
          <ComplaintStatusTag complaint={complaint} />
        </div>
        <p className="xlb-aftersale-description">{complaint.description}</p>
        {complaint.status === "waiting_customer" ? (
          <div className="xlb-aftersale-waiting" role="status">
            <strong>等待你的响应</strong>
            <p>请在下方补充说明。提交后页面会重新读取正式时间线。</p>
          </div>
        ) : null}
        {complaint.resolutionNote !== null ? (
          <div className="xlb-aftersale-fact">
            <span>处理说明</span>
            <p>{complaint.resolutionNote}</p>
          </div>
        ) : null}
      </GlassCard>

      <section className="xlb-aftersale-grid">
        <GlassCard>
          <div className="xlb-aftersale-section-heading">
            <p>返修安排</p>
            <h2>Repair</h2>
          </div>
          {detail.repairOrders.length === 0 ? (
            <div className="xlb-aftersale-empty" data-state="no-repair">
              <h3>暂无返修安排</h3>
              <p>如服务端创建返修，会在这里显示正式状态。</p>
            </div>
          ) : detail.repairOrders.map((repair) => (
            <article key={repair.repairOrderId} className="xlb-aftersale-fact">
              <strong>{repair.status}</strong>
              <p>{repair.reason}</p>
              {repair.serviceNote !== null ? <p>{repair.serviceNote}</p> : null}
            </article>
          ))}
        </GlassCard>

        <GlassCard>
          <div className="xlb-aftersale-section-heading">
            <p>责任判定</p>
            <h2>Responsibility</h2>
          </div>
          {detail.liabilityDecision === null ? (
            <div className="xlb-aftersale-empty">
              <h3>暂无责任判定</h3>
              <p>页面不根据处理进度自行推断责任。</p>
            </div>
          ) : (
            <div className="xlb-aftersale-fact">
              <strong>{detail.liabilityDecision.liableParty}</strong>
              <p>{detail.liabilityDecision.reason}</p>
            </div>
          )}
        </GlassCard>
      </section>

      <GlassCard className="xlb-aftersale-compensation">
        <div className="xlb-aftersale-section-heading">
          <p>GAP-12 安全展示</p>
          <h2>补偿意向</h2>
        </div>
        {detail.compensationIntents.length === 0 ? (
          <div className="xlb-aftersale-empty" data-state="no-compensation">
            <h3>暂无补偿意向</h3>
            <p>页面不会根据投诉状态推断补偿。</p>
          </div>
        ) : detail.compensationIntents.map((intent) => (
          <article
            key={intent.compensationIntentId}
            className="xlb-aftersale-compensation-item"
            data-provider-execution-status={intent.providerExecutionStatus}
          >
            <div>
              <strong>补偿意向 · 尚未执行</strong>
              <span>{intent.status}</span>
            </div>
            <p>{intent.reason}</p>
            <dl>
              <div>
                <dt>申请事实</dt>
                <dd>{intent.requestedAmount} {intent.currency}</dd>
              </div>
              {intent.approvedAmount !== null ? (
                <div>
                  <dt>审核事实</dt>
                  <dd>{intent.approvedAmount} {intent.currency}</dd>
                </div>
              ) : null}
            </dl>
            <small>Provider 执行状态：尚未执行</small>
          </article>
        ))}
      </GlassCard>

      <Timeline events={detail.timeline} />
    </>
  );
}

export function AftersaleNoteComposer({
  viewModel,
  actions,
}: CustomerAftersaleComponentProps) {
  if (viewModel.route.view !== "detail" || viewModel.detail === null) return null;
  const busy = viewModel.operation === "adding-note";
  return (
    <GlassCard className="xlb-aftersale-note">
      <div className="xlb-aftersale-section-heading">
        <p>顾客可见备注</p>
        <h2>补充说明</h2>
      </div>
      <label>
        说明内容
        <textarea
          rows={4}
          maxLength={1_000}
          value={viewModel.note}
          disabled={viewModel.operation !== null || viewModel.refreshing}
          onChange={(event) => actions.onNoteChange(event.target.value)}
        />
      </label>
      <CustomerButton
        busy={busy}
        disabled={
          viewModel.note.trim() === "" ||
          viewModel.operation !== null ||
          viewModel.refreshing
        }
        onClick={actions.onAddNote}
      >
        {busy ? "正在添加备注" : "提交备注"}
      </CustomerButton>
    </GlassCard>
  );
}
