import { createHash } from "node:crypto";
import type { OutboxEventType } from "@xlb/types";
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
