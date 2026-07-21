import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowClockwise,
  BellSimple,
  CaretRight,
  CheckCircle,
  Clock,
  EnvelopeOpen,
  EnvelopeSimple,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  NotificationArchiveRequest,
  NotificationInboxItem,
  NotificationInboxListQuery,
  NotificationInboxListResponse,
  NotificationMarkReadRequest,
  NotificationStateMutationResponse,
} from "@xlb/types";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  SegmentedControl,
} from "@xlb/ui";
import {
  describeCustomerAppError,
  type CustomerAppFailure,
} from "./customerPageShell";
import "./customer-notifications.css";

export interface CustomerNotificationApi {
  listNotifications(query?: NotificationInboxListQuery): Promise<NotificationInboxListResponse>;
  markNotificationRead(notificationId: string, body: NotificationMarkReadRequest): Promise<NotificationStateMutationResponse>;
  setNotificationArchived(notificationId: string, body: NotificationArchiveRequest): Promise<NotificationStateMutationResponse>;
}

type View = "inbox" | "archive";
type FeedbackTone = "success" | "warning";

interface NotificationFeedback {
  message: string;
  tone: FeedbackTone;
}

interface RowFailure {
  failure: CustomerAppFailure;
  notificationId: string;
}

interface NotificationReferenceAction {
  href: string;
  label: string;
  restoresExactTarget: boolean;
}

function mutationKey(kind: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `notification-${kind}-${suffix}`;
}

function isConflict(error: unknown): boolean {
  return (typeof error === "object" && error !== null && "status" in error && error.status === 409) ||
    (error instanceof Error && /\b409\b/.test(error.message));
}

function displayTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function notificationKindLabel(item: NotificationInboxItem): string {
  return item.reference.kind === "order_created" ? "订单动态" : "客服动态";
}

function referenceAction(item: NotificationInboxItem): NotificationReferenceAction {
  if (item.reference.kind === "order_created") {
    return {
      href: `/customer/orders?orderId=${encodeURIComponent(item.reference.orderId)}`,
      label: "查看订单",
      restoresExactTarget: true,
    };
  }
  return {
    href: "/customer/support",
    label: "前往客服",
    restoresExactTarget: false,
  };
}

function describeNotificationFailure(error: unknown, context: "load" | "update"): CustomerAppFailure {
  const failure = describeCustomerAppError(error);
  if (failure.kind !== "unknown") return failure;
  return {
    ...failure,
    title: context === "load" ? "消息暂时无法加载" : "消息状态更新失败",
    description: context === "load"
      ? "没有读取到服务端最新消息，请稍后重试。"
      : "服务端尚未确认本次更新，当前页面不会假定操作成功。",
  };
}

function successMessage(
  kind: "read" | "archive",
  view: View,
  result: NotificationStateMutationResponse,
): string {
  const alreadyApplied = result.result.outcome === "already_applied";
  if (kind === "read") {
    return alreadyApplied ? "该消息此前已标为已读，现已同步最新状态。" : "已标为已读。";
  }
  if (view === "inbox") {
    return alreadyApplied ? "该消息此前已归档，现已同步最新状态。" : "已归档，可在“已归档”中恢复。";
  }
  return alreadyApplied ? "该消息此前已恢复，现已同步最新状态。" : "已恢复到收件箱。";
}

export function CustomerNotificationsPage({ api }: { api: CustomerNotificationApi }) {
  const [view, setView] = useState<View>("inbox");
  const [items, setItems] = useState<NotificationInboxItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [listError, setListError] = useState<CustomerAppFailure | null>(null);
  const [paginationError, setPaginationError] = useState<CustomerAppFailure | null>(null);
  const [feedback, setFeedback] = useState<NotificationFeedback | null>(null);
  const [rowFailure, setRowFailure] = useState<RowFailure | null>(null);
  const requestSequence = useRef(0);
  const nextCursorRef = useRef<string | null>(null);
  const busyRef = useRef<string | null>(null);

  const load = useCallback(async (reset = true, requestedView: View = view): Promise<boolean> => {
    const sequence = ++requestSequence.current;
    if (reset) {
      nextCursorRef.current = null;
      setNextCursor(null);
      setLoading(true);
      setListError(null);
    } else {
      setLoadingMore(true);
      setPaginationError(null);
    }

    try {
      const result = await api.listNotifications({
        view: requestedView,
        limit: 20,
        ...(reset || !nextCursorRef.current ? {} : { cursor: nextCursorRef.current }),
      });
      if (sequence !== requestSequence.current) return false;
      setItems((current) => reset
        ? result.items
        : [...current, ...result.items.filter((item) =>
          !current.some((existing) => existing.notificationId === item.notificationId))]);
      nextCursorRef.current = result.nextCursor;
      setNextCursor(result.nextCursor);
      return true;
    } catch (caught) {
      if (sequence !== requestSequence.current) return false;
      const failure = describeNotificationFailure(caught, "load");
      if (reset) setListError(failure);
      else setPaginationError(failure);
      return false;
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [api, view]);

  useEffect(() => {
    void load(true, view);
  }, [load, view]);

  const changeView = (next: View) => {
    if (next === view || busyRef.current) return;
    nextCursorRef.current = null;
    setNextCursor(null);
    setItems([]);
    setListError(null);
    setPaginationError(null);
    setFeedback(null);
    setRowFailure(null);
    setView(next);
  };

  const mutate = useCallback(async (item: NotificationInboxItem, kind: "read" | "archive") => {
    if (busyRef.current) return;
    busyRef.current = item.notificationId;
    setBusyId(item.notificationId);
    setFeedback(null);
    setRowFailure(null);
    try {
      const result = kind === "read"
        ? await api.markNotificationRead(item.notificationId, {
          expectedRowVersion: item.rowVersion,
          idempotencyKey: mutationKey("read"),
        })
        : await api.setNotificationArchived(item.notificationId, {
          expectedRowVersion: item.rowVersion,
          idempotencyKey: mutationKey(view === "inbox" ? "archive" : "restore"),
          archived: view === "inbox",
        });
      setFeedback({ message: successMessage(kind, view, result), tone: "success" });
      await load(true, view);
    } catch (caught) {
      if (isConflict(caught)) {
        setFeedback({ message: "消息已在其他设备更新，现已加载服务端最新状态。", tone: "warning" });
        await load(true, view);
      } else {
        setRowFailure({
          failure: describeNotificationFailure(caught, "update"),
          notificationId: item.notificationId,
        });
      }
    } finally {
      busyRef.current = null;
      setBusyId(null);
    }
  }, [api, load, view]);

  const viewLabel = view === "inbox" ? "收件箱" : "已归档";

  return (
    <main aria-labelledby="customer-notifications-title" className="customer-notifications">
      <header className="customer-notifications__topbar">
        <span aria-hidden="true" className="customer-notifications__topbar-icon">
          <BellSimple weight="duotone" />
        </span>
        <div>
          <span className="customer-notifications__eyebrow">喜乐帮通知</span>
          <h1 id="customer-notifications-title">消息中心</h1>
          <p>当前城市与账号的服务进展，集中在这里查看。</p>
        </div>
      </header>
        <section aria-label="消息分类" className="customer-notifications__overview">
          <div className="customer-notifications__overview-copy">
            <span aria-hidden="true" className="customer-notifications__overview-icon">
              {view === "inbox" ? <EnvelopeSimple weight="duotone" /> : <Archive weight="duotone" />}
            </span>
            <div>
              <span>当前列表</span>
              <strong>{viewLabel}</strong>
            </div>
            <span className="customer-notifications__page-count">
              {loading ? "同步中" : `本页 ${items.length} 条`}
            </span>
          </div>
          <SegmentedControl
            activeKey={view}
            aria-label="消息分类"
            className="customer-notifications__tabs"
            items={[
              { key: "inbox", label: "收件箱", disabled: busyId !== null },
              { key: "archive", label: "已归档", disabled: busyId !== null },
            ]}
            onChange={(key) => changeView(key as View)}
            productRole="customer"
          />
          <p className="customer-notifications__authority-note">
            <ShieldCheck aria-hidden="true" weight="duotone" />
            已读、归档和恢复结果均以服务端确认为准。
          </p>
        </section>

        {feedback ? (
          <p className={`customer-notifications__feedback is-${feedback.tone}`} role="status">
            {feedback.tone === "success"
              ? <CheckCircle aria-hidden="true" weight="fill" />
              : <WarningCircle aria-hidden="true" weight="fill" />}
            <span>{feedback.message}</span>
          </p>
        ) : null}

        <section aria-labelledby="customer-notifications-list-title" className="customer-notifications__list-section">
          <header className="customer-notifications__section-heading">
            <div>
              <h2 id="customer-notifications-list-title">{viewLabel}</h2>
              <p>{view === "inbox" ? "未读消息优先显示，处理后仍可追溯。" : "恢复后，消息会重新回到收件箱。"}</p>
            </div>
          </header>

          {loading ? (
            <div className="customer-notifications__loading">
              <LoadingState
                description="正在读取服务端最新消息，请稍候。"
                productRole="customer"
                title="正在加载消息"
              />
              {[0, 1].map((index) => (
                <span aria-hidden="true" className="customer-notifications__skeleton" key={index} />
              ))}
            </div>
          ) : null}

          {!loading && listError ? (
            <ErrorState
              action={(
                <Button onClick={() => void load(true, view)} productRole="customer" variant="secondary">
                  <ArrowClockwise aria-hidden="true" />
                  {listError.retryLabel}
                </Button>
              )}
              description={listError.description}
              productRole="customer"
              title={listError.title}
            />
          ) : null}

          {!loading && !listError && items.length === 0 ? (
            <EmptyState
              action={view === "archive" ? (
                <Button onClick={() => changeView("inbox")} productRole="customer" variant="secondary">
                  返回收件箱
                </Button>
              ) : undefined}
              description={view === "inbox"
                ? "新的订单或客服进展会通过站内通知显示在这里。"
                : "归档过的消息会显示在这里，并可随时恢复。"}
              productRole="customer"
              title={view === "inbox" ? "暂无消息" : "暂无归档消息"}
            />
          ) : null}

          <ol aria-busy={loading || loadingMore} className="customer-notifications__list">
            {items.map((item) => {
              const unread = item.readAt === null;
              const action = referenceAction(item);
              const isBusy = busyId === item.notificationId;
              const itemFailure = rowFailure?.notificationId === item.notificationId ? rowFailure.failure : null;
              return (
                <li key={item.notificationId}>
                  <article
                    aria-label={`${unread ? "未读" : "已读"}消息：${item.title}`}
                    className={`customer-notifications__card${unread ? " is-unread" : ""}`}
                    data-notification-state={unread ? "unread" : "read"}
                  >
                    <div className="customer-notifications__card-header">
                      <div className="customer-notifications__kind">
                        <span aria-hidden="true">
                          {unread ? <EnvelopeSimple weight="duotone" /> : <EnvelopeOpen weight="duotone" />}
                        </span>
                        <span>{notificationKindLabel(item)}</span>
                      </div>
                      <span className={`customer-notifications__status${unread ? " is-unread" : " is-read"}`}>
                        <span aria-hidden="true" />
                        {unread ? "未读" : "已读"}
                      </span>
                    </div>

                    <div className="customer-notifications__message">
                      <h3>{item.title}</h3>
                      <p>{item.body}</p>
                    </div>

                    <time className="customer-notifications__time" dateTime={item.occurredAt}>
                      <Clock aria-hidden="true" />
                      {displayTime(item.occurredAt)}
                    </time>

                    {itemFailure ? (
                      <div className="customer-notifications__row-error" role="alert">
                        <WarningCircle aria-hidden="true" weight="fill" />
                        <div>
                          <strong>{itemFailure.title}</strong>
                          <span>{itemFailure.description}</span>
                        </div>
                      </div>
                    ) : null}

                    <div className="customer-notifications__actions">
                      <div className="customer-notifications__state-actions">
                        {unread ? (
                          <Button
                            disabled={busyId !== null}
                            onClick={() => void mutate(item, "read")}
                            productRole="customer"
                            variant="secondary"
                          >
                            {isBusy ? <ArrowClockwise aria-hidden="true" className="customer-notifications__spin" /> : <CheckCircle aria-hidden="true" />}
                            {isBusy ? "正在更新" : "标为已读"}
                          </Button>
                        ) : null}
                        <Button
                          disabled={busyId !== null}
                          onClick={() => void mutate(item, "archive")}
                          productRole="customer"
                          variant="ghost"
                        >
                          <Archive aria-hidden="true" />
                          {view === "inbox" ? "归档" : "恢复"}
                        </Button>
                      </div>
                      <a
                        className="customer-notifications__target-link"
                        data-target-resolution={action.restoresExactTarget ? "exact" : "section"}
                        href={action.href}
                      >
                        {action.label}
                        <CaretRight aria-hidden="true" />
                      </a>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>

          {paginationError ? (
            <ErrorState
              action={(
                <Button onClick={() => void load(false, view)} productRole="customer" variant="secondary">
                  <ArrowClockwise aria-hidden="true" />
                  重新加载更多
                </Button>
              )}
              className="customer-notifications__pagination-error"
              description="已加载的消息会继续保留，不会因本次失败而清空。"
              productRole="customer"
              title="更多消息暂时未加载"
            />
          ) : null}

          {nextCursor && !paginationError ? (
            <Button
              className="customer-notifications__load-more"
              disabled={loadingMore || busyId !== null}
              onClick={() => void load(false, view)}
              productRole="customer"
              variant="secondary"
            >
              {loadingMore ? <ArrowClockwise aria-hidden="true" className="customer-notifications__spin" /> : null}
              {loadingMore ? "正在加载" : "加载更多"}
            </Button>
          ) : null}
        </section>
    </main>
  );
}
