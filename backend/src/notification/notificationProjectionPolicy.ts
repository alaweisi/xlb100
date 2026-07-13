import { createHash } from "node:crypto";
import type {
  NotificationRenderParameters,
  PlatformNotificationCompatibilityProjection,
} from "@xlb/types";

export const NOTIFICATION_PROJECTION_ERRORS = {
  CLAIM_NOT_AVAILABLE: "platform delivery claim is not available",
  TEMPLATE_REVISION_NOT_AVAILABLE: "notification template revision is not available",
  TEMPLATE_REVISION_MISMATCH: "notification template revision does not match the projection",
  TEMPLATE_CONTENT_INVALID: "notification template content is invalid",
  PROJECTION_CONFLICT: "notification projection conflicts with existing evidence",
} as const;

export type NotificationProjectionErrorCode = keyof typeof NOTIFICATION_PROJECTION_ERRORS;

export class NotificationProjectionError extends Error {
  constructor(readonly code: NotificationProjectionErrorCode) {
    super(NOTIFICATION_PROJECTION_ERRORS[code]);
    this.name = "NotificationProjectionError";
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function notificationCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function notificationSha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function notificationRenderParametersHash(parameters: NotificationRenderParameters): string {
  return notificationSha256(notificationCanonicalJson(parameters));
}

export function notificationTargetFingerprint(
  projection: PlatformNotificationCompatibilityProjection,
  templateRevisionId: string,
): string {
  return notificationSha256(notificationCanonicalJson({
    subscriberId: projection.subscriberId,
    sourceEventId: projection.eventId,
    eventType: projection.eventType,
    eventMajorVersion: projection.eventMajorVersion,
    cityCode: projection.cityCode,
    recipientType: projection.recipientType,
    recipientId: projection.recipientId,
    sourcePayloadHash: projection.payloadHash,
    templateRevisionId,
    renderParameters: projection.renderParameters,
  }));
}

export interface NotificationTemplateContent {
  eventType: PlatformNotificationCompatibilityProjection["eventType"];
  recipientType: PlatformNotificationCompatibilityProjection["recipientType"];
  parameterNames: string[];
  titleTemplate: string;
  bodyTemplate: string;
}

export function notificationTemplateKey(
  projection: Pick<PlatformNotificationCompatibilityProjection, "eventType" | "recipientType">,
): string {
  if (projection.eventType === "order.created") {
    if (projection.recipientType !== "customer") {
      throw new NotificationProjectionError("TEMPLATE_REVISION_MISMATCH");
    }
    return "inapp.order.created.customer";
  }
  return `inapp.support.ticket.resolved.${projection.recipientType}`;
}

function parameterRecord(parameters: NotificationRenderParameters): Record<string, string> {
  if (parameters.kind === "order_created") {
    return { orderId: parameters.orderId };
  }
  return { ticketId: parameters.ticketId };
}

function assertPlainTemplate(value: string, maxLength: number): void {
  if (value.length < 1 || value.length > maxLength || /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)) {
    throw new NotificationProjectionError("TEMPLATE_CONTENT_INVALID");
  }
}

function renderOne(template: string, parameters: Record<string, string>): string {
  const placeholders = [...template.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)].map((match) => match[1]!);
  if (placeholders.some((name) => !(name in parameters))) {
    throw new NotificationProjectionError("TEMPLATE_CONTENT_INVALID");
  }
  const rendered = template.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_match, name: string) => parameters[name]!);
  if (rendered.includes("{{") || rendered.includes("}}")) {
    throw new NotificationProjectionError("TEMPLATE_CONTENT_INVALID");
  }
  return rendered;
}

export function renderNotificationTemplate(
  projection: PlatformNotificationCompatibilityProjection,
  template: NotificationTemplateContent,
): { title: string; body: string } {
  if (template.eventType !== projection.eventType || template.recipientType !== projection.recipientType) {
    throw new NotificationProjectionError("TEMPLATE_REVISION_MISMATCH");
  }
  const parameters = parameterRecord(projection.renderParameters);
  const expectedNames = Object.keys(parameters).sort();
  const actualNames = [...new Set(template.parameterNames)].sort();
  if (notificationCanonicalJson(expectedNames) !== notificationCanonicalJson(actualNames)) {
    throw new NotificationProjectionError("TEMPLATE_REVISION_MISMATCH");
  }
  assertPlainTemplate(template.titleTemplate, 255);
  assertPlainTemplate(template.bodyTemplate, 2000);
  const title = renderOne(template.titleTemplate, parameters);
  const body = renderOne(template.bodyTemplate, parameters);
  assertPlainTemplate(title, 255);
  assertPlainTemplate(body, 2000);
  return { title, body };
}
