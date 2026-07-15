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

export function WorkerNotificationsPage({ api }: { api: WorkerNotificationApi }) {
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
      setError(caught instanceof Error ? caught.message : "Unable to load notifications");
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
      setNotice(kind === "read" ? "Notification marked as read." : view === "inbox" ? "Notification archived." : "Notification restored.");
      await load(true, view);
    } catch (caught) {
      if (isConflict(caught)) {
        setNotice("Notification changed on another device. Latest state reloaded.");
        await load(true, view);
      } else {
        setError(caught instanceof Error ? caught.message : "Unable to update notification");
      }
    } finally {
      busyRef.current = null;
      setBusyId(null);
    }
  }, [api, load, view]);

  return (
    <Card title="Notifications" actions={<StatusTag tone="success">Real API</StatusTag>} className="worker-notification-panel">
      <div role="tablist" aria-label="Notification view" className="notification-view-tabs">
        <Button disabled={busyId !== null} aria-pressed={view === "inbox"} variant={view === "inbox" ? "primary" : undefined} onClick={() => changeView("inbox")}>Inbox</Button>
        <Button disabled={busyId !== null} aria-pressed={view === "archive"} variant={view === "archive" ? "primary" : undefined} onClick={() => changeView("archive")}>Archive</Button>
      </div>

      {loading ? <LoadingState title="Loading notifications" /> : null}
      {error ? <div role="alert" className="notification-error"><span>{error}</span><Button onClick={() => void load(true, view)}>Retry</Button></div> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title={view === "inbox" ? "No notifications" : "No archived notifications"} description="Real notification API results will appear here." /> : null}

      <div aria-busy={loading || loadingMore} className="notification-list">
        {items.map((item) => {
          const unread = item.readAt === null;
          return (
            <article
              key={item.notificationId}
              aria-label={`${unread ? "Unread" : "Read"} notification: ${item.title}`}
              className={`notification-card${unread ? " notification-card-unread" : ""}`}
            >
              <div className="notification-card-header">
                <strong>{item.title}</strong>
                <StatusTag tone={unread ? "primary" : "success"}>{unread ? "Unread" : "Read"}</StatusTag>
              </div>
              <p className="notification-body">{item.body}</p>
              <time dateTime={item.occurredAt} className="notification-time">{displayTime(item.occurredAt)}</time>
              <div className="notification-actions">
                {unread ? <Button disabled={busyId === item.notificationId} onClick={() => void mutate(item, "read")}>Mark as read</Button> : null}
                <Button disabled={busyId === item.notificationId} onClick={() => void mutate(item, "archive")}>{view === "inbox" ? "Archive" : "Restore"}</Button>
              </div>
            </article>
          );
        })}
      </div>

      {nextCursor ? <Button disabled={loadingMore} onClick={() => void load(false, view)}>{loadingMore ? "Loading…" : "Load more"}</Button> : null}
      {notice ? <p role="status" className="notification-notice">{notice}</p> : null}
    </Card>
  );
}
