import { cityCodeSchema } from "@xlb/validators";
import { getMysqlPool } from "../dal/mysqlPool.js";
import { getRedisClient } from "../dal/redisClient.js";
import { getDispatchStreamName } from "../streams/cityStreamNames.js";
import { TRANSACTIONAL_OUTBOX_EVENT_TYPES } from "../streams/outboxEventCatalog.js";

export const OUTBOX_RELIABILITY_STATUSES = [
  "pending",
  "processing",
  "retry_wait",
  "published",
  "dead_letter",
] as const;

export type OutboxReliabilityStatus = typeof OUTBOX_RELIABILITY_STATUSES[number];

export type CityDataReliabilitySnapshot = {
  cityCode: string;
  outbox: {
    statusCounts: Record<OutboxReliabilityStatus, number>;
    stalledTransactionalRows: number;
    oldestEligibleAgeSeconds: number | null;
    expiredProcessingLeases: number;
  };
  dispatchStream: {
    length: number;
    consumerGroups: number;
  };
};

export type DataReliabilitySnapshot = {
  observedAt: string;
  cities: CityDataReliabilitySnapshot[];
  migrations: {
    appliedCount: number;
    latestVersion: string | null;
  };
};

export type DataReliabilityThresholds = {
  maxSnapshotAgeMs: number;
  maxOldestEligibleAgeSeconds: number;
  maxExpiredProcessingLeases: number;
  maxStalledTransactionalRows: number;
};

export type DataReliabilityAssessment = {
  state: "unavailable" | "fresh" | "degraded" | "stale";
  ready: boolean;
  observedAt: string | null;
  snapshotAgeSeconds: number | null;
  reasons: string[];
};

export const DEFAULT_DATA_RELIABILITY_THRESHOLDS: DataReliabilityThresholds = {
  maxSnapshotAgeMs: 120_000,
  maxOldestEligibleAgeSeconds: 300,
  maxExpiredProcessingLeases: 0,
  maxStalledTransactionalRows: 0,
};

export const MAX_RELIABILITY_CITIES = 32;
export const DATA_RELIABILITY_SNAPSHOT_KEY = "xlb:observability:data-reliability:v1";
export const JOB_WORKER_HEARTBEAT_KEY = "xlb:observability:job-worker-heartbeat:v1";
export const DEFAULT_SHARED_OBSERVABILITY_TTL_SECONDS = 300;

type QueryRows = ReadonlyArray<Record<string, unknown>>;

export type DataReliabilityCollectorDependencies = {
  query?: (sql: string, params?: readonly unknown[]) => Promise<QueryRows>;
  streamLength?: (streamName: string) => Promise<number>;
  streamConsumerGroups?: (streamName: string) => Promise<number>;
  now?: () => Date;
};

export type SharedObservabilityStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>;
};

export type JobWorkerHeartbeat = {
  observedAt: string;
};

let latestSnapshot: DataReliabilitySnapshot | null = null;

function emptyStatusCounts(): Record<OutboxReliabilityStatus, number> {
  return {
    pending: 0,
    processing: 0,
    retry_wait: 0,
    published: 0,
    dead_letter: 0,
  };
}

function safeNonNegativeNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function normalizeTtlSeconds(ttlSeconds: number): number {
  if (!Number.isFinite(ttlSeconds)) return DEFAULT_SHARED_OBSERVABILITY_TTL_SECONDS;
  return Math.max(30, Math.min(3_600, Math.trunc(ttlSeconds)));
}

function normalizeCityCodes(cityCodes: readonly string[]): string[] {
  const normalized = [...new Set(cityCodes.map((cityCode) => cityCode.trim().toLowerCase()))];
  if (normalized.length === 0) throw new Error("at least one reliability city is required");
  if (normalized.length > MAX_RELIABILITY_CITIES) {
    throw new Error(`reliability city count exceeds ${MAX_RELIABILITY_CITIES}`);
  }
  for (const cityCode of normalized) {
    if (!cityCodeSchema.safeParse(cityCode).success) {
      throw new Error(`invalid reliability city: ${cityCode}`);
    }
  }
  return normalized;
}

async function defaultQuery(sql: string, params: readonly unknown[] = []): Promise<QueryRows> {
  const [rows] = await getMysqlPool().query(sql, [...params]);
  return rows as QueryRows;
}

async function defaultStreamLength(streamName: string): Promise<number> {
  return getRedisClient().xlen(streamName);
}

async function defaultStreamConsumerGroups(streamName: string): Promise<number> {
  try {
    const groups = await getRedisClient().xinfo("GROUPS", streamName);
    return Array.isArray(groups) ? groups.length : 0;
  } catch {
    // XINFO reports an error when the stream key has never existed. XLEN is
    // collected independently and still surfaces real Redis connectivity loss.
    return 0;
  }
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

async function collectCitySnapshot(
  cityCode: string,
  observedAt: Date,
  dependencies: Required<Omit<DataReliabilityCollectorDependencies, "now">>,
): Promise<CityDataReliabilitySnapshot> {
  const transactionalPlaceholders = TRANSACTIONAL_OUTBOX_EVENT_TYPES.map(() => "?").join(",");
  const statusCounts = emptyStatusCounts();
  const statusRows = await dependencies.query(
    `SELECT status, COUNT(*) AS total
       FROM event_outbox e FORCE INDEX (idx_event_outbox_typed_claim)
      WHERE e.city_code=? AND e.event_type IN (${transactionalPlaceholders})
      GROUP BY status`,
    [cityCode, ...TRANSACTIONAL_OUTBOX_EVENT_TYPES],
  );
  for (const row of statusRows) {
    const status = String(row.status ?? "") as OutboxReliabilityStatus;
    if (OUTBOX_RELIABILITY_STATUSES.includes(status)) {
      statusCounts[status] = safeNonNegativeNumber(row.total);
    }
  }

  // Keep these eligibility joins aligned with EventOutboxRepository.claim().
  // Separate event-type reads avoid the former cross-type OR/EXISTS plan, which
  // scanned the full source-record history on every snapshot. Aggregate-first
  // dispatch lookup also skips historical order.created rows efficiently.
  const eligibleDates: Date[] = [];
  const eligibleQueries: ReadonlyArray<{ sql: string; params: readonly unknown[] }> = [
    {
      sql: `SELECT COUNT(*) AS state_eligible_total,
                   SUM(CASE WHEN e.available_at<=CURRENT_TIMESTAMP(3)
                                  AND e.attempt_count<e.max_attempts THEN 1 ELSE 0 END) AS total,
                   MIN(CASE WHEN e.available_at<=CURRENT_TIMESTAMP(3)
                                  AND e.attempt_count<e.max_attempts THEN e.created_at END) AS created_at
              FROM orders o FORCE INDEX (idx_orders_status)
              STRAIGHT_JOIN event_outbox e FORCE INDEX (idx_event_outbox_aggregate_id)
                ON e.aggregate_id=o.order_id AND e.city_code=o.city_code
               AND e.event_type='order.created'
             WHERE o.city_code=? AND o.status='pending_dispatch'
               AND e.status IN ('pending','retry_wait')
            `,
      params: [cityCode],
    },
    {
      sql: `SELECT COUNT(*) AS state_eligible_total,
                   SUM(CASE WHEN e.available_at<=CURRENT_TIMESTAMP(3)
                                  AND e.attempt_count<e.max_attempts THEN 1 ELSE 0 END) AS total,
                   MIN(CASE WHEN e.available_at<=CURRENT_TIMESTAMP(3)
                                  AND e.attempt_count<e.max_attempts THEN e.created_at END) AS created_at
              FROM event_outbox e FORCE INDEX (idx_event_outbox_typed_claim)
              INNER JOIN fulfillments f
                ON f.city_code=e.city_code AND f.fulfillment_id=e.aggregate_id
              INNER JOIN orders o
                ON o.city_code=f.city_code AND o.order_id=f.order_id
              INNER JOIN payment_orders p FORCE INDEX (idx_payment_orders_city_order_status)
                ON p.city_code=o.city_code AND p.order_id=o.order_id AND p.status='paid'
             WHERE e.city_code=? AND e.event_type='fulfillment.completed'
               AND e.status IN ('pending','retry_wait')
               AND f.status='completed' AND o.status='paid'
            `,
      params: [cityCode],
    },
    {
      sql: `SELECT COUNT(*) AS state_eligible_total,
                   SUM(CASE WHEN e.available_at<=CURRENT_TIMESTAMP(3)
                                  AND e.attempt_count<e.max_attempts THEN 1 ELSE 0 END) AS total,
                   MIN(CASE WHEN e.available_at<=CURRENT_TIMESTAMP(3)
                                  AND e.attempt_count<e.max_attempts THEN e.created_at END) AS created_at
              FROM event_outbox e FORCE INDEX (idx_event_outbox_typed_claim)
             WHERE e.city_code=? AND e.event_type='refund.approved'
               AND e.status IN ('pending','retry_wait')
            `,
      params: [cityCode],
    },
  ];
  let claimableRows = 0;
  let stateEligibleRows = 0;
  for (const eligibleQuery of eligibleQueries) {
    const rows = await dependencies.query(eligibleQuery.sql, eligibleQuery.params);
    claimableRows += safeNonNegativeNumber(rows[0]?.total);
    stateEligibleRows += safeNonNegativeNumber(rows[0]?.state_eligible_total);
    const createdAt = parseDate(rows[0]?.created_at);
    if (createdAt) eligibleDates.push(createdAt);
  }
  const oldestEligible = eligibleDates.sort((left, right) => left.getTime() - right.getTime())[0];
  const oldestEligibleAgeSeconds = oldestEligible
    ? Math.max(0, Math.floor((observedAt.getTime() - oldestEligible.getTime()) / 1_000))
    : null;
  const stalledTransactionalRows = Math.max(
    0,
    statusCounts.pending + statusCounts.retry_wait - stateEligibleRows,
  );

  const expiredRows = await dependencies.query(
    `SELECT COUNT(*) AS total
      FROM event_outbox FORCE INDEX (idx_event_outbox_lease_reaper)
      WHERE city_code=? AND status='processing'
        AND lease_expires_at<=CURRENT_TIMESTAMP(3)
        AND event_type IN (${transactionalPlaceholders})`,
    [cityCode, ...TRANSACTIONAL_OUTBOX_EVENT_TYPES],
  );
  const streamName = getDispatchStreamName(cityCode);
  const [streamLength, consumerGroups] = await Promise.all([
    dependencies.streamLength(streamName),
    dependencies.streamConsumerGroups(streamName),
  ]);

  return {
    cityCode,
    outbox: {
      statusCounts,
      stalledTransactionalRows,
      oldestEligibleAgeSeconds,
      expiredProcessingLeases: safeNonNegativeNumber(expiredRows[0]?.total),
    },
    dispatchStream: {
      length: safeNonNegativeNumber(streamLength),
      consumerGroups: safeNonNegativeNumber(consumerGroups),
    },
  };
}

export async function collectDataReliabilitySnapshot(
  cityCodes: readonly string[],
  dependencies: DataReliabilityCollectorDependencies = {},
): Promise<DataReliabilitySnapshot> {
  const cities = normalizeCityCodes(cityCodes);
  const observedAt = dependencies.now?.() ?? new Date();
  const collectorDependencies = {
    query: dependencies.query ?? defaultQuery,
    streamLength: dependencies.streamLength ?? defaultStreamLength,
    streamConsumerGroups: dependencies.streamConsumerGroups ?? defaultStreamConsumerGroups,
  };
  const citySnapshots: CityDataReliabilitySnapshot[] = [];
  // Deliberately serial: monitoring must not consume one DB/Redis connection
  // burst per configured city.
  for (const cityCode of cities) {
    citySnapshots.push(await collectCitySnapshot(cityCode, observedAt, collectorDependencies));
  }
  const migrationRows = await collectorDependencies.query(
    `SELECT COUNT(*) AS applied_count,
            (SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1) AS latest_version
       FROM schema_migrations`,
  );
  return {
    observedAt: observedAt.toISOString(),
    cities: citySnapshots,
    migrations: {
      appliedCount: safeNonNegativeNumber(migrationRows[0]?.applied_count),
      latestVersion: migrationRows[0]?.latest_version == null
        ? null
        : String(migrationRows[0].latest_version).slice(0, 64),
    },
  };
}

export function recordDataReliabilitySnapshot(snapshot: DataReliabilitySnapshot): void {
  const cities = normalizeCityCodes(snapshot.cities.map((city) => city.cityCode));
  if (cities.length !== snapshot.cities.length) {
    throw new Error("reliability snapshot contains duplicate cities");
  }
  const observedAt = parseDate(snapshot.observedAt);
  if (!observedAt) throw new Error("reliability snapshot timestamp is invalid");
  latestSnapshot = {
    observedAt: observedAt.toISOString(),
    cities: snapshot.cities.map((city, index) => ({
      cityCode: cities[index] as string,
      outbox: {
        statusCounts: Object.fromEntries(
          OUTBOX_RELIABILITY_STATUSES.map((status) => [
            status,
            safeNonNegativeNumber(city.outbox.statusCounts[status]),
          ]),
        ) as Record<OutboxReliabilityStatus, number>,
        stalledTransactionalRows: safeNonNegativeNumber(city.outbox.stalledTransactionalRows),
        oldestEligibleAgeSeconds: city.outbox.oldestEligibleAgeSeconds === null
          ? null
          : safeNonNegativeNumber(city.outbox.oldestEligibleAgeSeconds),
        expiredProcessingLeases: safeNonNegativeNumber(city.outbox.expiredProcessingLeases),
      },
      dispatchStream: {
        length: safeNonNegativeNumber(city.dispatchStream.length),
        consumerGroups: safeNonNegativeNumber(city.dispatchStream.consumerGroups),
      },
    })),
    migrations: {
      appliedCount: safeNonNegativeNumber(snapshot.migrations.appliedCount),
      latestVersion: snapshot.migrations.latestVersion?.slice(0, 64) ?? null,
    },
  };
}

export function getDataReliabilitySnapshot(): DataReliabilitySnapshot | null {
  return latestSnapshot;
}

export async function publishDataReliabilitySnapshot(
  snapshot: DataReliabilitySnapshot,
  options: { store?: SharedObservabilityStore; ttlSeconds?: number } = {},
): Promise<void> {
  recordDataReliabilitySnapshot(snapshot);
  const normalized = getDataReliabilitySnapshot();
  if (!normalized) throw new Error("reliability snapshot normalization failed");
  const store = options.store ?? getRedisClient();
  await store.set(
    DATA_RELIABILITY_SNAPSHOT_KEY,
    JSON.stringify(normalized),
    "EX",
    normalizeTtlSeconds(options.ttlSeconds ?? DEFAULT_SHARED_OBSERVABILITY_TTL_SECONDS),
  );
}

export async function readSharedDataReliabilitySnapshot(
  options: { store?: SharedObservabilityStore } = {},
): Promise<DataReliabilitySnapshot | null> {
  try {
    const store = options.store ?? getRedisClient();
    const encoded = await store.get(DATA_RELIABILITY_SNAPSHOT_KEY);
    if (!encoded) return null;
    recordDataReliabilitySnapshot(JSON.parse(encoded) as DataReliabilitySnapshot);
    return getDataReliabilitySnapshot();
  } catch {
    // Shared observability is a cache. Corruption or expiry must not replace
    // MySQL/Redis connectivity as the health endpoint's availability signal.
    return null;
  }
}

export async function publishJobWorkerHeartbeat(
  observedAt: Date = new Date(),
  options: { store?: SharedObservabilityStore; ttlSeconds?: number } = {},
): Promise<JobWorkerHeartbeat> {
  if (!Number.isFinite(observedAt.getTime())) throw new Error("job worker heartbeat timestamp is invalid");
  const heartbeat = { observedAt: observedAt.toISOString() };
  const store = options.store ?? getRedisClient();
  await store.set(
    JOB_WORKER_HEARTBEAT_KEY,
    JSON.stringify(heartbeat),
    "EX",
    normalizeTtlSeconds(options.ttlSeconds ?? DEFAULT_SHARED_OBSERVABILITY_TTL_SECONDS),
  );
  return heartbeat;
}

export async function readSharedJobWorkerHeartbeat(
  options: { store?: SharedObservabilityStore } = {},
): Promise<JobWorkerHeartbeat | null> {
  try {
    const store = options.store ?? getRedisClient();
    const encoded = await store.get(JOB_WORKER_HEARTBEAT_KEY);
    if (!encoded) return null;
    const parsed = JSON.parse(encoded) as Partial<JobWorkerHeartbeat>;
    const observedAt = parseDate(parsed.observedAt);
    return observedAt ? { observedAt: observedAt.toISOString() } : null;
  } catch {
    return null;
  }
}

export function assessJobWorkerHeartbeat(
  heartbeat: JobWorkerHeartbeat | null,
  now: Date = new Date(),
  maxAgeMs = 120_000,
): { state: "unavailable" | "fresh" | "stale"; ageSeconds: number | null; observedAt: string | null } {
  if (!heartbeat) return { state: "unavailable", ageSeconds: null, observedAt: null };
  const observedAt = parseDate(heartbeat.observedAt);
  if (!observedAt) return { state: "stale", ageSeconds: null, observedAt: heartbeat.observedAt };
  const ageMs = Math.max(0, now.getTime() - observedAt.getTime());
  return {
    state: ageMs > maxAgeMs ? "stale" : "fresh",
    ageSeconds: ageMs / 1_000,
    observedAt: observedAt.toISOString(),
  };
}

export function assessDataReliability(
  snapshot: DataReliabilitySnapshot | null = latestSnapshot,
  now = new Date(),
  thresholds: DataReliabilityThresholds = DEFAULT_DATA_RELIABILITY_THRESHOLDS,
): DataReliabilityAssessment {
  if (!snapshot) {
    return {
      state: "unavailable",
      ready: false,
      observedAt: null,
      snapshotAgeSeconds: null,
      reasons: ["snapshot_unavailable"],
    };
  }
  const observedAt = parseDate(snapshot.observedAt);
  if (!observedAt) {
    return {
      state: "stale",
      ready: false,
      observedAt: snapshot.observedAt,
      snapshotAgeSeconds: null,
      reasons: ["snapshot_timestamp_invalid"],
    };
  }
  const ageMs = Math.max(0, now.getTime() - observedAt.getTime());
  if (ageMs > thresholds.maxSnapshotAgeMs) {
    return {
      state: "stale",
      ready: false,
      observedAt: snapshot.observedAt,
      snapshotAgeSeconds: ageMs / 1_000,
      reasons: ["snapshot_stale"],
    };
  }
  const reasons: string[] = [];
  for (const city of snapshot.cities) {
    if (
      city.outbox.oldestEligibleAgeSeconds !== null
      && city.outbox.oldestEligibleAgeSeconds > thresholds.maxOldestEligibleAgeSeconds
    ) reasons.push(`${city.cityCode}:outbox_backlog_old`);
    if (city.outbox.expiredProcessingLeases > thresholds.maxExpiredProcessingLeases) {
      reasons.push(`${city.cityCode}:expired_processing_leases`);
    }
    if (city.outbox.stalledTransactionalRows > thresholds.maxStalledTransactionalRows) {
      reasons.push(`${city.cityCode}:stalled_transactional_outbox`);
    }
  }
  return {
    state: reasons.length === 0 ? "fresh" : "degraded",
    ready: reasons.length === 0,
    observedAt: snapshot.observedAt,
    snapshotAgeSeconds: ageMs / 1_000,
    reasons,
  };
}

export function resetDataReliabilityForTests(): void {
  latestSnapshot = null;
}
