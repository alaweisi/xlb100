import type {
  NotificationInboxItem,
  NotificationInboxView,
} from "@xlb/types";
import {
  notificationArchiveRequestSchema,
  notificationInboxItemSchema,
  notificationMarkReadRequestSchema,
} from "@xlb/validators";
import {
  NotificationCenterCoordinator,
  type NotificationMutationResult,
} from "./NotificationCenterCoordinator.js";

const SAFE_REFERENCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export interface CustomerNotificationNavigation {
  back(): void;
  showView(view: NotificationInboxView): void;
  openRoute(route: `/orders/${string}` | `/support/tickets/${string}`): void;
}

export interface CustomerNotificationActionScope {
  readonly rowVersions: ReadonlyMap<string, number>;
}

export type NotificationReferenceResult =
  | {
      readonly status: "navigated";
      readonly route: `/orders/${string}` | `/support/tickets/${string}`;
    }
  | {
      readonly status: "rejected";
      readonly reasonCode: "unknown_reference" | "invalid_reference_id";
    };

export function createNotificationIdempotencyKey(
  action: "read" | "archive" | "restore",
): string {
  const suffix = typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `customer-notification-${action}-${suffix}`;
}

export function notificationReferenceRoute(
  item: NotificationInboxItem,
): `/orders/${string}` | `/support/tickets/${string}` | null {
  if (
    item.eventType === "order.created" &&
    item.reference.kind === "order_created" &&
    SAFE_REFERENCE_ID.test(item.reference.orderId)
  ) {
    return `/orders/${item.reference.orderId}`;
  }
  if (
    item.eventType === "support.ticket.resolved" &&
    item.reference.kind === "support_ticket_resolved" &&
    SAFE_REFERENCE_ID.test(item.reference.ticketId)
  ) {
    return `/support/tickets/${item.reference.ticketId}`;
  }
  return null;
}

function hasCurrentItem(
  item: NotificationInboxItem,
  scope: CustomerNotificationActionScope,
): boolean {
  return scope.rowVersions.get(item.notificationId) === item.rowVersion;
}

export class NotificationCenterActionController {
  readonly #coordinator: NotificationCenterCoordinator;
  readonly #navigation: CustomerNotificationNavigation;
  #operationInFlight = false;

  constructor(
    coordinator: NotificationCenterCoordinator,
    navigation: CustomerNotificationNavigation,
  ) {
    this.#coordinator = coordinator;
    this.#navigation = navigation;
  }

  back(): void {
    this.#navigation.back();
  }

  showView(view: NotificationInboxView): void {
    this.#navigation.showView(view);
  }

  openReference(item: NotificationInboxItem): NotificationReferenceResult {
    const parsed = notificationInboxItemSchema.safeParse(item);
    if (!parsed.success) {
      return Object.freeze({
        status: "rejected",
        reasonCode: "unknown_reference",
      });
    }
    const route = notificationReferenceRoute(parsed.data);
    if (route === null) {
      return Object.freeze({
        status: "rejected",
        reasonCode: "invalid_reference_id",
      });
    }
    this.#navigation.openRoute(route);
    return Object.freeze({ status: "navigated", route });
  }

  async markRead(
    item: NotificationInboxItem,
    scope: CustomerNotificationActionScope,
  ): Promise<NotificationMutationResult> {
    if (!hasCurrentItem(item, scope)) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "notification_changed",
      });
    }
    if (this.#operationInFlight) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "request_in_flight",
      });
    }
    const request = notificationMarkReadRequestSchema.safeParse({
      expectedRowVersion: item.rowVersion,
      idempotencyKey: createNotificationIdempotencyKey("read"),
    });
    if (!request.success) {
      return Object.freeze({
        status: "error",
        errorCode: "notification_update_failed",
        retryable: false,
      });
    }

    this.#operationInFlight = true;
    try {
      return await this.#coordinator.markRead(
        item.notificationId,
        request.data.expectedRowVersion,
        request.data.idempotencyKey,
      );
    } finally {
      this.#operationInFlight = false;
    }
  }

  async setArchived(
    item: NotificationInboxItem,
    archived: boolean,
    scope: CustomerNotificationActionScope,
  ): Promise<NotificationMutationResult> {
    if (!hasCurrentItem(item, scope)) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "notification_changed",
      });
    }
    if (this.#operationInFlight) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "request_in_flight",
      });
    }
    const request = notificationArchiveRequestSchema.safeParse({
      expectedRowVersion: item.rowVersion,
      idempotencyKey: createNotificationIdempotencyKey(
        archived ? "archive" : "restore",
      ),
      archived,
    });
    if (!request.success) {
      return Object.freeze({
        status: "error",
        errorCode: "notification_update_failed",
        retryable: false,
      });
    }

    this.#operationInFlight = true;
    try {
      return await this.#coordinator.setArchived(
        item.notificationId,
        request.data.expectedRowVersion,
        request.data.idempotencyKey,
        request.data.archived,
      );
    } finally {
      this.#operationInFlight = false;
    }
  }
}
