import { CustomerSduiTelemetryClient } from "./client";
import type {
  CustomerSduiPerformanceMetric,
  CustomerSduiTelemetryContext,
  CustomerSduiTelemetryDraft,
  CustomerSduiTelemetryOutcome,
} from "./types";

export type CustomerSduiTelemetryCorrelation = Pick<
  CustomerSduiTelemetryDraft,
  "componentType" | "componentInstanceId" | "dataKey" | "actionKey"
>;

export interface CustomerSduiPerformanceSpan {
  finish(
    outcome?: CustomerSduiTelemetryOutcome,
    attributes?: unknown,
  ): number | null;
}

function browserClock(): number {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

export class CustomerSduiPerformanceTracker {
  readonly #client: CustomerSduiTelemetryClient;
  readonly #clock: () => number;

  constructor(client: CustomerSduiTelemetryClient, clock: () => number = browserClock) {
    this.#client = client;
    this.#clock = clock;
  }

  start(
    metricName: CustomerSduiPerformanceMetric,
    context: CustomerSduiTelemetryContext,
    correlation: CustomerSduiTelemetryCorrelation = {},
  ): CustomerSduiPerformanceSpan {
    const startedAt = this.#clock();
    let finished = false;

    return {
      finish: (outcome = "succeeded", attributes) => {
        if (finished) return null;
        finished = true;
        const durationMs = Math.max(0, this.#clock() - startedAt);
        this.#client.track({
          name: "performance.measure",
          outcome,
          context,
          ...correlation,
          durationMs,
          attributes: { metricName, ...(typeof attributes === "object" ? attributes : {}) },
        });
        return durationMs;
      },
    };
  }

  async measure<T>(
    metricName: CustomerSduiPerformanceMetric,
    context: CustomerSduiTelemetryContext,
    operation: () => Promise<T>,
    correlation: CustomerSduiTelemetryCorrelation = {},
  ): Promise<T> {
    const span = this.start(metricName, context, correlation);
    try {
      const result = await operation();
      span.finish("succeeded");
      return result;
    } catch (error) {
      span.finish("failed");
      throw error;
    }
  }
}
