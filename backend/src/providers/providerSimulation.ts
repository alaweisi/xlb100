export type ProviderCapability =
  | "payment"
  | "sms"
  | "object_storage"
  | "geo"
  | "enterprise_webhook";

export type ProviderTransportFault =
  | "none"
  | "timeout"
  | "transient_failure"
  | "permanent_failure"
  | "rate_limited";

export interface ProviderFaultPlan {
  transport?: ProviderTransportFault;
  latencyMs?: number;
  retryAfterMs?: number;
}

export class SimulatedProviderError extends Error {
  readonly externalProviderExecuted = false;

  constructor(
    readonly capability: ProviderCapability,
    readonly code:
      | "SIMULATED_TIMEOUT"
      | "SIMULATED_TRANSIENT_FAILURE"
      | "SIMULATED_PERMANENT_FAILURE"
      | "SIMULATED_RATE_LIMIT",
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(`${capability} ${code.toLowerCase()}`);
    this.name = "SimulatedProviderError";
  }
}

function boundedMilliseconds(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(30_000, Math.trunc(value)));
}

export async function applyProviderFault(
  capability: ProviderCapability,
  plan: ProviderFaultPlan = {},
): Promise<void> {
  const latencyMs = boundedMilliseconds(plan.latencyMs, 0);
  if (latencyMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, latencyMs));
  }

  switch (plan.transport ?? "none") {
    case "none":
      return;
    case "timeout":
      throw new SimulatedProviderError(capability, "SIMULATED_TIMEOUT", true);
    case "transient_failure":
      throw new SimulatedProviderError(capability, "SIMULATED_TRANSIENT_FAILURE", true);
    case "permanent_failure":
      throw new SimulatedProviderError(capability, "SIMULATED_PERMANENT_FAILURE", false);
    case "rate_limited":
      throw new SimulatedProviderError(
        capability,
        "SIMULATED_RATE_LIMIT",
        true,
        boundedMilliseconds(plan.retryAfterMs, 1_000),
      );
  }
}
