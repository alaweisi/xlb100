export type FaultTarget = "mysql" | "redis" | "provider";

export type FaultEffect = "error" | "timeout" | "latency";

export type FaultStep = {
  attempt: number;
  effect: FaultEffect;
  delayMs?: number;
  message?: string;
};

export type FaultPlanOptions = {
  name: string;
  target: FaultTarget;
  steps: readonly FaultStep[];
};

export type FaultPlanSnapshot = {
  name: string;
  target: FaultTarget;
  attempts: number;
  injected: number;
  remaining: number;
};

export class InjectedFaultError extends Error {
  readonly code: "INJECTED_ERROR" | "INJECTED_TIMEOUT";

  constructor(
    readonly target: FaultTarget,
    readonly scenario: string,
    readonly attempt: number,
    code: "INJECTED_ERROR" | "INJECTED_TIMEOUT",
    message: string,
  ) {
    super(message);
    this.name = "InjectedFaultError";
    this.code = code;
  }
}

function wait(delayMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

function validateStep(step: FaultStep): void {
  if (!Number.isInteger(step.attempt) || step.attempt <= 0) {
    throw new Error("fault injection attempt must be a positive integer");
  }
  const delayMs = step.delayMs ?? 0;
  if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 30_000) {
    throw new Error("fault injection delayMs must be an integer between 0 and 30000");
  }
}

/**
 * Test-only deterministic fault plan. It never patches global timers, opens a
 * network connection, or installs a production failure endpoint.
 */
export class DeterministicFaultPlan {
  private attempts = 0;
  private injected = 0;
  private readonly steps: ReadonlyMap<number, FaultStep>;

  constructor(private readonly options: FaultPlanOptions) {
    if (!options.name.trim()) throw new Error("fault injection plan name is required");
    const entries = options.steps.map(step => {
      validateStep(step);
      return [step.attempt, { ...step }] as const;
    });
    if (new Set(entries.map(([attempt]) => attempt)).size !== entries.length) {
      throw new Error("fault injection attempts must be unique");
    }
    this.steps = new Map(entries);
  }

  async execute<T>(operation: () => T | Promise<T>): Promise<T> {
    this.attempts += 1;
    const step = this.steps.get(this.attempts);
    if (!step) return operation();

    this.injected += 1;
    const delayMs = step.delayMs ?? 0;
    if (delayMs > 0) await wait(delayMs);

    if (step.effect === "latency") return operation();

    const code = step.effect === "timeout" ? "INJECTED_TIMEOUT" : "INJECTED_ERROR";
    const message = step.message?.trim() || `${this.options.target} ${step.effect} injected`;
    throw new InjectedFaultError(
      this.options.target,
      this.options.name,
      this.attempts,
      code,
      message.slice(0, 256),
    );
  }

  snapshot(): FaultPlanSnapshot {
    return {
      name: this.options.name,
      target: this.options.target,
      attempts: this.attempts,
      injected: this.injected,
      remaining: [...this.steps.keys()].filter(attempt => attempt > this.attempts).length,
    };
  }
}
