# P4 resumable release orchestrator

This directory implements the Wave 2 P4 controller against the frozen schemas
in `deploy/tke/contracts/`. It does not redefine those contracts and does not
contain a Tencent Cloud, Terraform, Kubernetes, DNS, database, or Lighthouse
provider.

## Safety model

- One checkpoint is created at the manifest's ignored `.artifacts/tke/...`
  reference and replaced atomically.
- Every transition revalidates all four source artifacts and their SHA-256
  hashes. A changed artifact or stale checkpoint revision blocks execution.
- Forward transitions are adjacent and ordered. `runRelease` reaches a later
  target only by executing every intermediate transition.
- Failures persist the failed stage and exact resume state. `resumeRelease`
  revalidates hashes before retrying only that state.
- Rollback is legal from `DEPLOYED_NO_TRAFFIC` through `OBSERVED` and requires
  passing rollback evidence.
- Runtime authority is a transient boolean passed to a stage executor. It is
  never written to a manifest, artifact, executor result, or checkpoint.
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

The integration owner will connect this API to the shared entry point and to
real provider adapters only after P4/P5/P6 integration and separate external
authorization.
