import type {
  NotificationArchiveRequest,
  NotificationInboxItem,
  NotificationInboxListQuery,
  NotificationInboxListResponse,
  NotificationMarkReadRequest,
  NotificationStateMutationResponse,
  NotificationUnreadCountResponse,
} from "@xlb/types";
import type { ApiClient } from "./createApiClient.js";

type JsonObject = Record<string, unknown>;
type NotificationApiApp = "customer" | "worker";

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as JsonObject;
}

function exact(value: JsonObject, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an invalid field set`);
  }
}

function string(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max) {
    throw new TypeError(`${label} must be a bounded non-empty string`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  const parsed = string(value, label, 64);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(parsed) || !Number.isFinite(Date.parse(parsed))) {
    throw new TypeError(`${label} must be a timezone-aware timestamp`);
  }
  return parsed;
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value;
}

function cursor(value: unknown, label: string): string {
  const parsed = string(value, label, 512);
  if (!/^[A-Za-z0-9_-]+$/.test(parsed)) throw new TypeError(`${label} must be opaque base64url`);
  return parsed;
}

function validateReference(
  value: unknown,
  eventType: "order.created" | "support.ticket.resolved",
): NotificationInboxItem["reference"] {
  const reference = object(value, "notification.reference");
  if (eventType === "order.created") {
    exact(reference, ["kind", "orderId"], "notification.reference");
    if (reference.kind !== "order_created") throw new TypeError("notification reference kind mismatch");
    string(reference.orderId, "notification.reference.orderId", 128);
  } else {
    exact(reference, ["kind", "ticketId"], "notification.reference");
    if (reference.kind !== "support_ticket_resolved") throw new TypeError("notification reference kind mismatch");
    string(reference.ticketId, "notification.reference.ticketId", 128);
  }
  return reference as unknown as NotificationInboxItem["reference"];
}

function validateItem(value: unknown): NotificationInboxItem {
  const item = object(value, "notification");
  exact(item, [
    "notificationId", "eventType", "templateRevisionId", "title", "body", "reference",
    "occurredAt", "createdAt", "readAt", "archivedAt", "rowVersion",
  ], "notification");
  const eventType = item.eventType;
  if (eventType !== "order.created" && eventType !== "support.ticket.resolved") {
    throw new TypeError("notification.eventType is unsupported");
  }
  string(item.notificationId, "notification.notificationId", 128);
  string(item.templateRevisionId, "notification.templateRevisionId", 128);
  string(item.title, "notification.title", 255);
  string(item.body, "notification.body", 2_000);
  validateReference(item.reference, eventType);
  timestamp(item.occurredAt, "notification.occurredAt");
  timestamp(item.createdAt, "notification.createdAt");
  nullableTimestamp(item.readAt, "notification.readAt");
  nullableTimestamp(item.archivedAt, "notification.archivedAt");
  positiveInteger(item.rowVersion, "notification.rowVersion");
  return item as unknown as NotificationInboxItem;
}

export function validateNotificationInboxListResponse(value: unknown): NotificationInboxListResponse {
  const response = object(value, "notification list response");
  exact(response, ["ok", "items", "nextCursor"], "notification list response");
  if (response.ok !== true) throw new TypeError("notification list response.ok must be true");
  if (!Array.isArray(response.items) || response.items.length > 100) {
    throw new TypeError("notification list response.items must be a bounded array");
  }
  response.items.forEach(validateItem);
  if (response.nextCursor !== null) cursor(response.nextCursor, "notification list response.nextCursor");
  return response as unknown as NotificationInboxListResponse;
}

export function validateNotificationUnreadCountResponse(value: unknown): NotificationUnreadCountResponse {
  const response = object(value, "notification unread response");
  exact(response, ["ok", "unreadCount"], "notification unread response");
  if (response.ok !== true) throw new TypeError("notification unread response.ok must be true");
  if (typeof response.unreadCount !== "number" ||
      !Number.isSafeInteger(response.unreadCount) || response.unreadCount < 0) {
    throw new TypeError("notification unread count must be a non-negative integer");
  }
  return response as unknown as NotificationUnreadCountResponse;
}

export function validateNotificationStateMutationResponse(value: unknown): NotificationStateMutationResponse {
  const response = object(value, "notification mutation response");
  exact(response, ["ok", "result"], "notification mutation response");
  if (response.ok !== true) throw new TypeError("notification mutation response.ok must be true");
  const result = object(response.result, "notification mutation response.result");
  exact(result, ["outcome", "rowVersion"], "notification mutation response.result");
  if (result.outcome !== "applied" && result.outcome !== "already_applied") {
    throw new TypeError("notification mutation outcome is unsupported");
  }
  positiveInteger(result.rowVersion, "notification mutation response.result.rowVersion");
  return response as unknown as NotificationStateMutationResponse;
}

function listPath(base: string, query: NotificationInboxListQuery): string {
  const params = new URLSearchParams();
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.view !== undefined) params.set("view", query.view);
  const encoded = params.toString();
  return encoded ? `${base}?${encoded}` : base;
}

export function createNotificationApi(client: ApiClient, app: NotificationApiApp) {
  const base = `/api/${app}/notifications`;
  return {
    listNotifications(query: NotificationInboxListQuery = {}): Promise<NotificationInboxListResponse> {
      return client.get(listPath(base, query), { validate: validateNotificationInboxListResponse });
    },
    getNotificationUnreadCount(): Promise<NotificationUnreadCountResponse> {
      return client.get(`${base}/unread-count`, { validate: validateNotificationUnreadCountResponse });
    },
    markNotificationRead(
      notificationId: string,
      body: NotificationMarkReadRequest,
    ): Promise<NotificationStateMutationResponse> {
      return client.post(
        `${base}/${encodeURIComponent(notificationId)}/read`,
        body,
        { retry: "idempotent", validate: validateNotificationStateMutationResponse },
      );
    },
    setNotificationArchived(
      notificationId: string,
      body: NotificationArchiveRequest,
    ): Promise<NotificationStateMutationResponse> {
      return client.post(
        `${base}/${encodeURIComponent(notificationId)}/archive`,
        body,
        { retry: "idempotent", validate: validateNotificationStateMutationResponse },
      );
    },
  };
}
