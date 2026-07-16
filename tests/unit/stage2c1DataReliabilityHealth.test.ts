import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DATA_RELIABILITY_SNAPSHOT_KEY,
  JOB_WORKER_HEARTBEAT_KEY,
  resetDataReliabilityForTests,
  type DataReliabilitySnapshot,
} from "../../backend/src/observability/dataReliability.js";

const mocks = vi.hoisted(() => ({
  pingMysql: vi.fn(),
  pingRedis: vi.fn(),
  get: vi.fn(),
}));

vi.mock("../../backend/src/dal/db.js", () => ({ pingMysql: mocks.pingMysql }));
vi.mock("../../backend/src/dal/redisClient.js", () => ({
  pingRedis: mocks.pingRedis,
  getRedisClient: () => ({ get: mocks.get }),
}));

import { checkDbHealth } from "../../backend/src/observability/health.js";

describe("Stage 2C-1 cross-process reliability health", () => {
  beforeEach(() => {
    resetDataReliabilityForTests();
    mocks.pingMysql.mockReset().mockResolvedValue(true);
    mocks.pingRedis.mockReset().mockResolvedValue(true);
    mocks.get.mockReset();
  });

  it("reads only TTL-backed shared state and keeps connectivity health independent", async () => {
    const observedAt = new Date().toISOString();
    const snapshot: DataReliabilitySnapshot = {
      observedAt,
      cities: [{
        cityCode: "hangzhou",
        outbox: {
          statusCounts: { pending: 0, processing: 0, retry_wait: 0, published: 1, dead_letter: 0 },
          stalledTransactionalRows: 0,
          oldestEligibleAgeSeconds: null,
          expiredProcessingLeases: 0,
        },
        dispatchStream: { length: 1, consumerGroups: 0 },
      }],
      migrations: { appliedCount: 58, latestVersion: "058_stage2a" },
    };
    mocks.get.mockImplementation(async (key: string) => {
      if (key === DATA_RELIABILITY_SNAPSHOT_KEY) return JSON.stringify(snapshot);
      if (key === JOB_WORKER_HEARTBEAT_KEY) return JSON.stringify({ observedAt });
      return null;
    });

    const health = await checkDbHealth();

    expect(health).toMatchObject({
      ok: true,
      mysql: "ok",
      redis: "ok",
      dataReliability: { state: "fresh", ready: true },
      jobWorker: { state: "fresh" },
    });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("does not read observability cache or alter connectivity semantics when Redis is down", async () => {
    mocks.pingRedis.mockResolvedValue(false);
    const health = await checkDbHealth();
    expect(health.ok).toBe(false);
    expect(health.dataReliability.state).toBe("unavailable");
    expect(health.jobWorker.state).toBe("unavailable");
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
