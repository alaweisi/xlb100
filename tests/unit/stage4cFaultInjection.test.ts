import { describe, expect, it } from "vitest";
import {
  DeterministicFaultPlan,
  InjectedFaultError,
} from "../helpers/stage4cFaultInjection.js";
import { percentile, runLoadScenario } from "../helpers/stage4cLoadHarness.js";

describe("Stage 4C deterministic fault injection framework", () => {
  it("injects a MySQL failure once and permits deterministic recovery", async () => {
    const plan = new DeterministicFaultPlan({
      name: "mysql-disconnect-on-first-query",
      target: "mysql",
      steps: [{ attempt: 1, effect: "error", message: "simulated MySQL disconnect" }],
    });
    let executed = 0;

    await expect(plan.execute(() => {
      executed += 1;
      return "unexpected";
    })).rejects.toMatchObject({
      name: "InjectedFaultError",
      code: "INJECTED_ERROR",
      target: "mysql",
      attempt: 1,
    });
    await expect(plan.execute(() => {
      executed += 1;
      return "recovered";
    })).resolves.toBe("recovered");

    expect(executed).toBe(1);
    expect(plan.snapshot()).toMatchObject({ attempts: 2, injected: 1, remaining: 0 });
  });

  it("models Redis timeout and Provider latency without external calls", async () => {
    const redis = new DeterministicFaultPlan({
      name: "redis-timeout",
      target: "redis",
      steps: [{ attempt: 1, effect: "timeout", delayMs: 1 }],
    });
    let redisCalls = 0;
    await expect(redis.execute(() => {
      redisCalls += 1;
      return "pong";
    })).rejects.toBeInstanceOf(InjectedFaultError);
    expect(redisCalls).toBe(0);

    const provider = new DeterministicFaultPlan({
      name: "provider-latency",
      target: "provider",
      steps: [{ attempt: 1, effect: "latency", delayMs: 2 }],
    });
    await expect(provider.execute(() => ({ externalProviderExecuted: false }))).resolves.toEqual({
      externalProviderExecuted: false,
    });
    expect(provider.snapshot()).toMatchObject({ attempts: 1, injected: 1 });
  });

  it("rejects invalid plans and keeps injected messages bounded", async () => {
    expect(() => new DeterministicFaultPlan({
      name: "duplicate",
      target: "provider",
      steps: [
        { attempt: 1, effect: "error" },
        { attempt: 1, effect: "timeout" },
      ],
    })).toThrow("attempts must be unique");

    const plan = new DeterministicFaultPlan({
      name: "bounded-error",
      target: "provider",
      steps: [{ attempt: 1, effect: "error", message: "x".repeat(1_000) }],
    });
    const error = await plan.execute(() => "never").catch(reason => reason as InjectedFaultError);
    expect(error.message).toHaveLength(256);
  });
});

describe("Stage 4C bounded load harness", () => {
  it("enforces concurrency and reports deterministic pass/fail percentiles", async () => {
    let active = 0;
    let maxActive = 0;
    const result = await runLoadScenario({
      name: "bounded-local-load",
      total: 12,
      concurrency: 3,
      operation: async index => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 1));
        active -= 1;
        return index % 4 !== 0;
      },
      isSuccess: value => value,
    });

    expect(maxActive).toBeLessThanOrEqual(3);
    expect(result).toMatchObject({ total: 12, concurrency: 3, passed: 9, failed: 3 });
    expect(result.p50Ms).toBeGreaterThanOrEqual(0);
    expect(result.p95Ms).toBeGreaterThanOrEqual(result.p50Ms);
    expect(result.maxMs).toBeGreaterThanOrEqual(result.p95Ms);
    expect(result.requestsPerSecond).toBeGreaterThan(0);
  });

  it("uses nearest-rank percentiles and validates invalid inputs", async () => {
    expect(percentile([1, 2, 3, 4, 100], 0.95)).toBe(100);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
    await expect(runLoadScenario({
      name: "invalid",
      total: 0,
      concurrency: 1,
      operation: () => true,
    })).rejects.toThrow("load total must be a positive integer");
  });
});
