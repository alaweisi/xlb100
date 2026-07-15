import {
  assessDataReliability,
  assessJobWorkerHeartbeat,
  getDataReliabilitySnapshot,
  OUTBOX_RELIABILITY_STATUSES,
  publishDataReliabilitySnapshot,
  publishJobWorkerHeartbeat,
  recordDataReliabilitySnapshot,
  resetDataReliabilityForTests,
  type DataReliabilitySnapshot,
} from "./dataReliability.js";

type HttpMetric = {
  count: number;
  durationMs: number;
};

export const MAX_HTTP_METRIC_SERIES = 256;
export const HTTP_METRIC_LABEL_NAMES = ["method", "route", "status"] as const;

const UNMATCHED_ROUTE = "__unmatched__";
const OVERFLOW_ROUTE = "__overflow__";
const OVERFLOW_KEY = JSON.stringify(["OTHER", OVERFLOW_ROUTE, "other"]);
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const STATUS_BUCKETS = new Set(["1xx", "2xx", "3xx", "4xx", "5xx", "other"]);
const ROUTE_SEGMENT = /^[a-z0-9._:-]+$/iu;

const httpMetrics = new Map<string, HttpMetric>();
let rateLimitRejections = 0;
let rateLimitBackendFailures = 0;
let webhookDelivered = 0;
let webhookRetries = 0;
let webhookBusyRuns = 0;

export const JOB_METRIC_STEPS = [
  "outbox.reap",
  "dispatch",
  "dispatch.match",
  "ledger",
  "settlement.prepare",
  "support.sla",
  "snapshot",
] as const;
export const JOB_METRIC_OUTCOMES = ["success", "failed", "busy"] as const;
export const MAX_JOB_METRIC_CITIES = 32;

export type JobMetricStep = typeof JOB_METRIC_STEPS[number];
export type JobMetricOutcome = typeof JOB_METRIC_OUTCOMES[number];

type JobMetric = {
  count: number;
  durationMs: number;
};

const jobMetrics = new Map<string, JobMetric>();
const jobMetricCities = new Set<string>();
const leaseReapedByCity = new Map<string, number>();
let jobWorkerHeartbeatAtMs: number | null = null;

function safeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

function normalizeMethod(method: string): string {
  const normalized = method.trim().toUpperCase();
  return ALLOWED_METHODS.has(normalized) ? normalized : "OTHER";
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function normalizeRouteTemplate(route: string | undefined): string {
  if (!route) return UNMATCHED_ROUTE;
  const normalized = route.trim();
  if (
    normalized.length === 0
    || normalized.length > 160
    || !normalized.startsWith("/")
    || normalized.includes("?")
    || normalized.includes("#")
    || hasControlCharacter(normalized)
  ) return UNMATCHED_ROUTE;

  const segments = normalized.split("/");
  if (segments.length > 13) return UNMATCHED_ROUTE;
  const controlled = segments.map((segment, index) => {
    if (index === 0 || segment === "") return segment;
    if (!ROUTE_SEGMENT.test(segment)) return UNMATCHED_ROUTE;
    // Fastify supplies the registered route template here, never the caller's
    // raw URL. Preserve controlled static segments so distinct endpoints stay
    // observable; collapse only named parameters such as :orderId.
    if (segment.startsWith(":")) return ":param";
    if (segment.length > 32) return UNMATCHED_ROUTE;
    return segment;
  });
  if (controlled.includes(UNMATCHED_ROUTE)) return UNMATCHED_ROUTE;
  return controlled.join("/");
}

function normalizeStatusBucket(statusCode: number): string {
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) return "other";
  const bucket = `${Math.floor(statusCode / 100)}xx`;
  return STATUS_BUCKETS.has(bucket) ? bucket : "other";
}

export function recordHttpRequest(input: {
  method: string;
  routeTemplate?: string;
  statusCode: number;
  durationMs: number;
}): void {
  const key = JSON.stringify([
    normalizeMethod(input.method),
    normalizeRouteTemplate(input.routeTemplate),
    normalizeStatusBucket(input.statusCode),
  ]);
  const boundedKey = httpMetrics.has(key) || httpMetrics.size < MAX_HTTP_METRIC_SERIES - 1
    ? key
    : OVERFLOW_KEY;
  const current = httpMetrics.get(boundedKey) ?? { count: 0, durationMs: 0 };
  current.count += 1;
  current.durationMs += Number.isFinite(input.durationMs) && input.durationMs >= 0
    ? input.durationMs
    : 0;
  httpMetrics.set(boundedKey, current);
}

export function recordRateLimitRejection(): void {
  rateLimitRejections += 1;
}

export function recordRateLimitBackendFailure(): void {
  rateLimitBackendFailures += 1;
}

export function recordWebhookRun(input: { delivered: number; retry: number; busy?: boolean }): void {
  webhookDelivered += input.delivered;
  webhookRetries += input.retry;
  if (input.busy) webhookBusyRuns += 1;
}

function normalizeJobCity(cityCode: string): string {
  const normalized = cityCode.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,31}$/u.test(normalized)) return "__overflow__";
  if (jobMetricCities.has(normalized)) return normalized;
  if (jobMetricCities.size >= MAX_JOB_METRIC_CITIES - 1) return "__overflow__";
  jobMetricCities.add(normalized);
  return normalized;
}

function normalizeJobStep(step: string): JobMetricStep | "other" {
  return JOB_METRIC_STEPS.includes(step as JobMetricStep) ? step as JobMetricStep : "other";
}

function normalizeJobOutcome(outcome: string): JobMetricOutcome {
  return JOB_METRIC_OUTCOMES.includes(outcome as JobMetricOutcome)
    ? outcome as JobMetricOutcome
    : "failed";
}

export function recordJobRun(input: {
  cityCode: string;
  step: string;
  outcome: string;
  durationMs: number;
}): void {
  const key = JSON.stringify([
    normalizeJobCity(input.cityCode),
    normalizeJobStep(input.step),
    normalizeJobOutcome(input.outcome),
  ]);
  const current = jobMetrics.get(key) ?? { count: 0, durationMs: 0 };
  current.count += 1;
  current.durationMs += Number.isFinite(input.durationMs) && input.durationMs >= 0
    ? input.durationMs
    : 0;
  jobMetrics.set(key, current);
}

export function recordOutboxLeasesReaped(cityCode: string, count: number): void {
  const city = normalizeJobCity(cityCode);
  const safeCount = Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
  leaseReapedByCity.set(city, (leaseReapedByCity.get(city) ?? 0) + safeCount);
}

export function recordJobWorkerHeartbeat(observedAt: Date = new Date()): void {
  const timestamp = observedAt.getTime();
  if (Number.isFinite(timestamp)) jobWorkerHeartbeatAtMs = timestamp;
}

export function getJobWorkerHeartbeatStatus(
  now: Date = new Date(),
  maxAgeMs = 120_000,
): { state: "unavailable" | "fresh" | "stale"; ageSeconds: number | null; observedAt: string | null } {
  return assessJobWorkerHeartbeat(
    jobWorkerHeartbeatAtMs === null
      ? null
      : { observedAt: new Date(jobWorkerHeartbeatAtMs).toISOString() },
    now,
    maxAgeMs,
  );
}

export function recordDataReliabilityMetrics(snapshot: DataReliabilitySnapshot): void {
  recordDataReliabilitySnapshot(snapshot);
}

export async function publishDataReliabilityMetrics(snapshot: DataReliabilitySnapshot): Promise<void> {
  await publishDataReliabilitySnapshot(snapshot);
}

export async function publishJobWorkerMetricsHeartbeat(observedAt: Date = new Date()): Promise<void> {
  recordJobWorkerHeartbeat(observedAt);
  await publishJobWorkerHeartbeat(observedAt);
}

export function renderPrometheusMetrics(): string {
  const lines = [
    "# HELP xlb_http_requests_total Total HTTP requests handled by controlled route template, method and status bucket.",
    "# TYPE xlb_http_requests_total counter",
    "# HELP xlb_http_request_duration_ms_sum Sum of HTTP request durations in milliseconds.",
    "# TYPE xlb_http_request_duration_ms_sum counter",
    "# HELP xlb_http_request_duration_ms_count Count of observed HTTP request durations.",
    "# TYPE xlb_http_request_duration_ms_count counter",
  ];

  for (const [key, metric] of [...httpMetrics.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const [method, route, status] = JSON.parse(key) as [string, string, string];
    const labels = `method="${safeLabel(method)}",route="${safeLabel(route)}",status="${status}"`;
    lines.push(`xlb_http_requests_total{${labels}} ${metric.count}`);
    lines.push(`xlb_http_request_duration_ms_sum{${labels}} ${metric.durationMs.toFixed(3)}`);
    lines.push(`xlb_http_request_duration_ms_count{${labels}} ${metric.count}`);
  }

  lines.push("# HELP xlb_rate_limit_rejections_total Requests rejected by API edge rate limits.");
  lines.push("# TYPE xlb_rate_limit_rejections_total counter");
  lines.push(`xlb_rate_limit_rejections_total ${rateLimitRejections}`);
  lines.push("# HELP xlb_rate_limit_backend_failures_total Requests failed closed because the rate limit backend was unavailable.");
  lines.push("# TYPE xlb_rate_limit_backend_failures_total counter");
  lines.push(`xlb_rate_limit_backend_failures_total ${rateLimitBackendFailures}`);
  lines.push("# HELP xlb_webhook_delivery_attempts_total Webhook provider attempts by outcome.");
  lines.push("# TYPE xlb_webhook_delivery_attempts_total counter");
  lines.push(`xlb_webhook_delivery_attempts_total{outcome="delivered"} ${webhookDelivered}`);
  lines.push(`xlb_webhook_delivery_attempts_total{outcome="retry"} ${webhookRetries}`);
  lines.push("# HELP xlb_webhook_run_busy_total Concurrent webhook runs skipped by the city lock.");
  lines.push("# TYPE xlb_webhook_run_busy_total counter");
  lines.push(`xlb_webhook_run_busy_total ${webhookBusyRuns}`);

  lines.push("# HELP xlb_job_runs_total Background job runs by controlled city, step and outcome.");
  lines.push("# TYPE xlb_job_runs_total counter");
  lines.push("# HELP xlb_job_run_duration_ms_sum Sum of background job run durations in milliseconds.");
  lines.push("# TYPE xlb_job_run_duration_ms_sum counter");
  lines.push("# HELP xlb_job_run_duration_ms_count Count of observed background job run durations.");
  lines.push("# TYPE xlb_job_run_duration_ms_count counter");
  for (const [key, metric] of [...jobMetrics.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const [city, step, outcome] = JSON.parse(key) as [string, string, string];
    const labels = `city="${safeLabel(city)}",step="${safeLabel(step)}",outcome="${outcome}"`;
    lines.push(`xlb_job_runs_total{${labels}} ${metric.count}`);
    lines.push(`xlb_job_run_duration_ms_sum{${labels}} ${metric.durationMs.toFixed(3)}`);
    lines.push(`xlb_job_run_duration_ms_count{${labels}} ${metric.count}`);
  }
  lines.push("# HELP xlb_outbox_leases_reaped_total Expired outbox processing leases returned to retry or dead-letter state.");
  lines.push("# TYPE xlb_outbox_leases_reaped_total counter");
  for (const [city, count] of [...leaseReapedByCity.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`xlb_outbox_leases_reaped_total{city="${safeLabel(city)}"} ${count}`);
  }
  lines.push("# HELP xlb_job_worker_last_heartbeat_timestamp_seconds Last observed job worker heartbeat as Unix time.");
  lines.push("# TYPE xlb_job_worker_last_heartbeat_timestamp_seconds gauge");
  lines.push(`xlb_job_worker_last_heartbeat_timestamp_seconds ${jobWorkerHeartbeatAtMs === null ? 0 : jobWorkerHeartbeatAtMs / 1_000}`);
  lines.push("# HELP xlb_job_worker_heartbeat_age_seconds Age of the last job worker heartbeat.");
  lines.push("# TYPE xlb_job_worker_heartbeat_age_seconds gauge");
  lines.push(`xlb_job_worker_heartbeat_age_seconds ${jobWorkerHeartbeatAtMs === null ? -1 : Math.max(0, Date.now() - jobWorkerHeartbeatAtMs) / 1_000}`);

  const reliabilitySnapshot = getDataReliabilitySnapshot();
  const reliability = assessDataReliability(reliabilitySnapshot);
  lines.push("# HELP xlb_data_reliability_ready Whether the latest bounded data reliability snapshot passes readiness thresholds.");
  lines.push("# TYPE xlb_data_reliability_ready gauge");
  lines.push(`xlb_data_reliability_ready ${reliability.ready ? 1 : 0}`);
  lines.push("# HELP xlb_data_reliability_snapshot_age_seconds Age of the latest reliability snapshot, or -1 when unavailable.");
  lines.push("# TYPE xlb_data_reliability_snapshot_age_seconds gauge");
  lines.push(`xlb_data_reliability_snapshot_age_seconds ${reliability.snapshotAgeSeconds ?? -1}`);
  if (reliabilitySnapshot) {
    lines.push("# HELP xlb_schema_migrations_applied Number of applied database migrations.");
    lines.push("# TYPE xlb_schema_migrations_applied gauge");
    lines.push(`xlb_schema_migrations_applied ${reliabilitySnapshot.migrations.appliedCount}`);
    lines.push("# HELP xlb_schema_migration_latest_info Latest applied migration version.");
    lines.push("# TYPE xlb_schema_migration_latest_info gauge");
    lines.push(`xlb_schema_migration_latest_info{version="${safeLabel(reliabilitySnapshot.migrations.latestVersion ?? "none")}"} 1`);
    lines.push("# HELP xlb_outbox_events Outbox rows by configured city and controlled state.");
    lines.push("# TYPE xlb_outbox_events gauge");
    lines.push("# HELP xlb_outbox_oldest_eligible_age_seconds Age of the first eligible outbox row in claim order.");
    lines.push("# TYPE xlb_outbox_oldest_eligible_age_seconds gauge");
    lines.push("# HELP xlb_outbox_expired_processing_leases Expired outbox processing leases awaiting reaping.");
    lines.push("# TYPE xlb_outbox_expired_processing_leases gauge");
    lines.push("# HELP xlb_dispatch_stream_length Redis dispatch stream entry count.");
    lines.push("# TYPE xlb_dispatch_stream_length gauge");
    lines.push("# HELP xlb_dispatch_stream_consumer_groups Redis dispatch stream consumer group count.");
    lines.push("# TYPE xlb_dispatch_stream_consumer_groups gauge");
    for (const city of reliabilitySnapshot.cities) {
      const cityLabel = safeLabel(city.cityCode);
      for (const status of OUTBOX_RELIABILITY_STATUSES) {
        const count = city.outbox.statusCounts[status];
        lines.push(`xlb_outbox_events{city="${cityLabel}",status="${status}"} ${count}`);
      }
      lines.push(`xlb_outbox_oldest_eligible_age_seconds{city="${cityLabel}"} ${city.outbox.oldestEligibleAgeSeconds ?? -1}`);
      lines.push(`xlb_outbox_expired_processing_leases{city="${cityLabel}"} ${city.outbox.expiredProcessingLeases}`);
      lines.push(`xlb_dispatch_stream_length{city="${cityLabel}"} ${city.dispatchStream.length}`);
      lines.push(`xlb_dispatch_stream_consumer_groups{city="${cityLabel}"} ${city.dispatchStream.consumerGroups}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function resetMetricsForTests(): void {
  httpMetrics.clear();
  rateLimitRejections = 0;
  rateLimitBackendFailures = 0;
  webhookDelivered = 0;
  webhookRetries = 0;
  webhookBusyRuns = 0;
  jobMetrics.clear();
  jobMetricCities.clear();
  leaseReapedByCity.clear();
  jobWorkerHeartbeatAtMs = null;
  resetDataReliabilityForTests();
}
