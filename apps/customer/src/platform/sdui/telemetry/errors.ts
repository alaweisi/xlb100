import { CustomerSduiTelemetryClient } from "./client";
import { sanitizeCustomerSduiTelemetryToken } from "./sanitize";
import type { CustomerSduiTelemetryContext, CustomerSduiTelemetryDraft } from "./types";

export interface CustomerSduiErrorDetails extends Pick<
  CustomerSduiTelemetryDraft,
  "componentType" | "componentInstanceId" | "dataKey" | "actionKey"
> {
  phase: string;
  recoverable: boolean;
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "unknown";
  return sanitizeCustomerSduiTelemetryToken(error.code, "unknown");
}

/** Captures classification only; message, stack and arbitrary payload are excluded. */
export function reportCustomerSduiError(
  client: CustomerSduiTelemetryClient,
  context: CustomerSduiTelemetryContext,
  error: unknown,
  details: CustomerSduiErrorDetails,
): void {
  const errorName = error instanceof Error
    ? sanitizeCustomerSduiTelemetryToken(error.name, "Error")
    : "UnknownError";

  client.track({
    name: "runtime.error",
    outcome: "failed",
    context,
    componentType: details.componentType,
    componentInstanceId: details.componentInstanceId,
    dataKey: details.dataKey,
    actionKey: details.actionKey,
    attributes: {
      errorName,
      errorCode: errorCode(error),
      phase: details.phase,
      recoverable: details.recoverable,
    },
  });
}
