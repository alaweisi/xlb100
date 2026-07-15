export type LoadSample<T> = {
  index: number;
  durationMs: number;
  ok: boolean;
  value?: T;
  error?: unknown;
};

export type LoadResult<T> = {
  name: string;
  total: number;
  concurrency: number;
  passed: number;
  failed: number;
  durationMs: number;
  requestsPerSecond: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  samples: readonly LoadSample<T>[];
};

export type LoadScenario<T> = {
  name: string;
  total: number;
  concurrency: number;
  operation: (index: number) => T | Promise<T>;
  isSuccess?: (value: T) => boolean;
};

export function percentile(samples: readonly number[], percentileValue: number): number {
  if (samples.length === 0) throw new Error("percentile requires at least one sample");
  if (!Number.isFinite(percentileValue) || percentileValue <= 0 || percentileValue > 1) {
    throw new Error("percentile must be greater than 0 and at most 1");
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentileValue * sorted.length) - 1)]!;
}

/** Runs a bounded local load scenario without opening its own network socket. */
export async function runLoadScenario<T>(scenario: LoadScenario<T>): Promise<LoadResult<T>> {
  if (!scenario.name.trim()) throw new Error("load scenario name is required");
  if (!Number.isInteger(scenario.total) || scenario.total <= 0) {
    throw new Error("load total must be a positive integer");
  }
  if (!Number.isInteger(scenario.concurrency) || scenario.concurrency <= 0) {
    throw new Error("load concurrency must be a positive integer");
  }

  const concurrency = Math.min(scenario.total, scenario.concurrency);
  const samples = new Array<LoadSample<T>>(scenario.total);
  let cursor = 0;
  const startedAt = performance.now();

  const worker = async () => {
    while (cursor < scenario.total) {
      const index = cursor;
      cursor += 1;
      const sampleStartedAt = performance.now();
      try {
        const value = await scenario.operation(index);
        samples[index] = {
          index,
          durationMs: performance.now() - sampleStartedAt,
          ok: scenario.isSuccess?.(value) ?? true,
          value,
        };
      } catch (error) {
        samples[index] = {
          index,
          durationMs: performance.now() - sampleStartedAt,
          ok: false,
          error,
        };
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  const durationMs = Math.max(0.001, performance.now() - startedAt);
  const durations = samples.map(sample => sample.durationMs);
  const passed = samples.filter(sample => sample.ok).length;

  return {
    name: scenario.name,
    total: scenario.total,
    concurrency,
    passed,
    failed: scenario.total - passed,
    durationMs,
    requestsPerSecond: scenario.total / (durationMs / 1_000),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: Math.max(...durations),
    samples,
  };
}
