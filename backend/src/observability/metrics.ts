type HttpMetric = {
  count: number;
  durationMs: number;
};

const httpMetrics = new Map<string, HttpMetric>();
let rateLimitRejections = 0;
let webhookDelivered = 0;
let webhookRetries = 0;
let webhookBusyRuns = 0;

function safeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

export function recordHttpRequest(input: {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}): void {
  const key = JSON.stringify([input.method, input.route, input.statusCode]);
  const current = httpMetrics.get(key) ?? { count: 0, durationMs: 0 };
  current.count += 1;
  current.durationMs += input.durationMs;
  httpMetrics.set(key, current);
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
    "# HELP xlb_http_requests_total Total HTTP requests handled by route and status.",
    "# TYPE xlb_http_requests_total counter",
    "# HELP xlb_http_request_duration_ms_sum Sum of HTTP request durations in milliseconds.",
    "# TYPE xlb_http_request_duration_ms_sum counter",
    "# HELP xlb_http_request_duration_ms_count Count of observed HTTP request durations.",
    "# TYPE xlb_http_request_duration_ms_count counter",
  ];

  for (const [key, metric] of [...httpMetrics.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const [method, route, status] = JSON.parse(key) as [string, string, number];
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
