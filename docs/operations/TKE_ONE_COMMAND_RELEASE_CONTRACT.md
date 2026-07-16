# TKE one-command release Wave 0 contract

Date: 2026-07-16 (Asia/Shanghai)

Status: **WAVE 0 CONTRACT BASELINE**

This document freezes the construction boundary for the release-automation
work that follows N0-N8. It does not authorize Tencent Cloud access, TCR push,
Terraform plan/apply, Kubernetes deployment, data migration, traffic cutover,
or Lighthouse retirement.

## Objective

The finished product has one resumable entry, while keeping six external or
production authorities separate. A release operator starts or resumes one
release ID; the controller verifies artifacts and evidence, records a durable
checkpoint, and pauses at every authority boundary.

```text
release manifest
  + immutable image lock
  + reviewed cloud bundle
  + safety evidence
          |
          v
resumable controller -> no-traffic deploy -> migrate -> smoke
          |                                      |
          v                                      v
     checkpoint                           jobs single-active
                                                  |
                                                  v
                                   5 -> 25 -> 50 -> 100
                                                  |
                                                  v
                                      observe -> retire
```

## Parallel construction after Wave 0

### Wave 1

The following three branches may write in parallel after this contract commit
is their common parent:

| Node | Branch | Input | Output |
| --- | --- | --- | --- |
| P1 image factory | `codex/tke-release-factory` | release manifest and Git commit | `images-lock.schema.json` instance plus SBOM and scan evidence |
| P2 cloud bundle | `codex/tke-cloud-bundle` | reviewed non-secret cloud parameters and image lock | `cloud-bundle.schema.json` instance plus tfvars, backend config and Helm values |
| P3 safety guards | `codex/tke-safety-guards` | release manifest, backup metadata and runtime observations | `evidence-bundle.schema.json` instance |

### Wave 2

After P1-P3 integration, these nodes may write in parallel:

| Node | Branch | Input | Output |
| --- | --- | --- | --- |
| P4 orchestrator | `codex/tke-release-orchestrator` | all five contracts | validated state transitions and `checkpoint.schema.json` instances |
| P5 cutover | `codex/tke-cutover-controller` | cloud bundle, checkpoint and evidence | reviewed CLB or DNS weight operations and rollback evidence |
| P6 simulation | `codex/tke-release-simulation` | contract examples and provider fakes | deterministic success, failure, rollback and resume evidence |

P6 may build its fixture framework in parallel, but final full-chain acceptance
waits for P4 and P5.

## Frozen artifact layout

```text
.artifacts/tke/releases/<release-id>/
  release-manifest.json
  images.lock.json
  checkpoint.json
  evidence.json
  sbom/
  scans/
  evidence/

.artifacts/tke/<environment>/
  cloud-bundle.json
  <environment>.tfvars
  <environment>.backend.hcl
  values-<environment>.yaml
```

Every real artifact stays ignored. Only schemas and synthetic examples are
committed.

## Frozen stage prerequisites

| Target state | Required evidence or completed stage |
| --- | --- |
| `ARTIFACTS_READY` | images published, cloud bundle ready, safety contract ready |
| `PLAN_REVIEWED` | separately authorized real Terraform plan reviewed |
| `INFRA_READY` | separately authorized Terraform apply completed |
| `DEPLOYED_NO_TRAFFIC` | immutable digest deployment ready with zero public traffic |
| `BACKUP_VERIFIED` | backup ID and restore drill evidence pass |
| `MIGRATED` | unique migration run completes |
| `SMOKE_PASS` | backend, frontends, WebSocket and jobs checks pass |
| `JOBS_SWITCHED` | old jobs stopped and only the TKE lease is active |
| `TRAFFIC_5..100` | ordered weight step and its observation evidence pass |
| `OBSERVED` | the configured post-100-percent observation window passes |
| `LIGHTHOUSE_RETIRED` | separate retirement authority and retained recovery evidence |

## Failure and rollback rules

- A forward state can advance only to its immediate successor.
- A non-terminal state may enter `FAILED` and record the failed stage,
  timestamp, retryability and exact resume state.
- `FAILED` resumes only to that recorded forward state after revalidation.
- Rollback is available from `DEPLOYED_NO_TRAFFIC` through `OBSERVED`.
- `ROLLED_BACK` and `LIGHTHOUSE_RETIRED` are terminal for that release ID.
- A new attempt after either terminal state requires a new release ID.

## Safety rules

1. Contract artifacts never contain credentials or persisted approvals.
2. Secret names are references; Secret values remain outside the bundle.
3. All four images are required and use immutable SHA-256 digests.
4. Lighthouse and TKE jobs may never both report `ACTIVE`.
5. Traffic observations must be the ordered prefix of `5/25/50/100`.
6. Artifact references remain below ignored `.artifacts/tke/` paths.
7. File hashes and revisions make stale resume attempts detectable.
8. External authorities are passed at execution time and are not reusable
   fields in release artifacts.

## Wave 0 exit gate

Wave 1 may start only when:

- every JSON Schema compiles in AJV strict mode;
- all committed examples form one consistent release bundle;
- negative tests reject credentials, mutable images, cross-file drift,
  illegal state jumps, jobs double-active, traffic-step skipping, and paths
  outside `.artifacts`;
- the aggregate TKE delivery gate remains green;
- the Wave 0 branch is committed and used as the Wave 1 common parent.
