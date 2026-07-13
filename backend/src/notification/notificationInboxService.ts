import type {
  NotificationInboxListResponse,
  NotificationStateMutationResponse,
  NotificationUnreadCountResponse,
  RequestContext,
} from "@xlb/types";
import {
  notificationArchiveRequestSchema,
  notificationInboxListResponseSchema,
  notificationMarkReadRequestSchema,
  notificationStateMutationResponseSchema,
  notificationUnreadCountResponseSchema,
} from "@xlb/validators";
import {
  decodeNotificationInboxCursor,
  encodeNotificationInboxCursor,
  fingerprintNotificationStateRequest,
  hashNotificationIdempotencyKey,
  NotificationInboxForbiddenError,
  type NotificationInboxAppType,
  NotificationInboxValidationError,
  parseNotificationInboxListQuery,
  requireNotificationInboxScope,
} from "./notificationInboxPolicy.js";
import {
  notificationInboxRepository,
  NotificationInboxRepository,
  type NotificationStateAction,
} from "./notificationInboxRepository.js";

export class NotificationInboxNotFoundError extends Error {
  readonly statusCode = 404;

  constructor() {
    super("notification not found");
    this.name = "NotificationInboxNotFoundError";
  }
}

export class NotificationInboxConflictError extends Error {
  readonly statusCode = 409;

  constructor() {
    super("notification state conflict");
    this.name = "NotificationInboxConflictError";
  }
}

function notificationId(input: unknown): string {
  if (typeof input !== "string") throw new NotificationInboxValidationError();
  const value = input.trim();
  if (value.length < 1 || value.length > 128) throw new NotificationInboxValidationError();
  return value;
}

export class NotificationInboxService {
  constructor(private readonly repository: NotificationInboxRepository = notificationInboxRepository) {}

  async list(
    context: RequestContext,
    appType: NotificationInboxAppType,
    queryInput: unknown,
  ): Promise<NotificationInboxListResponse> {
    const scope = requireNotificationInboxScope(context, appType);
    const query = parseNotificationInboxListQuery(queryInput);
    const cursor = decodeNotificationInboxCursor(query.cursor, scope, query.view);
    const rows = await this.repository.list(scope, query.view, query.limit + 1, cursor);
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    const response: NotificationInboxListResponse = {
      ok: true,
      items,
      nextCursor: rows.length > query.limit && last
        ? encodeNotificationInboxCursor(scope, query.view, {
            createdAt: last.createdAt,
            notificationId: last.notificationId,
          })
        : null,
    };
    return notificationInboxListResponseSchema.parse(response);
  }

  async unreadCount(
    context: RequestContext,
    appType: NotificationInboxAppType,
  ): Promise<NotificationUnreadCountResponse> {
    const scope = requireNotificationInboxScope(context, appType);
    return notificationUnreadCountResponseSchema.parse({
      ok: true,
      unreadCount: await this.repository.unreadCount(scope),
    });
  }

  private async mutate(
    context: RequestContext,
    appType: NotificationInboxAppType,
    notificationIdInput: unknown,
    expectedRowVersion: number,
    idempotencyKey: string,
    action: NotificationStateAction,
  ): Promise<NotificationStateMutationResponse> {
    const scope = requireNotificationInboxScope(context, appType);
    const idValue = notificationId(notificationIdInput);
    const requestFingerprint = fingerprintNotificationStateRequest({
      action: action.kind,
      scope,
      notificationId: idValue,
      expectedRowVersion,
      ...(action.kind === "archive" ? { archived: action.archived } : {}),
    });
    const result = await this.repository.mutateState({
      scope,
      notificationId: idValue,
      expectedRowVersion,
      idempotencyKeyHash: hashNotificationIdempotencyKey(idempotencyKey),
      requestFingerprint,
      action,
    });
    if (result.kind === "not_found") throw new NotificationInboxNotFoundError();
    if (result.kind === "conflict") throw new NotificationInboxConflictError();
    return notificationStateMutationResponseSchema.parse({ ok: true, result: result.result });
  }

  async markRead(
    context: RequestContext,
    appType: NotificationInboxAppType,
    notificationIdInput: unknown,
    bodyInput: unknown,
  ): Promise<NotificationStateMutationResponse> {
    const parsed = notificationMarkReadRequestSchema.safeParse(bodyInput);
    if (!parsed.success) throw new NotificationInboxValidationError();
    return this.mutate(
      context,
      appType,
      notificationIdInput,
      parsed.data.expectedRowVersion,
      parsed.data.idempotencyKey,
      { kind: "mark_read" },
    );
  }

  async archive(
    context: RequestContext,
    appType: NotificationInboxAppType,
    notificationIdInput: unknown,
    bodyInput: unknown,
  ): Promise<NotificationStateMutationResponse> {
    const parsed = notificationArchiveRequestSchema.safeParse(bodyInput);
    if (!parsed.success) throw new NotificationInboxValidationError();
    return this.mutate(
      context,
      appType,
      notificationIdInput,
      parsed.data.expectedRowVersion,
      parsed.data.idempotencyKey,
      { kind: "archive", archived: parsed.data.archived },
    );
  }
}

export {
  NotificationInboxForbiddenError,
  NotificationInboxValidationError,
};

export const notificationInboxService = new NotificationInboxService();
