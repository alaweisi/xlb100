# XLB TKE observability package

This directory is the offline, provider-neutral N5 operations package. It does not connect to Tencent Cloud, install Prometheus, create an alert policy, deploy a chart, or modify production data.

## Inputs verified from N1 and N2

- The backend is selected through the `*-xlb-backend` ClusterIP Service on its named `http` port; the optional ServiceMonitor scrapes `/metrics`.
- Workloads use names ending in `-xlb-backend`, `-xlb-jobs`, `-xlb-customer`, `-xlb-worker`, `-xlb-admin`, `-xlb-oa`, and `-xlb-dashboard`. Prometheus rules intentionally match those stable Helm names instead of depending on a kube-state-metrics label allowlist.
- Application rules only reference `xlb_*` metric names that are rendered by `backend/src/observability/metrics.ts`.
- Kubernetes rules use the explicit platform allowlist in `metric-contract.json`. They require kube-state-metrics and kubelet/cAdvisor collection and are not application metrics.

## Artifacts

- `prometheus-rules.yaml` is JSON syntax, which is valid YAML. This makes the fallback parser deterministic while remaining consumable by Prometheus Operator tooling.
- `grafana-dashboard.json` is an importable dashboard for service health, HTTP, jobs, backlog, reliability, and workload resource signals.
- `grafana-jobs-reliability-dashboard.json` is a focused importable dashboard for worker heartbeat, outbox state, streams, and reliability exceptions.
- `cloud-alert-boundaries.yaml` is a non-applying contract for MySQL, Redis, COS, CLB, TKE, CLS/logging, and total-cost boundaries. Tencent metric identifiers are deliberately deferred to N7 account/region verification.
- `metric-contract.json` binds each alert to implemented application metrics or an explicit platform allowlist.
- `validate.mjs` performs offline syntax, reference, dashboard, cloud-boundary, Runbook, and whitespace checks. If `promtool` is installed it also executes the authoritative Prometheus rule checker; otherwise it reports use of the deterministic fallback.

## Installation prerequisites for a future authorized environment

1. Prometheus Operator CRDs and a Prometheus instance that selects the Helm ServiceMonitor.
2. kube-state-metrics with the listed metric families enabled.
3. kubelet/cAdvisor CPU and memory series collected with `namespace`, `pod`, and `container` labels.
4. An Alertmanager receiver and ownership routing for `application-platform`, `data-platform`, and `security-observability`.
5. Grafana with a Prometheus datasource; select it through the dashboard's `DS_PROMETHEUS` input.
6. Cloud Monitor/CLS policies created only after N7 confirms real resource IDs, region-specific metric names, budget, retention, and notification receivers.

The chart's `serviceMonitor.enabled` is currently an environment decision. Enabling it or installing these rules is outside N5 and requires the later integration/deployment gate.

## Offline acceptance

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File infra/observability/tke/Validate-N5.ps1
```

On systems with PowerShell 7, `pwsh -File infra/observability/tke/Validate-N5.ps1` is equivalent.

Optional authoritative rule syntax check when `promtool` is already installed locally:

```powershell
promtool check rules infra/observability/tke/prometheus-rules.yaml
```

No validation command downloads tools or contacts a cluster/provider.

## Known gaps carried into N7

- `/health/ready` distinguishes MySQL and Redis in its response, but the Prometheus output has no dedicated `mysql_up` or `redis_up` metric. The rules therefore do not pretend to isolate those dependency failures.
- HTTP duration is sum/count only; the dashboard and rule show mean latency, not p95/p99.
- COS request outcomes, CLB listener health, managed TKE control-plane health, CLS volume, and billing data exist only in Tencent Cloud services. The boundary contract lists the required signals without inventing metric identifiers.
- The jobs process records `xlb_job_runs_total`, job duration, and lease-reaped counters only in its own process memory, while the current Helm contract exposes `/metrics` only through the backend Service. N5 therefore does not alert or dashboard those series. Heartbeat and reliability/backlog snapshots are shared through Redis and are safe to scrape from backend. A jobs metrics endpoint or shared aggregation remains a future application/Chart contract decision.
- Initial backlog and resource thresholds are conservative starting points and must be tuned from Staging evidence before production paging.
- The fallback validator checks structure, balanced PromQL delimiters, declared metric references, source existence, and platform allowlists. It is not the official PromQL parser; the authoritative `promtool check rules` remains a required N6/N7 gate once the pinned tool is available.
