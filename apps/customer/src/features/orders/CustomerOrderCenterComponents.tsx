import {
  BrandLogo,
  CustomerButton,
  CustomerStatePanel,
} from "@xlb/customer-components";
import type {
  CustomerOrderListFilter,
  CustomerOrderSummary,
  OrderStatus,
  ScheduledTimeSlot,
} from "@xlb/types";
import {
  CUSTOMER_ORDER_CENTER_FILTERS,
  orderCenterFilterForStatus,
  type CustomerOrderCenterTemplateReadyData,
} from "./CustomerOrderCenterTypes.js";

export type CustomerOrderCenterComponentProps =
  CustomerOrderCenterTemplateReadyData;

const FILTER_LABELS = Object.freeze({
  all: "全部",
  active: "进行中",
  completed: "已完成",
  cancelled: "已取消",
}) satisfies Readonly<Record<CustomerOrderListFilter, string>>;

const STATUS_LABELS = Object.freeze({
  draft: "待提交",
  pending_dispatch: "待派单",
  service_completed: "服务已完成",
  pending_payment: "待支付",
  paid: "已完成",
  cancelled: "已取消",
}) satisfies Readonly<Record<OrderStatus, string>>;

const TIME_SLOT_LABELS = Object.freeze({
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
}) satisfies Readonly<Record<ScheduledTimeSlot, string>>;

function displaySchedule(item: CustomerOrderSummary): string {
  const date = new Date(item.scheduledAt);
  if (!Number.isFinite(date.getTime())) return "预约时间暂不可用";
  return `${new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date)} ${TIME_SLOT_LABELS[item.scheduledTimeSlot]}`;
}

export function CustomerOrderCenterBoundaryHeader() {
  return (
    <header
      className="xlb-order-center-header xlb-order-center-header--boundary"
      data-order-center-component="header"
    >
      <BrandLogo variant="compact" />
      <div>
        <p>真实订单 · 当前服务城市</p>
        <h1>订单中心</h1>
      </div>
    </header>
  );
}

export function CustomerOrderCenterHeader({
  viewModel,
  actions,
}: CustomerOrderCenterComponentProps) {
  return (
    <header
      className="xlb-order-center-header"
      data-order-center-component="header"
    >
      <div className="xlb-order-center-header__copy">
        <BrandLogo variant="compact" />
        <div>
          <p>真实订单 · 当前服务城市</p>
          <h1>订单中心</h1>
        </div>
      </div>
      <CustomerButton
        variant="quiet"
        className="xlb-order-center-header__refresh"
        busy={viewModel.refreshing}
        disabled={viewModel.loadingMore}
        onClick={actions.onRefresh}
      >
        {viewModel.refreshing ? "刷新中" : "刷新"}
      </CustomerButton>
    </header>
  );
}

export function CustomerOrderCenterFilters({
  viewModel,
  actions,
}: CustomerOrderCenterComponentProps) {
  return (
    <nav
      className="xlb-order-center-filters"
      data-order-center-component="filters"
      role="tablist"
      aria-label="订单分组"
    >
      {CUSTOMER_ORDER_CENTER_FILTERS.map((filter) => (
        <button
          key={filter}
          type="button"
          role="tab"
          aria-selected={viewModel.filter === filter}
          disabled={viewModel.refreshing || viewModel.loadingMore}
          onClick={() => actions.onSelectFilter(filter)}
        >
          {FILTER_LABELS[filter]}
        </button>
      ))}
    </nav>
  );
}

export function CustomerOrderCenterFeedback({
  viewModel,
  actions,
}: CustomerOrderCenterComponentProps) {
  if (viewModel.notice === null) return null;
  return (
    <div
      className="xlb-order-center-feedback"
      data-kind={viewModel.notice.kind}
      data-order-center-component="feedback"
      role={viewModel.notice.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <span>{viewModel.notice.message}</span>
      <button type="button" onClick={actions.onDismissNotice}>关闭</button>
    </div>
  );
}

function CustomerOrderCenterCard({
  item,
  data,
}: {
  readonly item: CustomerOrderSummary;
  readonly data: CustomerOrderCenterTemplateReadyData;
}) {
  return (
    <article
      className="xlb-order-center-card"
      data-group={orderCenterFilterForStatus(item.status)}
      aria-label={`${STATUS_LABELS[item.status]}订单：${item.skuName}`}
    >
      <div className="xlb-order-center-card__meta">
        <span>{STATUS_LABELS[item.status]}</span>
        <time dateTime={item.scheduledAt}>{displaySchedule(item)}</time>
      </div>
      <h2>{item.skuName}</h2>
      <div className="xlb-order-center-card__facts">
        <span>{item.quantity} {item.unit}</span>
        <strong>{item.priceText}</strong>
      </div>
      <div className="xlb-order-center-card__footer">
        <small>下单于 {new Intl.DateTimeFormat("zh-CN", {
          month: "numeric",
          day: "numeric",
        }).format(new Date(item.createdAt))}</small>
        <CustomerButton
          variant="secondary"
          aria-label={`查看订单：${item.skuName}`}
          onClick={() => data.actions.onOpenOrder(item.orderId)}
        >
          查看详情
        </CustomerButton>
      </div>
    </article>
  );
}

export function CustomerOrderCenterList(
  data: CustomerOrderCenterComponentProps,
) {
  const { viewModel, actions } = data;
  if (viewModel.items.length === 0) {
    return (
      <div
        className="xlb-order-center-empty"
        data-order-center-component="order-list"
      >
        <CustomerStatePanel
          kind="empty"
          title={`${FILTER_LABELS[viewModel.filter]}暂无订单`}
          description="这里只显示正式订单列表 API 返回的本人订单摘要。"
          actionLabel="刷新"
          onAction={actions.onRefresh}
        />
      </div>
    );
  }

  return (
    <section
      className="xlb-order-center-list"
      data-order-center-component="order-list"
      aria-busy={viewModel.refreshing || viewModel.loadingMore}
    >
      <div className="xlb-order-center-list__heading">
        <div>
          <p>{FILTER_LABELS[viewModel.filter]}</p>
          <h2>我的订单</h2>
        </div>
        <span>已加载 {viewModel.items.length} 笔</span>
      </div>
      <div className="xlb-order-center-list__items">
        {viewModel.items.map((item) => (
          <CustomerOrderCenterCard
            key={item.orderId}
            item={item}
            data={data}
          />
        ))}
      </div>
      {viewModel.nextCursor !== null ? (
        <CustomerButton
          variant="secondary"
          className="xlb-order-center-list__more"
          busy={viewModel.loadingMore}
          disabled={viewModel.refreshing}
          onClick={actions.onLoadMore}
        >
          {viewModel.loadingMore ? "加载中" : "加载更多"}
        </CustomerButton>
      ) : (
        <p className="xlb-order-center-list__end">
          已显示当前分组的全部订单
        </p>
      )}
    </section>
  );
}
