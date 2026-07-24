import {
  CUSTOMER_SDUI_TELEMETRY_ATTRIBUTE_KEYS,
  type CustomerSduiTelemetryAttributeKey,
  type CustomerSduiTelemetryAttributes,
  type CustomerSduiTelemetryAttributeValue,
} from "./types";

const allowedAttributeKeys = new Set<string>(CUSTOMER_SDUI_TELEMETRY_ATTRIBUTE_KEYS);
const safeTokenPattern = /^[A-Za-z0-9_.:/-]{1,96}$/;
const safeIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/;
const sensitiveDigitRunPattern = /\d{10,}/;

function sanitizeValue(value: unknown): CustomerSduiTelemetryAttributeValue | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;

  const token = value.trim();
  return safeTokenPattern.test(token) && !sensitiveDigitRunPattern.test(token)
    ? token
    : undefined;
}

/**
 * Only closed, code-like attributes survive. Free-form strings are rejected so
 * error messages, addresses, phone numbers and Manifest content cannot leak.
 */
export function sanitizeCustomerSduiTelemetryAttributes(
  input: unknown,
): CustomerSduiTelemetryAttributes {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const output: CustomerSduiTelemetryAttributes = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowedAttributeKeys.has(key)) continue;
    const sanitized = sanitizeValue(value);
    if (sanitized === undefined) continue;
    output[key as CustomerSduiTelemetryAttributeKey] = sanitized;
  }
  return output;
}

export function sanitizeCustomerSduiTelemetryToken(
  value: unknown,
  fallback: string,
): string {
  const sanitized = sanitizeValue(value);
  return typeof sanitized === "string" ? sanitized : fallback;
}

export function sanitizeCustomerSduiTelemetryIdentifier(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== "string") return fallback;
  const token = value.trim();
  return safeIdentifierPattern.test(token) && !sensitiveDigitRunPattern.test(token)
    ? token
    : fallback;
}

export function sanitizeOptionalCustomerSduiTelemetryIdentifier(
  value: unknown,
): string | null {
  if (value === null || value === undefined) return null;
  const sanitized = sanitizeCustomerSduiTelemetryIdentifier(value, "");
  return sanitized || null;
}
