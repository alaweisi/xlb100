import {
  BrandLogo,
  CustomerButton,
  CustomerStatePanel,
} from "@xlb/customer-components";
import type {
  CustomerConfirmationStatus,
  FulfillmentEvidence,
  OrderStatus,
} from "@xlb/types";
import {
  CUSTOMER_ORDER_DETAIL_ACTIONS,
  type CustomerOrderDetailAction,
  type CustomerOrderDetailResource,
  type CustomerOrderDetailTemplateReadyData,
} from "./CustomerOrderDetailTypes.js";

export type CustomerOrderDetailComponentProps =
  CustomerOrderDetailTemplateReadyData;

const ORDER_STATUS_LABELS = Object.freeze({
  draft: "待提交",
  pending_dispatch: "待履约",
  service_completed: "服务已完成",
  pending_payment: "服务端状态：pending_payment",
  paid: "已支付",
  cancelled: "已取消",
}) satisfies Readonly<Record<OrderStatus, string>>;

const CONFIRMATION_LABELS = Object.freeze({
  pending: "等待顾客决定",
  confirmed: "顾客已确认",
  disputed: "顾客已提出异议",
}) satisfies Readonly<Record<CustomerConfirmationStatus, string>>;

const EVIDENCE_LABELS = Object.freeze({
  arrival: "到达",
  before_service: "服务前",
  diagnosis: "诊断",
  material: "材料",
  after_service: "服务后",
  completion: "完工",
});

const ACTION_LABELS = Object.freeze({
  "view-evidence": "查看履约证据",
  "confirm-fulfillment": "确认履约",
  "dispute-fulfillment": "提交履约异议",
  "confirm-service": "确认服务完成",
  payment: "前往支付",
  change: "变更订单",
  refund: "申请退款",
  aftersale: "投诉与售后",
  review: "评价服务",
}) satisfies Readonly<Record<CustomerOrderDetailAction, string>>;

const REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  evidence_empty: "暂无服务端证据",
  evidence_unavailable: "证据依赖当前不可用",
  confirmation_not_pending_or_evidence_incomplete: "需已完工且有服务后或完工证据",
  owned_same_order_complaint_required: "异议需先选择本人同订单投诉",
  completed_fulfillment_required: "需服务端确认履约已完成",
  payment_order_reference_unavailable: "当前没有可读取的正式支付单引用",
  order_not_service_completed: "订单尚未进入 service_completed",
  change_requires_unstarted_pending_dispatch: "仅待履约且未开工时可变更",
  refund_requires_paid_order: "仅 paid 订单可进入退款",
  order_already_reviewed: "该订单已有评价",
  review_requires_paid_completed_order: "需 paid 订单、已完成履约且尚未评价",
}) satisfies Readonly<Record<string, string>>;

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未提供";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function maskedPhone(value: string): string {
  return /^1\d{10}$/u.test(value)
    ? `${value.slice(0, 3)}****${value.slice(-4)}`
    : "已保护";
}

function ResourceBoundary({
  resource,
  empty,
}: {
  readonly resource: CustomerOrderDetailResource<unknown>;
  readonly empty: string;
}) {
  if (resource.status === "empty") {
    return <p className="xlb-order-detail-resource-state">{empty}</p>;
  }
  if (resource.status === "error") {
    return (
      <p className="xlb-order-detail-resource-state" role="status">
        {resource.retryable
          ? "该部分读取失败，可刷新重试。"
          : "该部分响应无法安全展示。"}
      </p>
    );
  }
  if (resource.status === "unavailable") {
    return (
      <p className="xlb-order-detail-resource-state" role="status">
        该部分当前不可用，页面不会用本地事实补齐。
      </p>
    );
  }
  return null;
}

export function safeAuthorizedEvidenceUrl(
  value: unknown,
  allowedOrigins: readonly string[],
): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !allowedOrigins.includes(url.origin)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function evidenceUrl(evidence: FulfillmentEvidence): string | null {
  return safeAuthorizedEvidenceUrl(
    evidence.mediaAsset.storage.publicUrl,
    typeof window === "undefined" ? [] : [window.location.origin],
  );
}

export function CustomerOrderDetailHeader({
  viewModel,
  actions,
}: CustomerOrderDetailComponentProps) {
  return (
    <header
      className="xlb-order-detail-header"
      data-order-detail-component="header"
    >
      <CustomerButton
        variant="quiet"
        className="xlb-order-detail-header__back"
        onClick={actions.onBack}
      >
        返回订单
      </CustomerButton>
      <div className="xlb-order-detail-header__copy">
        <BrandLogo variant="compact" />
        <div>
          <p>正式订单 · 当前服务城市</p>
          <h1>订单详情</h1>
        </div>
      </div>
      <CustomerButton
        variant="quiet"
        className="xlb-order-detail-header__refresh"
        disabled={viewModel.submission !== null}
        onClick={actions.onRefresh}
      >
        刷新
      </CustomerButton>
    </header>
  );
}

export function CustomerOrderDetailBoundaryHeader() {
  return (
    <header
      className="xlb-order-detail-header xlb-order-detail-header--boundary"
      data-order-detail-component="header"
    >
      <BrandLogo variant="compact" />
      <div>
        <p>正式订单 · 当前服务城市</p>
        <h1>订单详情</h1>
      </div>
    </header>
  );
}

export function CustomerOrderDetailFeedback({
  viewModel,
  actions,
}: CustomerOrderDetailComponentProps) {
  const { notice, aggregate } = viewModel;
  return (
    <div data-order-detail-component="feedback">
      {aggregate.partial ? (
        <div className="xlb-order-detail-feedback" data-kind="partial" role="status">
          部分关联事实暂未读取成功；可用区域仍以本次服务端响应展示。
        </div>
      ) : null}
      {notice ? (
        <div
          className="xlb-order-detail-feedback"
          data-kind={notice.kind}
          role={notice.kind === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <span>{notice.message}</span>
          <button type="button" onClick={actions.onDismissNotice}>关闭</button>
        </div>
      ) : null}
    </div>
  );
}

export function CustomerOrderSnapshot({
  viewModel,
}: CustomerOrderDetailComponentProps) {
  const { order } = viewModel.aggregate;
  return (
    <section
      className="xlb-order-detail-section xlb-order-detail-snapshot"
      data-order-detail-component="order-snapshot"
      aria-labelledby="order-detail-snapshot-title"
    >
      <div className="xlb-order-detail-section__heading">
        <div>
          <p>订单状态</p>
          <h2 id="order-detail-snapshot-title">{order.skuName}</h2>
        </div>
        <span className="xlb-order-detail-status">
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>
      {order.status === "pending_payment" ? (
        <p className="xlb-order-detail-gap" role="note">
          GAP-10：该状态按当前正式流程不可达，仅原样展示服务端事实，不提供可达 CTA。
        </p>
      ) : null}
      <dl className="xlb-order-detail-facts">
        <div><dt>服务数量</dt><dd>{order.quantity} {order.unit}</dd></div>
        <div><dt>订单金额</dt><dd>{order.priceText}</dd></div>
        <div><dt>预约时间</dt><dd>{formatTime(order.scheduledAt)}</dd></div>
        <div><dt>服务地址</dt><dd>{order.addressProvince}{order.addressCity}{order.addressDistrict}{order.detailAddress}</dd></div>
        <div><dt>联系人</dt><dd>{order.contactName} · {maskedPhone(order.contactPhone)}</dd></div>
        <div><dt>订单编号</dt><dd>{order.orderId}</dd></div>
      </dl>
    </section>
  );
}

export function CustomerFulfillmentTimeline({
  viewModel,
}: CustomerOrderDetailComponentProps) {
  const { evidence, confirmations } = viewModel.aggregate;
  return (
    <section
      className="xlb-order-detail-section"
      data-order-detail-component="fulfillment"
      aria-labelledby="order-detail-fulfillment-title"
    >
      <div className="xlb-order-detail-section__heading">
        <div>
          <p>服务端履约事实</p>
          <h2 id="order-detail-fulfillment-title">履约进度</h2>
        </div>
      </div>
      {evidence.status === "ready" ? (
        <ol className="xlb-order-detail-timeline">
          {evidence.data.map((item) => (
            <li key={item.fulfillmentId}>
              <span>{item.fulfillmentStatus}</span>
              <strong>
                {confirmations.status === "ready"
                  ? (() => {
                    const confirmation = confirmations.data.find(
                      (candidate) =>
                        candidate.fulfillmentId === item.fulfillmentId,
                    );
                    return confirmation
                      ? CONFIRMATION_LABELS[confirmation.status]
                      : "尚无顾客确认事实";
                  })()
                  : confirmations.status === "empty"
                    ? "尚无顾客确认事实"
                    : "顾客确认事实当前不可用"}
              </strong>
              <small>履约编号 {item.fulfillmentId}</small>
            </li>
          ))}
        </ol>
      ) : (
        <ResourceBoundary resource={evidence} empty="暂无履约记录。" />
      )}
      {evidence.status === "ready" &&
        confirmations.status !== "ready" &&
        confirmations.status !== "empty" ? (
          <ResourceBoundary
            resource={confirmations}
            empty="尚无顾客确认事实。"
          />
        ) : null}
    </section>
  );
}

export function CustomerEvidenceGallery({
  viewModel,
}: CustomerOrderDetailComponentProps) {
  const { evidence } = viewModel.aggregate;
  const items = evidence.status === "ready"
    ? evidence.data.flatMap((aggregate) => aggregate.evidence)
    : [];
  return (
    <section
      id="customer-order-evidence"
      className="xlb-order-detail-section"
      data-order-detail-component="evidence"
      aria-labelledby="order-detail-evidence-title"
      tabIndex={-1}
    >
      <div className="xlb-order-detail-section__heading">
        <div>
          <p>私有媒体与校验元数据</p>
          <h2 id="order-detail-evidence-title">履约证据</h2>
        </div>
        <span>{items.length} 项</span>
      </div>
      {items.length > 0 ? (
        <div className="xlb-order-detail-evidence-list">
          {items.map((item) => {
            const url = evidenceUrl(item);
            return (
              <article key={item.evidenceId}>
                <div>
                  <strong>{EVIDENCE_LABELS[item.evidenceType]}</strong>
                  <time dateTime={item.capturedAt}>{formatTime(item.capturedAt)}</time>
                </div>
                <p>{item.note ?? "服务端未提供说明"}</p>
                <small>
                  {item.mediaAsset.contentType} · {Math.ceil(item.mediaAsset.sizeBytes / 1024)} KB
                </small>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer">
                    打开已授权媒体
                  </a>
                ) : (
                  <span className="xlb-order-detail-media-unavailable">
                    未返回可安全使用的授权 URL，仅展示元数据
                  </span>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <ResourceBoundary resource={evidence} empty="暂无履约证据。" />
      )}
      <p className="xlb-order-detail-gap" role="note">
        GAP-11：当前正式存储事实仍是 local/mock，生产对象存储与授权 URL 尚未形成；页面不会拼接对象键、storageUri 或本地路径。
      </p>
    </section>
  );
}

export function CustomerRelatedCaseSummary({
  viewModel,
  actions,
}: CustomerOrderDetailComponentProps) {
  const { reverses, complaints, review } = viewModel.aggregate;
  return (
    <section
      className="xlb-order-detail-section"
      data-order-detail-component="related"
      aria-labelledby="order-detail-related-title"
    >
      <div className="xlb-order-detail-section__heading">
        <div>
          <p>关联事实独立加载</p>
          <h2 id="order-detail-related-title">逆向、投诉与评价</h2>
        </div>
      </div>
      <div className="xlb-order-detail-related">
        <div>
          <h3>逆向申请</h3>
          {reverses.status === "ready" ? (
            <ul>
              {reverses.data.map((item) => (
                <li key={item.reverseRequestId}>
                  <span>{item.reverseType}</span><strong>{item.status}</strong>
                </li>
              ))}
            </ul>
          ) : <ResourceBoundary resource={reverses} empty="暂无逆向申请。" />}
        </div>
        <div>
          <h3>投诉</h3>
          {complaints.status === "ready" ? (
            <div className="xlb-order-detail-complaints">
              {complaints.data.map((item) => (
                <button
                  key={item.complaintId}
                  type="button"
                  aria-pressed={viewModel.selectedComplaintId === item.complaintId}
                  onClick={() => actions.onSelectComplaint(item.complaintId)}
                >
                  <span>{item.category}</span>
                  <strong>{item.status}</strong>
                </button>
              ))}
            </div>
          ) : <ResourceBoundary resource={complaints} empty="暂无投诉。" />}
        </div>
        <div>
          <h3>评价</h3>
          {review.status === "ready" ? (
            <p className="xlb-order-detail-review">
              {review.data.review.rating} 星 · {review.data.visibility.visibility}
            </p>
          ) : <ResourceBoundary resource={review} empty="尚未评价。" />}
        </div>
      </div>
    </section>
  );
}

function actionReason(reasonCode: string | null): string | undefined {
  return reasonCode === null
    ? undefined
    : REASON_LABELS[reasonCode] ?? "当前服务端事实不允许此动作";
}

export function CustomerOrderStateAwareActionBar({
  viewModel,
  actions,
}: CustomerOrderDetailComponentProps) {
  const deciding = viewModel.submission === "deciding-confirmation";
  const confirmingService = viewModel.submission === "confirming-service";
  return (
    <section
      className="xlb-order-detail-section xlb-order-detail-actions"
      data-order-detail-component="action-bar"
      aria-labelledby="order-detail-actions-title"
      aria-busy={viewModel.submission !== null}
    >
      <div className="xlb-order-detail-section__heading">
        <div>
          <p>点击前会重新读取服务端事实</p>
          <h2 id="order-detail-actions-title">可用操作</h2>
        </div>
      </div>
      <label className="xlb-order-detail-note">
        <span>确认或异议说明</span>
        <textarea
          value={viewModel.confirmationNote}
          maxLength={500}
          disabled={viewModel.submission !== null}
          placeholder="异议必须填写至少 2 个字；确认说明可选"
          onChange={(event) =>
            actions.onChangeConfirmationNote(event.currentTarget.value)}
        />
      </label>
      <div className="xlb-order-detail-action-grid">
        {CUSTOMER_ORDER_DETAIL_ACTIONS.map((action) => {
          const state = viewModel.availability[action];
          const busy = action === "confirm-service"
            ? confirmingService
            : (action === "confirm-fulfillment" ||
                action === "dispute-fulfillment") && deciding;
          return (
            <div key={action}>
              <CustomerButton
                variant={
                  action === "confirm-service" ||
                  action === "confirm-fulfillment"
                    ? "primary"
                    : "secondary"
                }
                busy={busy}
                disabled={!state.available || viewModel.submission !== null}
                onClick={() => actions.onAction(action)}
              >
                {ACTION_LABELS[action]}
              </CustomerButton>
              {!state.available ? (
                <small>{actionReason(state.reasonCode)}</small>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CustomerOrderDetailStatePanel({
  kind,
  title,
  description,
  actionLabel,
  onAction,
}: {
  readonly kind: "loading" | "empty" | "error" | "offline";
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}) {
  return (
    <CustomerStatePanel
      kind={kind}
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}
