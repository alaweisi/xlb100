import type { CityCode, RequestContext } from "@xlb/types";
import type { EnvConfig } from "@xlb/config";
import { dispatchService } from "../dispatch/dispatchService.js";
import { dispatchSimulationService } from "../dispatch/dispatchSimulationService.js";
import { ledgerService } from "../ledger/ledgerService.js";
import { settlementPreparationService } from "../settlement/settlementPreparationService.js";

type AutoRunLogger = {
  info: (payload: unknown, message?: string) => void;
  warn: (payload: unknown, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
};

export type AutoRunHandle = {
  stop: () => void;
};

type AutoRunStep = "dispatch" | "dispatch.match" | "ledger" | "settlement.prepare";

type AutoRunOptions = {
  env: EnvConfig;
  logger: AutoRunLogger;
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
): Promise<void> {
  try {
    if (step === "dispatch") {
      const result = await dispatchService.runDispatchOutboxOnce(context, cityCode);
      logger.info({ step, cityCode, processed: result.processed }, "auto-run step completed");
      return;
    }

    if (step === "dispatch.match") {
      const result = await dispatchSimulationService.matchOpenTasksOnce(context);
      logger.info({ step, cityCode, processed: result.processed }, "auto-run step completed");
      return;
    }

    if (step === "ledger") {
      const result = await ledgerService.runOnce(context);
      logger.info({ step, cityCode, processed: result.processed }, "auto-run step completed");
      return;
    }

    const result = await settlementPreparationService.prepareOnce(context);
    logger.info({ step, cityCode, processed: result.processed }, "auto-run step completed");
  } catch (error) {
    logger.error({ step, cityCode, error }, "auto-run step failed");
  }
}

export function startAutoRunJobs({ env, logger }: AutoRunOptions): AutoRunHandle {
  if (env.nodeEnv === "test") {
    logger.info({ nodeEnv: env.nodeEnv }, "auto-run disabled in test environment");
    return { stop: () => undefined };
  }

  if (!env.autoRunEnabled) {
    logger.info({ enabled: false }, "auto-run disabled");
    return { stop: () => undefined };
  }

  const cityCodes = env.autoRunCityCodes;
  if (cityCodes.length === 0) {
    logger.warn({ enabled: true }, "auto-run enabled without city codes; no jobs started");
    return { stop: () => undefined };
  }

  let isRunning = false;
  let stopped = false;

  const runOnce = async () => {
    if (stopped) return;
    if (isRunning) {
      logger.warn({ intervalMs: env.autoRunIntervalMs }, "auto-run skipped overlapping tick");
      return;
    }

    isRunning = true;
    try {
      for (const cityCode of cityCodes) {
        const context = buildAutoRunContext(cityCode);
        await runStep("dispatch", cityCode, context, logger);
        await runStep("dispatch.match", cityCode, context, logger);
        await runStep("ledger", cityCode, context, logger);
        await runStep("settlement.prepare", cityCode, context, logger);
      }
    } finally {
      isRunning = false;
    }
  };

  const interval = setInterval(() => {
    void runOnce();
  }, env.autoRunIntervalMs);

  logger.info(
    { enabled: true, intervalMs: env.autoRunIntervalMs, cityCodes },
    "auto-run started",
  );

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(interval);
      logger.info({ cityCodes }, "auto-run stopped");
    },
  };
}
