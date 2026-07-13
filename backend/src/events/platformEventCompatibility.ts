import { createHash } from "node:crypto";
import type {
  NotificationRenderParameters,
  NotificationRecipientType,
  OutboxEventType,
  PlatformReviewCreatedV1CompatibilityPayload,
  PlatformReviewVisibilityChangedV1CompatibilityPayload,
} from "@xlb/types";
import {
  parsePlatformCompatibilityPayload,
  parseVersionedPlatformCompatibilityPayload,
} from "@xlb/validators";
import {
  PlatformDeliveryCanonicalError,
  type PlatformDeliveryCanonicalErrorCode,
} from "./platformDeliveryPolicy.js";

export class PlatformCompatibilityError extends PlatformDeliveryCanonicalError {
  constructor(code: Exclude<PlatformDeliveryCanonicalErrorCode, "PLATFORM_DELIVERY_ERROR" | "LEASE_EXPIRED">) {
    super(code);
    this.name = "PlatformCompatibilityError";
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

export function canonicalPayloadHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)), "utf8")
    .digest("hex");
}

export function validateImplicitV0Compatibility(
  eventType: OutboxEventType,
  envelopeCityCode: string,
  subscriptionCityCode: string,
  payload: unknown,
): { eventMajorVersion: 0; payloadHash: string } {
  if (envelopeCityCode !== subscriptionCityCode) {
    throw new PlatformCompatibilityError("CITY_SCOPE_MISMATCH");
  }
  if (eventType !== "order.created" && eventType !== "support.ticket.resolved") {
    throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_TYPE");
  }

  try {
    const parsed = parsePlatformCompatibilityPayload(eventType, payload) as { cityCode: string };
    if (parsed.cityCode !== envelopeCityCode) {
      throw new PlatformCompatibilityError("CITY_SCOPE_MISMATCH");
    }
  } catch (error) {
    if (error instanceof PlatformCompatibilityError) throw error;
    throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
  }

  return { eventMajorVersion: 0, payloadHash: canonicalPayloadHash(payload) };
}

export function isApprovedPlatformEventVersion(
  eventType: OutboxEventType,
  eventMajorVersion: number,
): boolean {
  return (
    (eventMajorVersion === 0 &&
      (eventType === "order.created" || eventType === "support.ticket.resolved")) ||
    (eventMajorVersion === 1 &&
      (eventType === "review.created" || eventType === "review.visibility.changed"))
  );
}

export function validateVersionedPlatformCompatibility(
  eventType: OutboxEventType,
  eventMajorVersion: number,
  envelopeCityCode: string,
  subscriptionCityCode: string,
  payload: unknown,
): { eventMajorVersion: number; payloadHash: string } {
  if (envelopeCityCode !== subscriptionCityCode) {
    throw new PlatformCompatibilityError("CITY_SCOPE_MISMATCH");
  }
  if (!isApprovedPlatformEventVersion(eventType, eventMajorVersion)) {
    if (
      eventType === "order.created" ||
      eventType === "support.ticket.resolved" ||
      eventType === "review.created" ||
      eventType === "review.visibility.changed"
    ) {
      throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_VERSION");
    }
    throw new PlatformCompatibilityError("UNSUPPORTED_EVENT_TYPE");
  }
  try {
    const parsed = parseVersionedPlatformCompatibilityPayload(
      eventType,
      eventMajorVersion,
      payload,
    ) as { cityCode?: string };
    if (eventMajorVersion === 0 && parsed.cityCode !== envelopeCityCode) {
      throw new PlatformCompatibilityError("CITY_SCOPE_MISMATCH");
    }
  } catch (error) {
    if (error instanceof PlatformCompatibilityError) throw error;
    throw new PlatformCompatibilityError("INVALID_EVENT_PAYLOAD");
  }
  return { eventMajorVersion, payloadHash: canonicalPayloadHash(payload) };
}

export function projectReviewCreatedV1Compatibility(
  envelopeCityCode: string,
  subscriptionCityCode: string,
  payload: unknown,
): PlatformReviewCreatedV1CompatibilityPayload & { eventMajorVersion: 1; payloadHash: string } {
  const compatibility = validateVersionedPlatformCompatibility(
    "review.created",
    1,
    envelopeCityCode,
    subscriptionCityCode,
    payload,
  );
  const parsed = parseVersionedPlatformCompatibilityPayload(
    "review.created",
    1,
    payload,
  ) as PlatformReviewCreatedV1CompatibilityPayload;
  return {
    ...parsed,
    eventMajorVersion: 1,
    payloadHash: compatibility.payloadHash,
  };
}

export function projectReviewVisibilityChangedV1Compatibility(
  envelopeCityCode: string,
  subscriptionCityCode: string,
  payload: unknown,
): PlatformReviewVisibilityChangedV1CompatibilityPayload & {
  eventMajorVersion: 1;
  payloadHash: string;
} {
  const compatibility = validateVersionedPlatformCompatibility(
    "review.visibility.changed",
    1,
    envelopeCityCode,
    subscriptionCityCode,
    payload,
  );
  const parsed = parseVersionedPlatformCompatibilityPayload(
    "review.visibility.changed",
    1,
    payload,
  ) as PlatformReviewVisibilityChangedV1CompatibilityPayload;
  return {
    ...parsed,
    eventMajorVersion: 1,
    payloadHash: compatibility.payloadHash,
  };
}

/**
 * Produces the only payload-derived values that may cross from Events into
 * Notification. The raw payload remains inside this compatibility boundary;
 * fields classified as discard-only are validated above and then dropped.
 */
export function projectImplicitV0NotificationCompatibility(
  eventType: OutboxEventType,
  envelopeCityCode: string,
  subscriptionCityCode: string,
  payload: unknown,
): {
  eventMajorVersion: 0;
  payloadHash: string;
  recipientType: NotificationRecipientType;
  recipientId: string;
  renderParameters: NotificationRenderParameters;
  occurredAt: string;
} {
  const compatibility = validateImplicitV0Compatibility(
    eventType,
    envelopeCityCode,
    subscriptionCityCode,
    payload,
  );
  const parsed = parsePlatformCompatibilityPayload(eventType, payload);

  if (eventType === "order.created") {
    const order = parsed as {
      orderId: string;
      customerId: string;
      createdAt: string;
    };
    return {
      ...compatibility,
      recipientType: "customer",
      recipientId: order.customerId,
      renderParameters: { kind: "order_created", orderId: order.orderId },
      occurredAt: order.createdAt,
    };
  }

  const ticket = parsed as {
    ticketId: string;
    source: "customer" | "worker";
    requesterId: string;
    occurredAt: string;
  };
  return {
    ...compatibility,
    recipientType: ticket.source,
    recipientId: ticket.requesterId,
    renderParameters: { kind: "support_ticket_resolved", ticketId: ticket.ticketId },
    occurredAt: ticket.occurredAt,
  };
}
