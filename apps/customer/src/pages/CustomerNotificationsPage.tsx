import { useCallback, useEffect, useRef, useState } from "react";
import type {
  NotificationArchiveRequest,
  NotificationInboxItem,
  NotificationInboxListQuery,
  NotificationInboxListResponse,
  NotificationMarkReadRequest,
  NotificationStateMutationResponse,
} from "@xlb/types";
import { Button, Card, EmptyState, LoadingState, StatusTag } from "@xlb/ui";
import { CustomerRouteShell } from "./customerPageShell";

export interface CustomerNotificationApi {
  listNotifications(query?: NotificationInboxListQuery): Promise<NotificationInboxListResponse>;
  markNotificationRead(notificationId: string, body: NotificationMarkReadRequest): Promise<NotificationStateMutationResponse>;
  setNotificationArchived(notificationId: string, body: NotificationArchiveRequest): Promise<NotificationStateMutationResponse>;
}

type View = "inbox" | "archive";

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
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value;
}

function referenceHref(item: NotificationInboxItem): string | null {
  return item.reference.kind === "order_created"
    ? `/customer/orders?orderId=${encodeURIComponent(item.reference.orderId)}`
    : null;
}

export function CustomerNotificationsPage({ api }: { api: CustomerNotificationApi }) {
  const [view, setView] = useState<View>("inbox");
  const [items, setItems] = useState<NotificationInboxItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const nextCursorRef = useRef<string | null>(null);
  const busyRef = useRef<string | null>(null);

  const load = useCallback(async (reset = true, requestedView: View = view) => {
    const sequence = ++requestSequence.current;
    if (reset) {
      nextCursorRef.current = null;
      setNextCursor(null);
    }
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const result = await api.listNotifications({
        view: requestedView,
        limit: 20,
        ...(reset || !nextCursorRef.current ? {} : { cursor: nextCursorRef.current }),
      });
      if (sequence !== requestSequence.current) return;
      setItems((current) => reset
        ? result.items
        : [...current, ...result.items.filter((item) => !current.some((existing) => existing.notificationId === item.notificationId))]);
      nextCursorRef.current = result.nextCursor;
      setNextCursor(result.nextCursor);
    } catch {
      if (sequence !== requestSequence.current) return;
      setError("消息暂时无法加载，请稍后重试");
      if (reset) setItems([]);
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [api, view]);

  useEffect(() => { void load(true, view); }, [load, view]);

  const changeView = (next: View) => {
    if (next === view || busyRef.current) return;
    nextCursorRef.current = null;
    setNextCursor(null);
    setItems([]);
    setView(next);
  };

  const mutate = useCallback(async (item: NotificationInboxItem, kind: "read" | "archive") => {
    if (busyRef.current) return;
    busyRef.current = item.notificationId;
    setBusyId(item.notificationId);
    setError(null);
    setNotice(null);
    try {
      if (kind === "read") {
        await api.markNotificationRead(item.notificationId, {
          expectedRowVersion: item.rowVersion,
          idempotencyKey: mutationKey("read"),
        });
      } else {
        await api.setNotificationArchived(item.notificationId, {
          expectedRowVersion: item.rowVersion,
          idempotencyKey: mutationKey(view === "inbox" ? "archive" : "restore"),
          archived: view === "inbox",
        });
      }
      setNotice(kind === "read" ? "消息已标记为已读。" : view === "inbox" ? "消息已归档。" : "消息已恢复到收件箱。" );
      await load(true, view);
    } catch (caught) {
      if (isConflict(caught)) {
        setNotice("消息已在其他设备更新，当前页面已同步最新状态。" );
        await load(true, view);
      } else {
        setError("消息暂时无法更新，请稍后重试");
      }
    } finally {
      busyRef.current = null;
      setBusyId(null);
    }
  }, [api, load, view]);

  return (
    <CustomerRouteShell currentRoute="notifications">
      <Card title="通知" actions={<StatusTag tone="success">实时同步</StatusTag>}>
        <p className="notification-notice">仅显示当前城市、当前账号的站内消息。</p>
        <div role="tablist" aria-label="消息范围" className="notification-view-tabs">
          <Button disabled={busyId !== null} aria-pressed={view === "inbox"} variant={view === "inbox" ? "primary" : undefined} onClick={() => changeView("inbox")}>收件箱</Button>
          <Button disabled={busyId !== null} aria-pressed={view === "archive"} variant={view === "archive" ? "primary" : undefined} onClick={() => changeView("archive")}>已归档</Button>
        </div>

        {loading ? <LoadingState title="正在加载消息" /> : null}
        {error ? <div role="alert" className="notification-error"><span>{error}</span><Button onClick={() => void load(true, view)}>重试</Button></div> : null}
        {!loading && !error && items.length === 0 ? <EmptyState title={view === "inbox" ? "暂无消息" : "暂无归档消息"} description="新消息会通过真实通知 API 显示在这里。" /> : null}

        <div aria-busy={loading || loadingMore} className="notification-list">
          {items.map((item) => {
            const unread = item.readAt === null;
            const href = referenceHref(item);
            return (
              <article
                key={item.notificationId}
                aria-label={`${unread ? "未读" : "已读"}消息：${item.title}`}
                className={`notification-card${unread ? " notification-card-unread" : ""}`}
              >
                <div className="notification-card-header">
                  <strong>{item.title}</strong>
                  <StatusTag tone={unread ? "primary" : "success"}>{unread ? "未读" : "已读"}</StatusTag>
                </div>
                <p className="notification-body">{item.body}</p>
                <time dateTime={item.occurredAt} className="notification-time">{displayTime(item.occurredAt)}</time>
                <div className="notification-actions">
                  {unread ? <Button disabled={busyId === item.notificationId} onClick={() => void mutate(item, "read")}>标为已读</Button> : null}
                  <Button disabled={busyId === item.notificationId} onClick={() => void mutate(item, "archive")}>{view === "inbox" ? "归档" : "恢复"}</Button>
                  {href ? <a href={href} className="notification-link">查看订单</a> : null}
                </div>
              </article>
            );
          })}
        </div>

        {nextCursor ? <Button disabled={loadingMore} onClick={() => void load(false, view)}>{loadingMore ? "加载中…" : "加载更多"}</Button> : null}
        {notice ? <p role="status" className="notification-notice">{notice}</p> : null}
      </Card>
    </CustomerRouteShell>
  );
}
