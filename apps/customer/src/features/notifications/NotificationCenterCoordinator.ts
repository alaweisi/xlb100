import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type {
  NotificationInboxItem,
  NotificationInboxView,
  NotificationStateMutationResult,
} from "@xlb/types";
import {
  notificationInboxListResponseSchema,
  notificationStateMutationResponseSchema,
  notificationUnreadCountResponseSchema,
} from "@xlb/validators";

export type CustomerNotificationApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  | "listNotifications"
  | "getNotificationUnreadCount"
  | "markNotificationRead"
  | "setNotificationArchived"
>;

export type NotificationPageLoadResult =
  | {
      readonly status: "ready";
      readonly items: readonly NotificationInboxItem[];
      readonly nextCursor: string | null;
    }
  | {
      readonly status: "error";
      readonly errorCode:
        | "notifications_load_failed"
        | "notifications_response_invalid";
      readonly retryable: boolean;
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.notifications";
      readonly reasonCode:
        | "notifications_api_unavailable"
        | "notifications_forbidden";
    };

export type NotificationUnreadCountResult =
  | {
      readonly status: "ready";
      readonly unreadCount: number;
    }
  | Exclude<NotificationPageLoadResult, { readonly status: "ready" }>;

export type NotificationMutationResult =
  | {
      readonly status: "success";
      readonly receipt: NotificationStateMutationResult;
    }
  | {
      readonly status: "conflict";
      readonly reasonCode: "notification_changed" | "request_in_flight";
    }
  | {
      readonly status: "not_found";
    }
  | {
      readonly status: "unauthenticated";
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.notifications";
    }
  | {
      readonly status: "error";
      readonly errorCode: "notification_update_failed";
      readonly retryable: boolean;
    };

function isRetryable(error: ApiClientError): boolean {
  return error.kind === "network" ||
    error.kind === "timeout" ||
    (error.kind === "http" &&
      (error.status === 408 ||
        error.status === 425 ||
        error.status === 429 ||
        (error.status !== undefined && error.status >= 500)));
}

function readFailure(error: unknown): Exclude<
  NotificationPageLoadResult,
  { readonly status: "ready" }
> {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 401) {
      return Object.freeze({ status: "unauthenticated" });
    }
    if (error.kind === "http" && error.status === 403) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.notifications",
        reasonCode: "notifications_forbidden",
      });
    }
    if (
      error.kind === "http" &&
      (error.status === 404 || error.status === 501 || error.status === 503)
    ) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.notifications",
        reasonCode: "notifications_api_unavailable",
      });
    }
    return Object.freeze({
      status: "error",
      errorCode: error.kind === "response_format"
        ? "notifications_response_invalid"
        : "notifications_load_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "notifications_response_invalid",
    retryable: false,
  });
}

function mutationFailure(error: unknown): NotificationMutationResult {
  if (error instanceof ApiClientError) {
    if (error.kind === "http" && error.status === 401) {
      return Object.freeze({ status: "unauthenticated" });
    }
    if (error.kind === "http" && error.status === 409) {
      return Object.freeze({
        status: "conflict",
        reasonCode: "notification_changed",
      });
    }
    if (
      error.kind === "http" &&
      (error.status === 403 || error.status === 404)
    ) {
      return Object.freeze({ status: "not_found" });
    }
    if (
      error.kind === "http" &&
      (error.status === 501 || error.status === 503)
    ) {
      return Object.freeze({
        status: "unavailable",
        capability: "customer.notifications",
      });
    }
    return Object.freeze({
      status: "error",
      errorCode: "notification_update_failed",
      retryable: isRetryable(error),
    });
  }
  return Object.freeze({
    status: "error",
    errorCode: "notification_update_failed",
    retryable: false,
  });
}

export class NotificationCenterCoordinator {
  readonly #api: CustomerNotificationApi;

  constructor(api: CustomerNotificationApi) {
    this.#api = api;
  }

  async loadPage(
    view: NotificationInboxView,
    cursor: string | null = null,
  ): Promise<NotificationPageLoadResult> {
    try {
      const response = notificationInboxListResponseSchema.parse(
        await this.#api.listNotifications({
          view,
          limit: 20,
          ...(cursor === null ? {} : { cursor }),
        }),
      );
      return Object.freeze({
        status: "ready",
        items: Object.freeze([...response.items]),
        nextCursor: response.nextCursor,
      });
    } catch (error) {
      return readFailure(error);
    }
  }

  async loadUnreadCount(): Promise<NotificationUnreadCountResult> {
    try {
      const response = notificationUnreadCountResponseSchema.parse(
        await this.#api.getNotificationUnreadCount(),
      );
      return Object.freeze({
        status: "ready",
        unreadCount: response.unreadCount,
      });
    } catch (error) {
      return readFailure(error);
    }
  }

  async markRead(
    notificationId: string,
    expectedRowVersion: number,
    idempotencyKey: string,
  ): Promise<NotificationMutationResult> {
    try {
      const response = notificationStateMutationResponseSchema.parse(
        await this.#api.markNotificationRead(notificationId, {
          expectedRowVersion,
          idempotencyKey,
        }),
      );
      return Object.freeze({ status: "success", receipt: response.result });
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async setArchived(
    notificationId: string,
    expectedRowVersion: number,
    idempotencyKey: string,
    archived: boolean,
  ): Promise<NotificationMutationResult> {
    try {
      const response = notificationStateMutationResponseSchema.parse(
        await this.#api.setNotificationArchived(notificationId, {
          expectedRowVersion,
          idempotencyKey,
          archived,
        }),
      );
      return Object.freeze({ status: "success", receipt: response.result });
    } catch (error) {
      return mutationFailure(error);
    }
  }
}
