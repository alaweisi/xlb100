# P4 resumable release orchestrator

This directory implements the Wave 2 P4 controller against the frozen schemas
in `deploy/tke/contracts/`. It does not redefine those contracts and does not
contain a Tencent Cloud, Terraform, Kubernetes, DNS, database, or Lighthouse
provider.

## Safety model

- One checkpoint is created at the manifest's ignored `.artifacts/tke/...`
  reference and replaced atomically.
- Every transition revalidates all four source artifacts and their SHA-256
  hashes, all SBOM/scan files, the cloud payload inventory, and every evidence
  reference. A changed artifact, stale evidence, or stale checkpoint revision
  blocks execution.
- A renewable release lease serializes runners before an executor starts. The
  provider idempotency key is `<releaseId>:<revision>:<targetState>` and remains
  stable across a failed-stage retry. Lease owner and monotonically increasing
  fencing token are verified before renewal and after provider return, and are
  required in the provider receipt.
- Forward transitions are adjacent and ordered. `runRelease` reaches a later
  target only by executing every intermediate transition.
- Failures persist the failed stage and exact resume state. `resumeRelease`
  revalidates hashes before retrying only that state.
- Rollback is legal from `DEPLOYED_NO_TRAFFIC` through `OBSERVED` and requires
  passing rollback evidence. A failed rollback atomically creates a durable
  latch that blocks forward/resume until rollback is retried or a release-
  scoped manual acknowledgement clears it.
- Runtime authority is a transient release-step grant passed to a stage
  executor. It is never written to a manifest, artifact, executor result, or
  checkpoint.
- Every external stage requires a matching, fresh provider receipt and evidence
  hash. Mock/offline/no-op receipts are accepted only with the explicit library
  simulation context, never in normal execution.
- Simulation requires
  `.artifacts/tke/simulations/<releaseId>/simulation-manifest.json`, cannot use
  a production manifest, and persists `simulation: true` in both its extended
  checkpoint and receipts. Real advance/resume rejects that path and marker.
- `ARTIFACTS_READY` failures identify exactly `IMAGES_PUBLISHED`,
  `CLOUD_BUNDLE_READY`, or `SAFETY_EVIDENCE_READY`.
- Traffic authority names one exact step (`TRAFFIC_5`, `TRAFFIC_25`,
  `TRAFFIC_50`, or `TRAFFIC_100`) and cannot authorize the next step.
- The default injected executor is `OFFLINE_FAKE`; it never connects to an
  external system.

## Offline entry

```powershell
node deploy/tke/orchestrator/xlb-release.mjs `
  --manifest .artifacts/tke/releases/<release-id>/release-manifest.json `
  --target ARTIFACTS_READY
```

The controller pauses before an authority boundary. The standalone P4 entry
rejects `--grant`, because it has no real provider adapter and must never mark
a fake external action as complete. The library API accepts transient runtime
authority only when the integration owner injects the matching reviewed
executor.

The standalone entry also rejects rollback. Rollback is available only through
the library API with a reviewed executor capable of returning a real provider
receipt. Wave 1 emits the exact `cloud-bundle.json` path declared by the release
manifest; undeclared compatibility filenames are rejected.

The integration owner will connect this API to the shared entry point and to
real provider adapters only after P4/P5/P6 integration and separate external
authorization.
