import { CustomerSduiTelemetryClient } from "./client";
import { sanitizeCustomerSduiTelemetryToken } from "./sanitize";
import type { CustomerSduiTelemetryContext, CustomerSduiTelemetryDraft } from "./types";

export interface CustomerSduiErrorDetails extends Pick<
  CustomerSduiTelemetryDraft,
  "componentType" | "componentInstanceId" | "dataKey" | "actionKey"
> {
  phase: string;
  recoverable: boolean;
  attributes?: unknown;
}

const KNOWN_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "AbortError",
  "HomeDataTimeoutError",
]);

const KNOWN_ERROR_CODES = new Set([
  "ABORT_ERR",
  "NETWORK_ERROR",
  "NETWORK_TIMEOUT",
  "REQUEST_ABORTED",
  "VALIDATION_ERROR",
]);

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "unknown";
  const code = sanitizeCustomerSduiTelemetryToken(error.code, "unknown");
  return KNOWN_ERROR_CODES.has(code) ? code : "unknown";
}

/** Captures classification only; message, stack and arbitrary payload are excluded. */
export function reportCustomerSduiError(
  client: CustomerSduiTelemetryClient,
  context: CustomerSduiTelemetryContext,
  error: unknown,
  details: CustomerSduiErrorDetails,
): void {
  const candidateName = error instanceof Error
    ? sanitizeCustomerSduiTelemetryToken(error.name, "Error")
    : "UnknownError";
  const errorName = KNOWN_ERROR_NAMES.has(candidateName) ? candidateName : "OtherError";

  client.track({
    name: "runtime.error",
    outcome: "failed",
    context,
    componentType: details.componentType,
    componentInstanceId: details.componentInstanceId,
    dataKey: details.dataKey,
    actionKey: details.actionKey,
    attributes: {
      ...(typeof details.attributes === "object" && details.attributes !== null
        ? details.attributes
        : {}),
      errorName,
      errorCode: errorCode(error),
      phase: details.phase,
      recoverable: details.recoverable,
    },
  });
}
