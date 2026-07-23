import {
  BrandLogo,
  CustomerButton,
  CustomerStatePanel,
} from "@xlb/customer-components";
import type {
  NotificationInboxItem,
  NotificationInboxView,
} from "@xlb/types";
import { notificationReferenceRoute } from "./NotificationCenterActionController.js";
import type {
  CustomerNotificationTemplateReadyData,
  NotificationOperationKind,
} from "./notificationCenterTypes.js";

export type CustomerNotificationComponentProps =
  CustomerNotificationTemplateReadyData;

function displayTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间不可用";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function operationLabel(kind: NotificationOperationKind): string {
  switch (kind) {
    case "marking-read":
      return "正在标记已读";
    case "archiving":
      return "正在归档";
    case "restoring":
      return "正在恢复";
  }
}

function viewLabel(view: NotificationInboxView): string {
  return view === "inbox" ? "收件箱" : "已归档";
}

export function NotificationBoundaryHeader() {
  return (
    <header
      className="xlb-notifications-header xlb-notifications-header--boundary"
      data-notification-component="header"
    >
      <BrandLogo variant="compact" />
      <div>
        <p>业务进展与客服回执</p>
        <h1>通知中心</h1>
      </div>
    </header>
  );
}

export function NotificationHeader({
  viewModel,
  actions,
}: CustomerNotificationComponentProps) {
  return (
    <header
      className="xlb-notifications-header"
      data-notification-component="header"
    >
      <button
        type="button"
        className="xlb-notifications-header__back"
        onClick={actions.onBack}
        aria-label="返回上一页"
      >
        返回
      </button>
      <div className="xlb-notifications-header__copy">
        <BrandLogo variant="compact" />
        <h1>通知中心</h1>
      </div>
      <CustomerButton
        variant="quiet"
        className="xlb-notifications-header__refresh"
        busy={viewModel.refreshing}
        disabled={viewModel.operation !== null || viewModel.loadingMore}
        onClick={actions.onRefresh}
      >
        {viewModel.refreshing ? "刷新中" : "刷新"}
      </CustomerButton>
    </header>
  );
}

export function NotificationViewTabs({
  viewModel,
  actions,
}: CustomerNotificationComponentProps) {
  const disabled = viewModel.operation !== null ||
    viewModel.loadingMore ||
    viewModel.refreshing;
  return (
    <section
      className="xlb-notifications-overview"
      data-notification-component="view-tabs"
    >
      <div>
        <p>由服务端确认的未读通知</p>
        <strong>
          {viewModel.unreadCount === null ? "—" : viewModel.unreadCount}
        </strong>
        {viewModel.unreadCountUnavailable
          ? <span>未读数暂不可用</span>
          : <span>条未读</span>}
      </div>
      <div
        className="xlb-notifications-tabs"
        role="tablist"
        aria-label="通知视图"
      >
        {(["inbox", "archive"] as const).map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={viewModel.view === view}
            disabled={disabled}
            onClick={() => actions.onSelectView(view)}
          >
            {viewLabel(view)}
          </button>
        ))}
      </div>
    </section>
  );
}

export function NotificationFeedback({
  viewModel,
  actions,
}: CustomerNotificationComponentProps) {
  if (viewModel.notice === null) return null;
  return (
    <div
      className="xlb-notifications-feedback"
      data-kind={viewModel.notice.kind}
      data-notification-component="feedback"
      role={viewModel.notice.kind === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <span>{viewModel.notice.message}</span>
      <button type="button" onClick={actions.onDismissNotice}>关闭</button>
    </div>
  );
}

function eventLabel(item: NotificationInboxItem): string {
  return item.eventType === "order.created"
    ? "订单已创建"
    : "客服工单已解决";
}

function NotificationItemCard({
  item,
  data,
}: {
  readonly item: NotificationInboxItem;
  readonly data: CustomerNotificationTemplateReadyData;
}) {
  const { viewModel, actions } = data;
  const unread = item.readAt === null;
  const operation = viewModel.operation?.notificationId === item.notificationId
    ? viewModel.operation
    : null;
  const hasSafeReference = notificationReferenceRoute(item) !== null;
  const allActionsDisabled = viewModel.operation !== null ||
    viewModel.refreshing ||
    viewModel.loadingMore;

  return (
    <article
      className="xlb-notification-card"
      data-unread={unread}
      aria-label={`${unread ? "未读" : "已读"}通知：${item.title}`}
    >
      <div className="xlb-notification-card__meta">
        <span>{eventLabel(item)}</span>
        <time dateTime={item.occurredAt}>{displayTime(item.occurredAt)}</time>
      </div>
      <h2>{item.title}</h2>
      <p>{item.body}</p>
      <div className="xlb-notification-card__state">
        <span>{unread ? "未读" : "已读"}</span>
        {operation ? <strong role="status">{operationLabel(operation.kind)}</strong> : null}
      </div>
      <div className="xlb-notification-card__actions">
        {unread ? (
          <CustomerButton
            variant="secondary"
            busy={operation?.kind === "marking-read"}
            disabled={allActionsDisabled}
            onClick={() => actions.onMarkRead(item)}
          >
            {operation?.kind === "marking-read" ? "标记中" : "标为已读"}
          </CustomerButton>
        ) : null}
        <CustomerButton
          variant="secondary"
          busy={operation?.kind === "archiving" || operation?.kind === "restoring"}
          disabled={allActionsDisabled}
          onClick={() => actions.onSetArchived(
            item,
            viewModel.view === "inbox",
          )}
        >
          {operation?.kind === "archiving"
            ? "归档中"
            : operation?.kind === "restoring"
              ? "恢复中"
              : viewModel.view === "inbox" ? "归档" : "恢复"}
        </CustomerButton>
        <CustomerButton
          variant="quiet"
          disabled={allActionsDisabled}
          aria-label={hasSafeReference ? `查看：${item.title}` : `无法跳转：${item.title}`}
          onClick={() => actions.onOpenReference(item)}
        >
          查看详情
        </CustomerButton>
      </div>
    </article>
  );
}

export function NotificationList(data: CustomerNotificationComponentProps) {
  const { viewModel, actions } = data;
  if (viewModel.items.length === 0) {
    return (
      <div
        className="xlb-notifications-empty"
        data-notification-component="notification-list"
      >
        <CustomerStatePanel
          kind="empty"
          title={viewModel.view === "inbox" ? "暂时没有通知" : "还没有已归档通知"}
          description={viewModel.view === "inbox"
            ? "订单创建或客服工单解决后，正式通知会显示在这里。"
            : "归档后的正式通知会显示在这里。"}
          actionLabel="刷新"
          onAction={actions.onRefresh}
        />
      </div>
    );
  }

  return (
    <section
      className="xlb-notifications-list"
      data-notification-component="notification-list"
      aria-busy={viewModel.loadingMore || viewModel.refreshing}
    >
      <div className="xlb-notifications-list__heading">
        <div>
          <p>{viewLabel(viewModel.view)}</p>
          <h2>{viewModel.view === "inbox" ? "最新通知" : "已归档通知"}</h2>
        </div>
        <span>{viewModel.items.length} 条</span>
      </div>
      <div className="xlb-notifications-list__items">
        {viewModel.items.map((item) => (
          <NotificationItemCard
            key={item.notificationId}
            item={item}
            data={data}
          />
        ))}
      </div>
      {viewModel.nextCursor !== null ? (
        <CustomerButton
          variant="secondary"
          className="xlb-notifications-list__more"
          busy={viewModel.loadingMore}
          disabled={viewModel.operation !== null || viewModel.refreshing}
          onClick={actions.onLoadMore}
        >
          {viewModel.loadingMore ? "加载中" : "加载更多"}
        </CustomerButton>
      ) : (
        <p className="xlb-notifications-list__end">已显示当前视图的全部通知</p>
      )}
    </section>
  );
}
