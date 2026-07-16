import type { EnvConfig } from "@xlb/config";
import { describe, expect, it, vi } from "vitest";
import { createJobWorker, main, type JobWorkerLogger } from "../../backend/src/jobWorker.js";

function buildEnv(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    nodeEnv: "development",
    backendPort: 3000,
    autoRunEnabled: true,
    autoRunIntervalMs: 8_000,
    autoRunCityCodes: ["hangzhou"],
    mysqlHost: "127.0.0.1",
    mysqlPort: 3306,
    mysqlDatabase: "xlb_test",
    mysqlUser: "xlb",
    mysqlPassword: "test-password",
    mysqlTlsEnabled: false,
    mysqlTlsCa: "",
    redisHost: "127.0.0.1",
    redisPort: 6379,
    redisPassword: "",
    redisTlsEnabled: false,
    redisTlsCa: "",
    rateLimitBackend: "memory",
    trustProxyHops: 0,
    jwtSecret: "test-secret",
    jwtIssuer: "xlb-backend",
    jwtAudience: "xlb-apps",
    jwtActiveKeyId: "primary",
    jwtKeys: { primary: "test-secret" },
    jwtTtlSeconds: 86_400,
    authPhoneHashSecret: "test-phone-secret",
    authOtpPepper: "test-otp-pepper",
    authOtpTtlSeconds: 300,
    authOtpMaxAttempts: 5,
    authOtpLockSeconds: 900,
    authOtpResendCooldownSeconds: 60,
    authDebugCodeEnabled: false,
    ...overrides,
  };
}

function buildLogger(): JobWorkerLogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("stage 2C-1 dedicated job worker", () => {
  it("starts auto-run once and closes both data clients on repeated shutdown", async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const runOnce = vi.fn().mockResolvedValue(undefined);
    const startJobs = vi.fn().mockReturnValue({ stop, runOnce });
    const closeMysql = vi.fn().mockResolvedValue(undefined);
    const closeRedis = vi.fn().mockResolvedValue(undefined);
    const streamRuntime = {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const worker = createJobWorker({
      env: buildEnv(),
      logger: buildLogger(),
      startJobs,
      streamRuntime,
      streamHandler: vi.fn().mockResolvedValue(undefined),
      streamConsumerName: "worker-test",
      closeMysql,
      closeRedis,
    });

    worker.start();
    worker.start();
    await Promise.all([worker.shutdown("SIGTERM"), worker.shutdown("SIGTERM")]);

    expect(startJobs).toHaveBeenCalledTimes(1);
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(streamRuntime.start).toHaveBeenCalledTimes(1);
    expect(streamRuntime.stop).toHaveBeenCalledTimes(1);
    expect(closeMysql).toHaveBeenCalledTimes(1);
    expect(closeRedis).toHaveBeenCalledTimes(1);
  });

  it("fails fast instead of running a silent disabled worker", () => {
    const disabled = createJobWorker({ env: buildEnv({ autoRunEnabled: false }) });
    expect(() => disabled.start()).toThrow("AUTO_RUN_ENABLED=true");

    const withoutCities = createJobWorker({ env: buildEnv({ autoRunCityCodes: [] }) });
    expect(() => withoutCities.start()).toThrow("AUTO_RUN_CITY_CODES");

    const invalidInterval = createJobWorker({ env: buildEnv({ autoRunIntervalMs: 0 }) });
    expect(() => invalidInterval.start()).toThrow("AUTO_RUN_INTERVAL_MS");
  });

  it("attempts every resource cleanup and reports aggregate failure", async () => {
    const closeMysql = vi.fn().mockRejectedValue(new Error("mysql close failed"));
    const closeRedis = vi.fn().mockResolvedValue(undefined);
    const worker = createJobWorker({
      env: buildEnv(),
      logger: buildLogger(),
      startJobs: () => ({
        stop: vi.fn().mockResolvedValue(undefined),
        runOnce: vi.fn().mockResolvedValue(undefined),
      }),
      streamRuntime: { start: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) },
      streamHandler: vi.fn().mockResolvedValue(undefined),
      closeMysql,
      closeRedis,
    });
    worker.start();

    await expect(worker.shutdown("SIGINT")).rejects.toThrow("resource cleanup failed");
    expect(closeMysql).toHaveBeenCalledOnce();
    expect(closeRedis).toHaveBeenCalledOnce();
  });

  it("registers both signals and performs graceful cleanup when one fires", async () => {
    const listeners = new Map<NodeJS.Signals, () => void>();
    const processLike = {
      exitCode: undefined as number | undefined,
      once: vi.fn((signal: NodeJS.Signals, listener: () => void) => {
        listeners.set(signal, listener);
      }),
      off: vi.fn((signal: NodeJS.Signals) => {
        listeners.delete(signal);
      }),
    };
    const stop = vi.fn().mockResolvedValue(undefined);
    const closeMysql = vi.fn().mockResolvedValue(undefined);
    const closeRedis = vi.fn().mockResolvedValue(undefined);
    const streamRuntime = { start: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) };

    await main({
      env: buildEnv(),
      logger: buildLogger(),
      processLike,
      startJobs: () => ({ stop, runOnce: vi.fn().mockResolvedValue(undefined) }),
      streamRuntime,
      streamHandler: vi.fn().mockResolvedValue(undefined),
      closeMysql,
      closeRedis,
    });
    listeners.get("SIGTERM")?.();
    await vi.waitFor(() => {
      expect(closeRedis).toHaveBeenCalledOnce();
      expect(listeners.size).toBe(0);
    });

    expect(processLike.once).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledOnce();
    expect(streamRuntime.stop).toHaveBeenCalledOnce();
    expect(closeMysql).toHaveBeenCalledOnce();
    expect(processLike.exitCode).toBeUndefined();
  });
});
