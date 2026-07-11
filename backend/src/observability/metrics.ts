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
let webhookDelivered = 0;
let webhookRetries = 0;
let webhookBusyRuns = 0;

function safeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

function normalizeMethod(method: string): string {
  const normalized = method.trim().toUpperCase();
  return ALLOWED_METHODS.has(normalized) ? normalized : "OTHER";
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
    || /[\u0000-\u001f\u007f]/u.test(normalized)
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

export function recordWebhookRun(input: { delivered: number; retry: number; busy?: boolean }): void {
  webhookDelivered += input.delivered;
  webhookRetries += input.retry;
  if (input.busy) webhookBusyRuns += 1;
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
  lines.push("# HELP xlb_webhook_delivery_attempts_total Webhook provider attempts by outcome.");
  lines.push("# TYPE xlb_webhook_delivery_attempts_total counter");
  lines.push(`xlb_webhook_delivery_attempts_total{outcome="delivered"} ${webhookDelivered}`);
  lines.push(`xlb_webhook_delivery_attempts_total{outcome="retry"} ${webhookRetries}`);
  lines.push("# HELP xlb_webhook_run_busy_total Concurrent webhook runs skipped by the city lock.");
  lines.push("# TYPE xlb_webhook_run_busy_total counter");
  lines.push(`xlb_webhook_run_busy_total ${webhookBusyRuns}`);
  return `${lines.join("\n")}\n`;
}

export function resetMetricsForTests(): void {
  httpMetrics.clear();
  rateLimitRejections = 0;
  webhookDelivered = 0;
  webhookRetries = 0;
  webhookBusyRuns = 0;
}
