# XLB TKE one-command release contracts

Status: **WAVE 0 FROZEN CONTRACT**

This directory is the shared boundary for the parallel release-automation
workstreams. P1-P6 may implement these contracts, but they must not redefine
them independently.

## Contract files

| Contract | Producer | Consumers |
| --- | --- | --- |
| `release-manifest.schema.json` | release operator / P4 | P1-P6 |
| `images-lock.schema.json` | P1 image factory | P4, P6, N7, N8 |
| `cloud-bundle.schema.json` | P2 bundle generator | P4, P5, P6 |
| `evidence-bundle.schema.json` | P3 guards and P6 drills | P4, P5, N7, N8 |
| `checkpoint.schema.json` | P4 orchestrator | P4, P5, P6 |

Committed examples contain synthetic identifiers and hashes only. Real
release artifacts belong below `.artifacts/tke/` and remain ignored.

## Directory ownership

| Workstream | Exclusive implementation paths |
| --- | --- |
| P1 image factory | `deploy/tke/release/**` |
| P2 cloud bundle | `deploy/tke/bundle/**` |
| P3 safety guards | `deploy/tke/guards/**` |
| P4 orchestrator | `deploy/tke/orchestrator/**` |
| P5 cutover controller | `deploy/tke/cutover/**` |
| P6 simulation | `tests/tke/release/**` |

The integration owner alone updates shared entry points such as
`deploy/tke/xlb-tke.ps1`, root `package.json`, the delivery workflow, and the
aggregate acceptance report after the parallel branches return.

## State machine

Normal forward execution is linear after the three parallel prerequisites
have completed:

```text
PREPARED
  -> ARTIFACTS_READY
  -> PLAN_REVIEWED
  -> INFRA_READY
  -> DEPLOYED_NO_TRAFFIC
  -> BACKUP_VERIFIED
  -> MIGRATED
  -> SMOKE_PASS
  -> JOBS_SWITCHED
  -> TRAFFIC_5
  -> TRAFFIC_25
  -> TRAFFIC_50
  -> TRAFFIC_100
  -> OBSERVED
  -> LIGHTHOUSE_RETIRED
```

`ARTIFACTS_READY` requires all three completed stages:

- `IMAGES_PUBLISHED`
- `CLOUD_BUNDLE_READY`
- `SAFETY_CONTRACT_READY`

Every non-terminal state may enter `FAILED`. A failed run may resume only to
the recorded `resumeState` after the failed stage is revalidated. A release
may enter `ROLLED_BACK` from `DEPLOYED_NO_TRAFFIC` through `OBSERVED`.
`LIGHTHOUSE_RETIRED` and `ROLLED_BACK` are terminal for that release ID.

## Runtime authority

The artifacts in this directory never grant external authority. Runtime
confirmation remains separate for:

1. real Terraform plan;
2. billable Terraform apply;
3. cloud deployment;
4. data migration;
5. traffic cutover;
6. Lighthouse retirement.

Passwords, API keys, private keys, session tokens, kubeconfigs and Terraform
credentials are forbidden in all five contracts. Only external Secret names
and ignored file references are permitted.
