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
import { formatWorkerApiError } from "../app/workerFeedback";
import { uiChoice, uiStateIs } from "./pageShared";
import "./worker-notifications.css";

export interface WorkerNotificationApi {
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

export function WorkerNotificationsPage({ api, networkOnline = true }: { api: WorkerNotificationApi; networkOnline?: boolean }) {
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
    } catch (caught) {
      if (sequence !== requestSequence.current) return;
      setError(formatWorkerApiError(caught, "消息加载失败，请稍后重试。"));
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
        const response = await api.markNotificationRead(item.notificationId, {
          expectedRowVersion: item.rowVersion,
          idempotencyKey: mutationKey("read"),
        });
        setNotice(response.result.outcome === "already_applied" ? "重复操作已安全处理，该消息此前已读。" : "消息已标记为已读。");
      } else {
        const response = await api.setNotificationArchived(item.notificationId, {
          expectedRowVersion: item.rowVersion,
          idempotencyKey: mutationKey(view === "inbox" ? "archive" : "restore"),
          archived: view === "inbox",
        });
        setNotice(response.result.outcome === "already_applied" ? "重复操作已安全处理，消息状态无需再次变更。" : view === "inbox" ? "消息已归档。" : "消息已恢复到收件箱。");
      }
      await load(true, view);
    } catch (caught) {
      if (isConflict(caught)) {
        setNotice("消息已在其他设备变更，已重新加载最新状态。");
        await load(true, view);
      } else {
        setError(formatWorkerApiError(caught, "消息状态未更新，请刷新确认后重试。", "mutation"));
      }
    } finally {
      busyRef.current = null;
      setBusyId(null);
    }
  }, [api, load, view]);

  return (
    <Card title="消息中心" actions={<StatusTag tone={networkOnline ? "success" : "danger"}>{networkOnline ? "已连接" : "已离线"}</StatusTag>} className="worker-notification-panel">
      {!networkOnline && <div className="worker-state-banner worker-state-banner--danger" role="status"><strong>当前网络已断开</strong><span>消息状态操作已关闭；恢复网络后刷新最新状态。</span></div>}
      <div role="tablist" aria-label="消息视图" className="notification-view-tabs">
        <Button disabled={busyId !== null} aria-pressed={view === "inbox"} variant={view === "inbox" ? "primary" : undefined} onClick={() => changeView("inbox")}>收件箱</Button>
        <Button disabled={busyId !== null} aria-pressed={view === "archive"} variant={view === "archive" ? "primary" : undefined} onClick={() => changeView("archive")}>已归档</Button>
      </div>

      {loading ? <LoadingState title="正在加载消息" /> : null}
      {error ? <div role="alert" className="notification-error"><span>{error}</span><Button disabled={!networkOnline} onClick={() => void load(true, view)}>重试</Button></div> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title={uiChoice(uiStateIs(view, "inbox"), "暂无消息", "暂无归档消息")} description="平台发送给当前师傅的业务消息会显示在这里。" /> : null}

      <div aria-busy={loading || loadingMore} className="notification-list">
        {items.map((item) => {
          const unread = item.readAt === null;
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
                {unread ? <Button disabled={!networkOnline || busyId === item.notificationId} onClick={() => void mutate(item, "read")}>标记已读</Button> : null}
                <Button disabled={!networkOnline || busyId === item.notificationId} onClick={() => void mutate(item, "archive")}>{uiChoice(uiStateIs(view, "inbox"), "归档", "恢复")}</Button>
              </div>
            </article>
          );
        })}
      </div>

      {nextCursor ? <Button disabled={loadingMore || !networkOnline} onClick={() => void load(false, view)}>{loadingMore ? "正在加载" : "加载更多"}</Button> : null}
      {notice ? <p role="status" className="notification-notice">{notice}</p> : null}
    </Card>
  );
}
