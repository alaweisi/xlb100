import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import { loadEnv, type EnvConfig } from "@xlb/config";
import { closeMysqlPool } from "./dal/mysqlPool.js";
import { closeRedisClient } from "./dal/redisClient.js";
import { startAutoRunJobs, type AutoRunHandle } from "./jobs/autoRun.js";
import type { DispatchStreamHandler } from "./streams/dispatchStreamConsumer.js";
import { dispatchStreamDurableHandler } from "./streams/dispatchStreamDurableHandler.js";
import {
  dispatchStreamRuntime,
  type DispatchStreamRuntimeOptions,
} from "./streams/dispatchStreamRuntime.js";

export type JobWorkerLogger = {
  info: (payload: unknown, message?: string) => void;
  warn: (payload: unknown, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
};

export type JobWorkerRuntime = {
  start: () => void;
  shutdown: (signal: NodeJS.Signals) => Promise<void>;
};

type JobWorkerDependencies = {
  env?: EnvConfig;
  logger?: JobWorkerLogger;
  startJobs?: (options: { env: EnvConfig; logger: JobWorkerLogger }) => AutoRunHandle;
  streamRuntime?: {
    start: (options: DispatchStreamRuntimeOptions) => void;
    stop: () => Promise<void>;
  };
  streamHandler?: DispatchStreamHandler;
  streamConsumerName?: string;
  closeMysql?: () => Promise<void>;
  closeRedis?: () => Promise<void>;
};

type SignalProcess = {
  once: (signal: NodeJS.Signals, listener: () => void) => unknown;
  off: (signal: NodeJS.Signals, listener: () => void) => unknown;
  exitCode?: number;
};

type JobWorkerMainDependencies = JobWorkerDependencies & {
  processLike?: SignalProcess;
};

function writeStructuredLog(
  level: "info" | "warn" | "error",
  payload: unknown,
  message?: string,
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: message ?? "job worker event",
    payload,
  };
  const serialized = JSON.stringify(entry, (_key, value: unknown) => {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    return value;
  });
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.info(serialized);
}

export const jobWorkerConsoleLogger: JobWorkerLogger = {
  info: (payload, message) => writeStructuredLog("info", payload, message),
  warn: (payload, message) => writeStructuredLog("warn", payload, message),
  error: (payload, message) => writeStructuredLog("error", payload, message),
};

export function createJobWorker(dependencies: JobWorkerDependencies = {}): JobWorkerRuntime {
  const env = dependencies.env ?? loadEnv();
  const logger = dependencies.logger ?? jobWorkerConsoleLogger;
  const startJobs = dependencies.startJobs ?? startAutoRunJobs;
  const streamRuntime = dependencies.streamRuntime ?? dispatchStreamRuntime;
  const streamHandler = dependencies.streamHandler ?? dispatchStreamDurableHandler;
  const streamConsumerName = dependencies.streamConsumerName
    ?? `${hostname().replace(/[^A-Za-z0-9._-]/gu, "_")}-${process.pid}`;
  const closeMysql = dependencies.closeMysql ?? closeMysqlPool;
  const closeRedis = dependencies.closeRedis ?? closeRedisClient;
  let jobs: AutoRunHandle | null = null;
  let started = false;
  let shutdownPromise: Promise<void> | null = null;

  return {
    start: () => {
      if (started) return;
      if (!env.autoRunEnabled) {
        throw new Error("dedicated job worker requires AUTO_RUN_ENABLED=true");
      }
      if (env.autoRunCityCodes.length === 0) {
        throw new Error("dedicated job worker requires at least one AUTO_RUN_CITY_CODES value");
      }
      if (
        !Number.isInteger(env.autoRunIntervalMs)
        || env.autoRunIntervalMs < 1_000
        || env.autoRunIntervalMs > 60_000
      ) {
        throw new Error("dedicated job worker requires AUTO_RUN_INTERVAL_MS between 1000 and 60000");
      }
      streamRuntime.start({
        cityCodes: env.autoRunCityCodes,
        consumerName: streamConsumerName,
        handler: streamHandler,
        idleDelayMs: Math.min(env.autoRunIntervalMs, 1_000),
        onError: (error) => logger.error({ error }, "dispatch stream consumer cycle failed"),
      });
      try {
        jobs = startJobs({ env, logger });
      } catch (error) {
        void streamRuntime.stop();
        throw error;
      }
      started = true;
      void Promise.resolve(jobs.runOnce()).catch((error: unknown) => {
        logger.error({ error }, "dedicated job worker initial cycle failed");
      });
      logger.info(
        {
          intervalMs: env.autoRunIntervalMs,
          cityCodes: env.autoRunCityCodes,
          streamConsumerName,
        },
        "dedicated job worker started",
      );
    },
    shutdown: (signal) => {
      if (shutdownPromise) return shutdownPromise;
      shutdownPromise = (async () => {
        logger.info({ signal }, "dedicated job worker shutdown requested");
        const failures: unknown[] = [];
        try {
          await jobs?.stop();
        } catch (error) {
          failures.push(error);
        }
        try {
          await streamRuntime.stop();
        } catch (error) {
          failures.push(error);
        }
        const results = await Promise.allSettled([closeMysql(), closeRedis()]);
        failures.push(...results
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => result.reason));
        if (failures.length > 0) {
          throw new AggregateError(failures, "dedicated job worker resource cleanup failed");
        }
        logger.info({ signal }, "dedicated job worker shutdown completed");
      })();
      return shutdownPromise;
    },
  };
}

export async function main(
  dependencies: JobWorkerMainDependencies = {},
): Promise<JobWorkerRuntime> {
  const logger = dependencies.logger ?? jobWorkerConsoleLogger;
  const processLike = dependencies.processLike ?? process;
  const worker = createJobWorker({ ...dependencies, logger });
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  const listeners = new Map<NodeJS.Signals, () => void>();

  const removeSignalListeners = () => {
    for (const [signal, listener] of listeners) processLike.off(signal, listener);
    listeners.clear();
  };

  for (const signal of signals) {
    const listener = () => {
      void worker
        .shutdown(signal)
        .catch((error: unknown) => {
          processLike.exitCode = 1;
          logger.error({ signal, error }, "dedicated job worker shutdown failed");
        })
        .finally(removeSignalListeners);
    };
    listeners.set(signal, listener);
    processLike.once(signal, listener);
  }

  try {
    worker.start();
    return worker;
  } catch (error) {
    removeSignalListeners();
    throw error;
  }
}

function isEntrypoint(): boolean {
  const executable = process.argv[1];
  return executable !== undefined && fileURLToPath(import.meta.url) === executable;
}

if (isEntrypoint()) {
  void main().catch((error: unknown) => {
    process.exitCode = 1;
    jobWorkerConsoleLogger.error({ error }, "dedicated job worker failed to start");
  });
}
