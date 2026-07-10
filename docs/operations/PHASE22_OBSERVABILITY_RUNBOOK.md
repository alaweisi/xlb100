# Phase 22 Observability Runbook

## Endpoints And Correlation

- Scrape `GET /metrics` as Prometheus text.
- Preserve `x-xlb-trace-id` through ingress and return it to callers.
- Search structured backend logs by `traceId`, then narrow with `cityCode`, `appType`,
  `route`, `statusCode`, and `durationMs`.

## Primary Signals

- `xlb_http_requests_total`: request volume and 5xx ratio.
- `xlb_http_request_duration_ms_sum/count`: average route duration.
- `xlb_rate_limit_rejections_total`: API-edge burst rejection.
- `xlb_webhook_delivery_attempts_total{outcome}`: delivered versus retry attempts.
- `xlb_webhook_run_busy_total`: fail-fast city-lock contention.

Load `infra/observability/phase22-alert-rules.yml` into Prometheus-compatible rule
evaluation. Warning alerts require operator investigation; critical alerts block a
release until the error or retry source is identified.

## Incident Checks

1. Use trace ID to reconstruct the customer/admin/worker request chain.
2. Confirm affected `city_code` and tenant before querying business rows.
3. For webhook storms, compare retry and busy counters, then inspect delivery
   `attempt_count`, `next_retry_at`, and provider envelope.
4. For dispatch races, verify exactly one acceptance and one accepted offer.
5. Never treat `marked_paid`, mock webhook delivery, local OSS storage, or local geo
   calculation as proof of external provider execution.
