# TKE delivery line N6 local acceptance

Date: 2026-07-16 (Asia/Shanghai)

## Result

**SUCCESS — the repository-owned delivery line passed local Kubernetes
acceptance. This is a kind result, not a Tencent Cloud TKE staging or production
result.**

Accepted integration baseline:
`af042bdea2a2e3658fee75f687fc38d2760708b7`.

No Tencent Cloud account, API, credential or resource was accessed. No
Terraform plan/apply, push, deploy to a remote cluster, production-data access
or public release occurred.

## Reproducible environment

| Component | Accepted input |
| --- | --- |
| Docker client/server | 29.4.3 / 29.4.3 |
| kind | v0.32.0; platform binary SHA-256 pinned in `tests/tke/tool-versions.json` |
| Kubernetes node | v1.34.8, `kindest/node` pinned by digest |
| kubectl client | v1.34.1 |
| Helm / kubeconform | N4 checksum-pinned bootstrap |
| PromQL parser | official Prometheus v3.5.0 image pinned by digest; `promtool check rules` |
| MySQL / Redis | disposable containers on host ports 13306 / 16379 |
| Database | disposable `xlb_tke_acceptance`; existing local databases were not reused |

The one-click entry is:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/tke/run-local-acceptance.ps1
```

The successful default run included all four Docker image builds and completed
in approximately 313 seconds. A second integrated run with
`-SkipImageBuild` completed in approximately 223 seconds and proved the newly
embedded authoritative `promtool` gate plus the full runtime flow.

## Evidence accepted

| Contract | Evidence |
| --- | --- |
| Offline safety | N6 contract tests 3/3; cloud/IaC operation strings rejected |
| Image packaging | backend, customer, worker and admin images built from repository Dockerfiles and loaded into kind |
| Helm install | unified N4 `Deploy` installed revision 1 with the acceptance values file |
| Runtime inventory | backend, jobs, customer, worker and admin Deployments all reached 1/1 Ready |
| Probes | `/health/live` returned live; `/health/ready` returned MySQL/Redis ready for `xlb_tke_acceptance` |
| Three frontends | each ClusterIP Service served its application shell through a local port-forward |
| WebSocket | `/api/support/realtime` completed a WebSocket upgrade and enforced invalid-ticket close code 1008 |
| Jobs | backend metrics reported a non-zero dedicated job-worker heartbeat timestamp |
| Migration | unified N4 `Migrate` created exactly one Job; it referenced `xlb-local-xlb-backend`, completed 1/1, and wrote migration history to the disposable database |
| No duplicate release resources | migration selection contained no Deployment, Service or ConfigMap; the installed release remained `xlb-local` |
| Pod recovery | deleting the backend Pod produced a different Pod UID and the Deployment returned Ready |
| Rolling upgrade | Helm revision 2 changed the backend ConfigMap marker and completed with the Chart rolling strategy |
| Rollback | unified N4 `Rollback` restored revision 1 and the post-rollback unified `Smoke` passed for all five Deployments |
| Prometheus rules | official `promtool` parsed 16 rules successfully |
| Cleanup | kind cluster, port-forward processes and only the two N6-owned dependency containers were removed automatically |

Final repository gates also passed:

- `pnpm tke:gate`: static gate; Node 9/9; PowerShell positive/negative
  cases; isolated migration Job render; three-environment Helm lint/render;
  kubeconform 21 valid, 0 invalid, 1 CRD skipped; ten production negatives;
  Terraform fmt/init with backend disabled/validate and three mocked tests.
- `infra/observability/tke/Validate-N5.ps1`: structure, metric contract,
  dashboard, cloud boundary and Runbook checks passed. Its local `promtool`
  lookup reported fallback mode, so N6 separately executed the digest-pinned
  official Prometheus image as the authoritative parser.

## Still requires N7 TKE staging authorization

Local kind cannot validate the following. They remain explicit cloud-stage
acceptance work and must not be inferred from this SUCCESS result:

1. Reviewed Terraform plan and approved creation/reference of billable TKE,
   node-pool, TCR, VPC/subnet and supporting resources.
2. TCR authentication, immutable digest pulls and Tencent image-pull Secret
   wiring from real TKE nodes.
3. Managed MySQL/Redis private-network routing, TLS/CA material, backup,
   restore and failure recovery.
4. COS private access, credentials, bucket policy, CORS/lifecycle and
   application read/write sampling.
5. Tencent CLB/Ingress annotations, public DNS, certificate/TLS termination,
   health checks and controlled traffic cutover.
6. Real TKE multi-node scheduling, PodDisruptionBudget behavior, node drain,
   autoscaling, zone failure and capacity limits.
7. Tencent log/metric ingestion, managed alert delivery, notification routes
   and actual cloud cost thresholds.
8. Staging migration with reviewed backup evidence and staging rollback;
   production migration and cutover remain a later, separately authorized
   production operation.

## Cleanup and rerun

The default runner cleans its disposable resources after success. On failure it
preserves them for diagnosis. The following command removes only resources with
the fixed N6 cluster name and ownership-labelled dependency containers:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/tke/run-local-acceptance.ps1 -CleanupOnly
```
