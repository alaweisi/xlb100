import type { CityCode, RequestContext } from "@xlb/types";
import type { EnvConfig } from "@xlb/config";
import { dispatchService } from "../dispatch/dispatchService.js";
import { dispatchSimulationService } from "../dispatch/dispatchSimulationService.js";
import { eventOutboxRepository } from "../events/eventOutbox.js";
import { ledgerService } from "../ledger/ledgerService.js";
import {
  collectDataReliabilitySnapshot,
  type DataReliabilitySnapshot,
} from "../observability/dataReliability.js";
import {
  publishDataReliabilityMetrics,
  publishJobWorkerMetricsHeartbeat,
  recordJobRun,
  recordOutboxLeasesReaped,
} from "../observability/metrics.js";
import { settlementPreparationService } from "../settlement/settlementPreparationService.js";
import { supportSlaBreachService } from "../support/ticket/supportSlaBreachService.js";
import {
  withMysqlAdvisoryLock,
  type AdvisoryLockResult,
} from "./jobLock.js";

type AutoRunLogger = {
  info: (payload: unknown, message?: string) => void;
  warn: (payload: unknown, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
};

export type AutoRunHandle = {
  stop: () => Promise<void>;
  runOnce: () => Promise<void>;
};

export type AutoRunStep =
  | "outbox.reap"
  | "dispatch"
  | "dispatch.match"
  | "ledger"
  | "settlement.prepare"
  | "support.sla";

type AutoRunIntervalHandle = ReturnType<typeof setInterval>;

export type AutoRunDependencies = {
  withLock: (
    scope: string,
    operation: () => Promise<number>,
  ) => Promise<AdvisoryLockResult<number>>;
  reapExpiredLeases: (cityCode: CityCode) => Promise<number>;
  runDispatch: (context: RequestContext, cityCode: CityCode) => Promise<{ processed: number }>;
  runDispatchMatch: (context: RequestContext) => Promise<{ processed: number }>;
  runLedger: (context: RequestContext) => Promise<{ processed: number }>;
  prepareSettlement: (context: RequestContext) => Promise<{ processed: number }>;
  runSupportSla: (context: RequestContext, cityCode: CityCode) => Promise<{ processed: number }>;
  collectReliabilitySnapshot: (cityCodes: readonly string[]) => Promise<DataReliabilitySnapshot>;
  publishReliabilitySnapshot: (snapshot: DataReliabilitySnapshot) => Promise<void>;
  publishHeartbeat: (observedAt: Date) => Promise<void>;
  recordRun: typeof recordJobRun;
  recordReaped: typeof recordOutboxLeasesReaped;
  now: () => Date;
  setInterval: (callback: () => void, intervalMs: number) => AutoRunIntervalHandle;
  clearInterval: (handle: AutoRunIntervalHandle) => void;
};

export type AutoRunOptions = {
  env: EnvConfig;
  logger: AutoRunLogger;
  dependencies?: Partial<AutoRunDependencies>;
};

const defaultDependencies: AutoRunDependencies = {
  withLock: (scope, operation) => withMysqlAdvisoryLock(scope, operation),
  reapExpiredLeases: (cityCode) => eventOutboxRepository.reapExpiredLeases(cityCode),
  runDispatch: (context, cityCode) => dispatchService.runDispatchOutboxOnce(context, cityCode),
  runDispatchMatch: (context) => dispatchSimulationService.matchOpenTasksOnce(context),
  runLedger: (context) => ledgerService.runOnce(context),
  prepareSettlement: (context) => settlementPreparationService.prepareOnce(context),
  runSupportSla: (context, cityCode) => supportSlaBreachService.runOnce(context, cityCode),
  collectReliabilitySnapshot: (cityCodes) => collectDataReliabilitySnapshot(cityCodes),
  publishReliabilitySnapshot: (snapshot) => publishDataReliabilityMetrics(snapshot),
  publishHeartbeat: (observedAt) => publishJobWorkerMetricsHeartbeat(observedAt),
  recordRun: recordJobRun,
  recordReaped: recordOutboxLeasesReaped,
  now: () => new Date(),
  setInterval,
  clearInterval,
};

function buildAutoRunContext(cityCode: CityCode): RequestContext {
  const traceId = `auto-run-${cityCode}-${Date.now()}`;
  return {
    traceId,
    appType: "admin",
    role: "operator",
    cityCode,
    userId: "auto-run",
    requestStartedAt: new Date().toISOString(),
    requestId: traceId,
    correlationId: traceId,
  };
}

async function runStep(
  step: AutoRunStep,
  cityCode: CityCode,
  context: RequestContext,
  logger: AutoRunLogger,
  dependencies: AutoRunDependencies,
): Promise<void> {
  const startedAt = dependencies.now().getTime();
  try {
    const lockResult = await dependencies.withLock(`${cityCode}:${step}`, async () => {
      if (step === "outbox.reap") {
        return dependencies.reapExpiredLeases(cityCode);
      }

      if (step === "dispatch") {
        return (await dependencies.runDispatch(context, cityCode)).processed;
      }

      if (step === "dispatch.match") {
        return (await dependencies.runDispatchMatch(context)).processed;
      }

      if (step === "ledger") {
        return (await dependencies.runLedger(context)).processed;
      }

      if (step === "support.sla") {
        return (await dependencies.runSupportSla(context, cityCode)).processed;
      }

      return (await dependencies.prepareSettlement(context)).processed;
    });

    if (lockResult.status === "busy") {
      dependencies.recordRun({
        cityCode,
        step,
        outcome: "busy",
        durationMs: dependencies.now().getTime() - startedAt,
      });
      logger.warn({ step, cityCode }, "auto-run step skipped because another instance owns the lock");
      return;
    }

    dependencies.recordRun({
      cityCode,
      step,
      outcome: "success",
      durationMs: dependencies.now().getTime() - startedAt,
    });
    if (step === "outbox.reap") {
      dependencies.recordReaped(cityCode, lockResult.value);
    }

    logger.info(
      { step, cityCode, processed: lockResult.value },
      step === "outbox.reap" ? "expired outbox leases reaped" : "auto-run step completed",
    );
  } catch (error) {
    dependencies.recordRun({
      cityCode,
      step,
      outcome: "failed",
      durationMs: dependencies.now().getTime() - startedAt,
    });
    logger.error({ step, cityCode, error }, "auto-run step failed");
  }
}

export function startAutoRunJobs({ env, logger, dependencies: overrides }: AutoRunOptions): AutoRunHandle {
  const dependencies: AutoRunDependencies = { ...defaultDependencies, ...overrides };
  const disabledHandle: AutoRunHandle = {
    stop: async () => undefined,
    runOnce: async () => undefined,
  };

  if (env.nodeEnv === "test") {
    logger.info({ nodeEnv: env.nodeEnv }, "auto-run disabled in test environment");
    return disabledHandle;
  }

  if (!env.autoRunEnabled) {
    logger.info({ enabled: false }, "auto-run disabled");
    return disabledHandle;
  }

  const cityCodes = env.autoRunCityCodes;
  if (cityCodes.length === 0) {
    logger.warn({ enabled: true }, "auto-run enabled without city codes; no jobs started");
    return disabledHandle;
  }

  let stopped = false;
  let activeRun: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;
  let lastReliabilitySnapshotAtMs = Number.NEGATIVE_INFINITY;

  const publishHeartbeat = async () => {
    try {
      await dependencies.publishHeartbeat(dependencies.now());
    } catch (error) {
      logger.error({ step: "heartbeat", error }, "job worker heartbeat publish failed");
    }
  };

  const collectReliability = async () => {
    const nowMs = dependencies.now().getTime();
    if (nowMs - lastReliabilitySnapshotAtMs < 60_000) return;
    const startedAt = nowMs;
    try {
      const result = await dependencies.withLock("observability:snapshot", async () => {
        const snapshot = await dependencies.collectReliabilitySnapshot(cityCodes);
        await dependencies.publishReliabilitySnapshot(snapshot);
        return snapshot.cities.length;
      });
      lastReliabilitySnapshotAtMs = nowMs;
      dependencies.recordRun({
        cityCode: "worker",
        step: "snapshot",
        outcome: result.status === "busy" ? "busy" : "success",
        durationMs: dependencies.now().getTime() - startedAt,
      });
      if (result.status === "acquired") {
        logger.info(
          { step: "snapshot", cities: result.value },
          "data reliability snapshot published",
        );
      }
    } catch (error) {
      dependencies.recordRun({
        cityCode: "worker",
        step: "snapshot",
        outcome: "failed",
        durationMs: dependencies.now().getTime() - startedAt,
      });
      logger.error({ step: "snapshot", error }, "data reliability snapshot failed");
    }
  };

  const executeCycle = async () => {
    await publishHeartbeat();
    for (const cityCode of cityCodes) {
      const context = buildAutoRunContext(cityCode);
      await runStep("outbox.reap", cityCode, context, logger, dependencies);
      await runStep("dispatch", cityCode, context, logger, dependencies);
      await runStep("dispatch.match", cityCode, context, logger, dependencies);
      await runStep("ledger", cityCode, context, logger, dependencies);
      await runStep("settlement.prepare", cityCode, context, logger, dependencies);
      await runStep("support.sla", cityCode, context, logger, dependencies);
    }
    await collectReliability();
  };

  const runOnce = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (activeRun) {
      logger.warn({ intervalMs: env.autoRunIntervalMs }, "auto-run skipped overlapping tick");
      return Promise.resolve();
    }

    const cycle = executeCycle();
    activeRun = cycle;
    return cycle.finally(() => {
      if (activeRun === cycle) {
        activeRun = null;
      }
    });
  };

  const interval = dependencies.setInterval(() => {
    void runOnce();
  }, env.autoRunIntervalMs);

  logger.info(
    { enabled: true, intervalMs: env.autoRunIntervalMs, cityCodes },
    "auto-run started",
  );

  return {
    runOnce,
    stop: () => {
      if (stopPromise) return stopPromise;
      stopped = true;
      dependencies.clearInterval(interval);
      stopPromise = (async () => {
        await activeRun;
        logger.info({ cityCodes }, "auto-run stopped");
      })();
      return stopPromise;
    },
  };
}
