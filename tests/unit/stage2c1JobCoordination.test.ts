import type { EnvConfig } from "@xlb/config";
import type { CityCode } from "@xlb/types";
import type { Pool } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import {
  buildJobLockKey,
  withMysqlAdvisoryLock,
} from "../../backend/src/jobs/jobLock.js";
import {
  startAutoRunJobs,
  type AutoRunDependencies,
} from "../../backend/src/jobs/autoRun.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createFakeLockPool() {
  let owner: symbol | null = null;
  const releaseCalls: string[] = [];
  const connectionReleases: symbol[] = [];
  const connectionDestroys: symbol[] = [];

  const pool = {
    getConnection: vi.fn(async () => {
      const connectionId = Symbol("connection");
      return {
        query: vi.fn(async (sql: string, parameters: unknown[]) => {
          if (sql.includes("GET_LOCK")) {
            if (owner !== null) return [[{ acquired: 0 }], []];
            owner = connectionId;
            return [[{ acquired: 1 }], []];
          }
          if (sql.includes("RELEASE_LOCK")) {
            if (owner === connectionId) owner = null;
            releaseCalls.push(String(parameters[0]));
            return [[{ released: 1 }], []];
          }
          throw new Error(`unexpected SQL: ${sql}`);
        }),
        release: vi.fn(() => connectionReleases.push(connectionId)),
        destroy: vi.fn(() => connectionDestroys.push(connectionId)),
      };
    }),
  } as unknown as Pool;

  return { pool, releaseCalls, connectionReleases, connectionDestroys };
}

const env = {
  nodeEnv: "development",
  autoRunEnabled: true,
  autoRunIntervalMs: 1_000,
  autoRunCityCodes: ["hangzhou"],
} as EnvConfig;

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createDependencies(
  overrides: Partial<AutoRunDependencies> = {},
): AutoRunDependencies {
  return {
    withLock: async (_scope, operation) => ({ status: "acquired", value: await operation() }),
    reapExpiredLeases: vi.fn(async () => 0),
    runDispatch: vi.fn(async () => ({ processed: 0 })),
    runDispatchMatch: vi.fn(async () => ({ processed: 0 })),
    runLedger: vi.fn(async () => ({ processed: 0 })),
    prepareSettlement: vi.fn(async () => ({ processed: 0 })),
    runSupportSla: vi.fn(async () => ({ processed: 0 })),
    collectReliabilitySnapshot: vi.fn(async (cityCodes: readonly string[]) => ({
      observedAt: "2026-07-15T08:00:00.000Z",
      cities: cityCodes.map((cityCode) => ({
        cityCode,
        outbox: {
          statusCounts: {
            pending: 0,
            processing: 0,
            retry_wait: 0,
            published: 0,
            dead_letter: 0,
          },
          stalledTransactionalRows: 0,
          oldestEligibleAgeSeconds: null,
          expiredProcessingLeases: 0,
        },
        dispatchStream: { length: 0, consumerGroups: 0 },
      })),
      migrations: { appliedCount: 0, latestVersion: null },
    })),
    publishReliabilitySnapshot: vi.fn(async () => undefined),
    publishHeartbeat: vi.fn(async () => undefined),
    recordRun: vi.fn(),
    recordReaped: vi.fn(),
    now: () => new Date(),
    setInterval: vi.fn(() => 1 as unknown as ReturnType<typeof setInterval>),
    clearInterval: vi.fn(),
    ...overrides,
  };
}

describe("Stage 2C-1 MySQL job advisory lock", () => {
  it("uses a safe bounded key and permits only one concurrent holder", async () => {
    const { pool, releaseCalls, connectionReleases } = createFakeLockPool();
    const gate = deferred<void>();
    const firstStarted = deferred<void>();
    const first = withMysqlAdvisoryLock("hangzhou:dispatch", async () => {
      firstStarted.resolve();
      await gate.promise;
      return "first";
    }, { pool });

    await firstStarted.promise;
    const secondOperation = vi.fn(async () => "second");
    await expect(withMysqlAdvisoryLock("hangzhou:dispatch", secondOperation, { pool }))
      .resolves.toEqual({ status: "busy" });
    expect(secondOperation).not.toHaveBeenCalled();

    gate.resolve();
    await expect(first).resolves.toEqual({ status: "acquired", value: "first" });
    expect(releaseCalls).toHaveLength(1);
    expect(connectionReleases).toHaveLength(2);
    expect(buildJobLockKey("hangzhou:dispatch")).toMatch(/^xlb:job:[a-f0-9]+$/u);
    expect(buildJobLockKey("x".repeat(1_000)).length).toBeLessThanOrEqual(64);
  });

  it("releases the named lock and connection when the operation fails", async () => {
    const { pool, releaseCalls, connectionReleases } = createFakeLockPool();
    await expect(withMysqlAdvisoryLock("hangzhou:ledger", async () => {
      throw new Error("job failed");
    }, { pool })).rejects.toThrow("job failed");
    expect(releaseCalls).toHaveLength(1);
    expect(connectionReleases).toHaveLength(1);
  });

  it("destroys a session whose named lock cannot be confirmed as released", async () => {
    const { pool, connectionReleases, connectionDestroys } = createFakeLockPool();
    const connection = await pool.getConnection();
    vi.mocked(connection.query).mockImplementation(async (sql: string) => (
      sql.includes("GET_LOCK")
        ? [[{ acquired: 1 }], []]
        : [[{ released: 0 }], []]
    ) as never);
    vi.mocked(pool.getConnection).mockResolvedValueOnce(connection);

    await expect(withMysqlAdvisoryLock("hangzhou:support.sla", async () => 1, { pool }))
      .rejects.toThrow("could not be released");
    expect(connectionReleases).toHaveLength(0);
    expect(connectionDestroys).toHaveLength(1);
  });
});

describe("Stage 2C-1 auto-run coordination", () => {
  it("reaps expired leases before every business consumer", async () => {
    const order: string[] = [];
    const dependencies = createDependencies({
      withLock: async (scope, operation) => {
        order.push(scope);
        return { status: "acquired", value: await operation() };
      },
      reapExpiredLeases: vi.fn(async (cityCode: CityCode) => {
        order.push(`reaped:${cityCode}`);
        return 3;
      }),
    });
    const handle = startAutoRunJobs({ env, logger: createLogger(), dependencies });

    await handle.runOnce();
    await handle.stop();

    expect(order).toEqual([
      "hangzhou:outbox.reap",
      "reaped:hangzhou",
      "hangzhou:dispatch",
      "hangzhou:dispatch.match",
      "hangzhou:ledger",
      "hangzhou:settlement.prepare",
      "hangzhou:support.sla",
      "observability:snapshot",
    ]);
    expect(dependencies.recordReaped).toHaveBeenCalledWith("hangzhou", 3);
  });

  it("publishes a shared heartbeat every tick and bounds reliability scans to once per minute", async () => {
    const publishHeartbeat = vi.fn(async () => undefined);
    const collectReliabilitySnapshot = vi.fn(async () => ({
      observedAt: "2026-07-15T08:00:00.000Z",
      cities: [],
      migrations: { appliedCount: 0, latestVersion: null },
    }));
    const dependencies = createDependencies({ publishHeartbeat, collectReliabilitySnapshot });
    const handle = startAutoRunJobs({ env, logger: createLogger(), dependencies });

    await handle.runOnce();
    await handle.runOnce();
    await handle.stop();

    expect(publishHeartbeat).toHaveBeenCalledTimes(2);
    expect(collectReliabilitySnapshot).toHaveBeenCalledTimes(1);
    expect(dependencies.publishReliabilitySnapshot).toHaveBeenCalledTimes(1);
  });

  it("skips a busy cross-instance step without invoking its consumer", async () => {
    const logger = createLogger();
    const runDispatch = vi.fn(async () => ({ processed: 1 }));
    const dependencies = createDependencies({
      runDispatch,
      withLock: async (scope, operation) => (
        scope.endsWith(":dispatch")
          ? { status: "busy" }
          : { status: "acquired", value: await operation() }
      ),
    });
    const handle = startAutoRunJobs({ env, logger, dependencies });

    await handle.runOnce();
    await handle.stop();

    expect(runDispatch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { step: "dispatch", cityCode: "hangzhou" },
      "auto-run step skipped because another instance owns the lock",
    );
  });

  it("does not overlap timer cycles inside one process", async () => {
    const logger = createLogger();
    const gate = deferred<number>();
    const dependencies = createDependencies({
      reapExpiredLeases: vi.fn(() => gate.promise),
    });
    const handle = startAutoRunJobs({ env, logger, dependencies });

    const first = handle.runOnce();
    await Promise.resolve();
    await handle.runOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      { intervalMs: env.autoRunIntervalMs },
      "auto-run skipped overlapping tick",
    );

    gate.resolve(0);
    await first;
    await handle.stop();
  });

  it("waits for the active cycle before completing shutdown", async () => {
    const gate = deferred<number>();
    const dependencies = createDependencies({
      reapExpiredLeases: vi.fn(() => gate.promise),
    });
    const handle = startAutoRunJobs({ env, logger: createLogger(), dependencies });

    const activeRun = handle.runOnce();
    await Promise.resolve();
    const stop = handle.stop();
    let stopped = false;
    void stop.then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    gate.resolve(0);
    await activeRun;
    await stop;
    expect(stopped).toBe(true);
    expect(dependencies.clearInterval).toHaveBeenCalledOnce();
  });
});
