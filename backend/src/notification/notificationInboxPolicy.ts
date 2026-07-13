import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@xlb/config";
import type {
  NotificationInboxListQuery,
  NotificationInboxView,
  NotificationRecipientType,
  RequestContext,
} from "@xlb/types";
import { notificationInboxListQuerySchema } from "@xlb/validators";

export type NotificationInboxAppType = "customer" | "worker";

export interface NotificationInboxScope {
  cityCode: string;
  recipientType: NotificationRecipientType;
  recipientId: string;
  traceId: string;
}

export interface NotificationInboxCursorPosition {
  createdAt: string;
  notificationId: string;
}

type CursorPayload = NotificationInboxCursorPosition & {
  version: 1;
  view: NotificationInboxView;
  scopeHash: string;
};

export class NotificationInboxValidationError extends Error {
  readonly statusCode = 400;

  constructor(message = "invalid notification request") {
    super(message);
    this.name = "NotificationInboxValidationError";
  }
}

export class NotificationInboxForbiddenError extends Error {
  readonly statusCode = 403;

  constructor() {
    super("notification inbox requires the matching authenticated app role");
    this.name = "NotificationInboxForbiddenError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function cursorSecret(): string {
  return loadEnv().jwtSecret;
}

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function scopeDigest(scope: NotificationInboxScope, view: NotificationInboxView): string {
  return createHmac("sha256", cursorSecret())
    .update(`notification-inbox-scope-v1\0${scope.cityCode}\0${scope.recipientType}\0${scope.recipientId}\0${view}`)
    .digest("base64url");
}

function cursorSignature(body: string): string {
  return createHmac("sha256", cursorSecret())
    .update(`notification-inbox-cursor-v1\0${body}`)
    .digest("base64url");
}

export function requireNotificationInboxScope(
  context: RequestContext,
  expectedAppType: NotificationInboxAppType,
): NotificationInboxScope {
  if (
    context.appType !== expectedAppType ||
    context.role !== expectedAppType ||
    !context.userId ||
    !context.cityCode ||
    context.cityCode === "__global__"
  ) {
    throw new NotificationInboxForbiddenError();
  }
  return {
    cityCode: context.cityCode,
    recipientType: expectedAppType,
    recipientId: context.userId,
    traceId: context.traceId,
  };
}

export function parseNotificationInboxListQuery(input: unknown): Required<Pick<NotificationInboxListQuery, "limit" | "view">> & Pick<NotificationInboxListQuery, "cursor"> {
  const value = (input ?? {}) as Record<string, unknown>;
  const normalized = {
    ...value,
    ...(value.limit === undefined ? {} : { limit: Number(value.limit) }),
  };
  const parsed = notificationInboxListQuerySchema.safeParse(normalized);
  if (!parsed.success) throw new NotificationInboxValidationError();
  return {
    cursor: parsed.data.cursor,
    limit: parsed.data.limit ?? 20,
    view: parsed.data.view ?? "inbox",
  };
}

export function encodeNotificationInboxCursor(
  scope: NotificationInboxScope,
  view: NotificationInboxView,
  position: NotificationInboxCursorPosition,
): string {
  const payload: CursorPayload = {
    version: 1,
    view,
    scopeHash: scopeDigest(scope, view),
    createdAt: position.createdAt,
    notificationId: position.notificationId,
  };
  const body = base64Url(JSON.stringify(payload));
  return base64Url(`${body}.${cursorSignature(body)}`);
}

export function decodeNotificationInboxCursor(
  cursor: string | undefined,
  scope: NotificationInboxScope,
  view: NotificationInboxView,
): NotificationInboxCursorPosition | undefined {
  if (!cursor) return undefined;
  try {
    const envelope = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = envelope.lastIndexOf(".");
    if (separator < 1) throw new Error("cursor envelope");
    const body = envelope.slice(0, separator);
    const signature = envelope.slice(separator + 1);
    if (!safeEqual(signature, cursorSignature(body))) throw new Error("cursor signature");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<CursorPayload>;
    if (
      payload.version !== 1 ||
      payload.view !== view ||
      payload.scopeHash !== scopeDigest(scope, view) ||
      typeof payload.createdAt !== "string" ||
      !Number.isFinite(Date.parse(payload.createdAt)) ||
      typeof payload.notificationId !== "string" ||
      payload.notificationId.length < 1 ||
      payload.notificationId.length > 128
    ) {
      throw new Error("cursor payload");
    }
    return { createdAt: payload.createdAt, notificationId: payload.notificationId };
  } catch {
    throw new NotificationInboxValidationError("invalid notification cursor");
  }
}

export function hashNotificationIdempotencyKey(idempotencyKey: string): string {
  return sha256(idempotencyKey);
}

export function fingerprintNotificationStateRequest(input: {
  action: "mark_read" | "archive";
  scope: NotificationInboxScope;
  notificationId: string;
  expectedRowVersion: number;
  archived?: boolean;
}): string {
  return sha256(JSON.stringify({
    version: 1,
    action: input.action,
    cityCode: input.scope.cityCode,
    recipientType: input.scope.recipientType,
    recipientId: input.scope.recipientId,
    notificationId: input.notificationId,
    expectedRowVersion: input.expectedRowVersion,
    ...(input.action === "archive" ? { archived: input.archived } : {}),
  }));
}
