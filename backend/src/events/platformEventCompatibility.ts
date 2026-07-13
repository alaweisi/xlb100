import { createHash } from "node:crypto";
import type {
  NotificationRenderParameters,
  NotificationRecipientType,
  OutboxEventType,
} from "@xlb/types";
import { parsePlatformCompatibilityPayload } from "@xlb/validators";
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
