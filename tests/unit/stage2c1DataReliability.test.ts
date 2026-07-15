import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assessDataReliability,
  assessJobWorkerHeartbeat,
  collectDataReliabilitySnapshot,
  DATA_RELIABILITY_SNAPSHOT_KEY,
  JOB_WORKER_HEARTBEAT_KEY,
  MAX_RELIABILITY_CITIES,
  publishDataReliabilitySnapshot,
  publishJobWorkerHeartbeat,
  readSharedDataReliabilitySnapshot,
  readSharedJobWorkerHeartbeat,
  recordDataReliabilitySnapshot,
  resetDataReliabilityForTests,
  type DataReliabilitySnapshot,
} from "../../backend/src/observability/dataReliability.js";
import {
  MAX_JOB_METRIC_CITIES,
  getJobWorkerHeartbeatStatus,
  recordDataReliabilityMetrics,
  recordJobRun,
  recordJobWorkerHeartbeat,
  recordOutboxLeasesReaped,
  renderPrometheusMetrics,
  resetMetricsForTests,
} from "../../backend/src/observability/metrics.js";

class FakeSharedStore {
  readonly values = new Map<string, string>();
  readonly writes: Array<{ key: string; mode: string; ttlSeconds: number }> = [];

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<string> {
    this.values.set(key, value);
    this.writes.push({ key, mode, ttlSeconds });
    return "OK";
  }
}

function snapshot(overrides: Partial<DataReliabilitySnapshot> = {}): DataReliabilitySnapshot {
  return {
    observedAt: "2026-07-15T08:00:00.000Z",
    cities: [{
      cityCode: "hangzhou",
      outbox: {
        statusCounts: {
          pending: 3,
          processing: 1,
          retry_wait: 2,
          published: 10,
          dead_letter: 0,
        },
        oldestEligibleAgeSeconds: 30,
        expiredProcessingLeases: 0,
      },
      dispatchStream: { length: 12, consumerGroups: 1 },
    }],
    migrations: { appliedCount: 58, latestVersion: "058_stage2a" },
    ...overrides,
  };
}

describe("Stage 2C-1 data reliability observability", () => {
  afterEach(() => {
    resetMetricsForTests();
    resetDataReliabilityForTests();
  });

  it("collects city-scoped, index-backed snapshots outside the health request path", async () => {
    const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
    const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes("GROUP BY status")) {
        return [{ status: "pending", total: 4 }, { status: "processing", total: 2 }];
      }
      if (sql.includes("status=?")) {
        return params[1] === "pending"
          ? [{ created_at: new Date("2026-07-15T07:58:00.000Z") }]
          : [{ created_at: new Date("2026-07-15T07:59:00.000Z") }];
      }
      if (sql.includes("idx_event_outbox_lease_reaper")) return [{ total: 1 }];
      if (sql.includes("schema_migrations")) {
        return [{ applied_count: 58, latest_version: "058_stage2a" }];
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const streamLength = vi.fn().mockResolvedValue(42);
    const streamConsumerGroups = vi.fn().mockResolvedValue(2);

    const result = await collectDataReliabilitySnapshot(["Hangzhou", "hangzhou"], {
      query,
      streamLength,
      streamConsumerGroups,
      now: () => new Date("2026-07-15T08:00:00.000Z"),
    });

    expect(result).toEqual(snapshot({
      cities: [{
        cityCode: "hangzhou",
        outbox: {
          statusCounts: { pending: 4, processing: 2, retry_wait: 0, published: 0, dead_letter: 0 },
          oldestEligibleAgeSeconds: 120,
          expiredProcessingLeases: 1,
        },
        dispatchStream: { length: 42, consumerGroups: 2 },
      }],
    }));
    expect(streamLength).toHaveBeenCalledWith("xlb:dispatch:hangzhou:orders");
    expect(streamConsumerGroups).toHaveBeenCalledWith("xlb:dispatch:hangzhou:orders");
    expect(queries.every(({ params }) => !params.includes("__global__"))).toBe(true);
    expect(queries.some(({ sql }) => sql.includes("FORCE INDEX (idx_event_outbox_claim)"))).toBe(true);
    expect(queries.some(({ sql }) => sql.includes("FORCE INDEX (idx_event_outbox_lease_reaper)"))).toBe(true);
  });

  it("rejects unbounded configured-city cardinality", async () => {
    const cities = Array.from({ length: MAX_RELIABILITY_CITIES + 1 }, (_, index) => `city${index}`);
    await expect(collectDataReliabilitySnapshot(cities, {
      query: vi.fn(),
      streamLength: vi.fn(),
      streamConsumerGroups: vi.fn(),
    })).rejects.toThrow(`exceeds ${MAX_RELIABILITY_CITIES}`);
  });

  it("distinguishes fresh, degraded, stale and unavailable reliability", () => {
    const now = new Date("2026-07-15T08:01:00.000Z");
    expect(assessDataReliability(snapshot(), now)).toMatchObject({ state: "fresh", ready: true });
    expect(assessDataReliability(snapshot({
      cities: [{
        ...snapshot().cities[0]!,
        outbox: { ...snapshot().cities[0]!.outbox, expiredProcessingLeases: 1 },
      }],
    }), now)).toMatchObject({
      state: "degraded",
      ready: false,
      reasons: ["hangzhou:expired_processing_leases"],
    });
    expect(assessDataReliability(snapshot(), new Date("2026-07-15T08:03:00.001Z"))).toMatchObject({
      state: "stale",
      ready: false,
      reasons: ["snapshot_stale"],
    });
    expect(assessDataReliability(null, now)).toMatchObject({
      state: "unavailable",
      ready: false,
    });
  });

  it("shares snapshots and worker heartbeats across processes with bounded Redis TTLs", async () => {
    const store = new FakeSharedStore();
    await publishDataReliabilitySnapshot(snapshot(), { store, ttlSeconds: 5 });
    await publishJobWorkerHeartbeat(new Date("2026-07-15T08:00:00.000Z"), {
      store,
      ttlSeconds: 99_999,
    });
    expect(store.writes).toEqual([
      { key: DATA_RELIABILITY_SNAPSHOT_KEY, mode: "EX", ttlSeconds: 30 },
      { key: JOB_WORKER_HEARTBEAT_KEY, mode: "EX", ttlSeconds: 3_600 },
    ]);

    // Simulate a different backend process: no in-memory snapshot exists, but
    // the TTL record remains in the shared Redis store.
    resetDataReliabilityForTests();
    await expect(readSharedDataReliabilitySnapshot({ store })).resolves.toMatchObject({
      observedAt: "2026-07-15T08:00:00.000Z",
      cities: [{ cityCode: "hangzhou" }],
    });
    const heartbeat = await readSharedJobWorkerHeartbeat({ store });
    expect(assessJobWorkerHeartbeat(
      heartbeat,
      new Date("2026-07-15T08:01:00.000Z"),
    )).toMatchObject({ state: "fresh", ageSeconds: 60 });

    store.values.set(DATA_RELIABILITY_SNAPSHOT_KEY, "not-json");
    await expect(readSharedDataReliabilitySnapshot({ store })).resolves.toBeNull();
  });

  it("exports bounded job, heartbeat, lease and backlog metrics, then resets them", () => {
    recordOutboxLeasesReaped("hangzhou", 3);
    for (let index = 0; index < MAX_JOB_METRIC_CITIES + 8; index += 1) {
      recordJobRun({ cityCode: `city${index}`, step: "dispatch", outcome: "success", durationMs: 2 });
    }
    recordJobRun({ cityCode: "hangzhou", step: "caller-controlled", outcome: "unknown", durationMs: -1 });
    recordJobWorkerHeartbeat(new Date("2026-07-15T08:00:00.000Z"));
    recordDataReliabilityMetrics(snapshot());

    const output = renderPrometheusMetrics();
    const jobSeries = output.split("\n").filter((line) => line.startsWith("xlb_job_runs_total{"));
    const distinctCities = new Set(jobSeries.map((line) => line.match(/city="([^"]+)"/u)?.[1]));
    expect(distinctCities.size).toBeLessThanOrEqual(MAX_JOB_METRIC_CITIES);
    expect(output).toContain('city="__overflow__"');
    expect(output).toContain('step="other",outcome="failed"');
    expect(output).toContain('xlb_outbox_leases_reaped_total{city="hangzhou"} 3');
    expect(output).toContain("xlb_job_worker_last_heartbeat_timestamp_seconds 1784102400");
    expect(output).toContain('xlb_outbox_events{city="hangzhou",status="pending"} 3');
    expect(output).toContain('xlb_dispatch_stream_consumer_groups{city="hangzhou"} 1');
    expect(output).toContain('xlb_schema_migration_latest_info{version="058_stage2a"} 1');
    expect(getJobWorkerHeartbeatStatus(new Date("2026-07-15T08:01:00.000Z"))).toMatchObject({
      state: "fresh",
      ageSeconds: 60,
    });

    resetMetricsForTests();
    const reset = renderPrometheusMetrics();
    expect(reset).not.toContain("xlb_job_runs_total{");
    expect(reset).not.toContain("xlb_outbox_events{");
    expect(reset).toContain("xlb_data_reliability_ready 0");
    expect(getJobWorkerHeartbeatStatus()).toMatchObject({ state: "unavailable" });
  });

  it("normalizes and bounds externally recorded snapshot labels", () => {
    recordDataReliabilitySnapshot(snapshot({
      cities: [{ ...snapshot().cities[0]!, cityCode: "Hangzhou" }],
      migrations: { appliedCount: 58, latestVersion: "x".repeat(100) },
    }));
    const output = renderPrometheusMetrics();
    expect(output).toContain('xlb_outbox_events{city="hangzhou",status="pending"}');
    expect(output).toContain(`version="${"x".repeat(64)}"`);
    expect(output).not.toContain(`version="${"x".repeat(65)}`);
  });
});
