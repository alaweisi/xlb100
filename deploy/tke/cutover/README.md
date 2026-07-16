# TKE provider-neutral cutover controller

This Wave 2 / P5 component prepares and drives the fixed traffic staircase:

```text
Lighthouse -> 5% TKE -> 25% TKE -> 50% TKE -> 100% TKE
```

It consumes the frozen Wave 0 contracts and the reviewed Wave 1 cloud and
safety artifacts. It does not contain Tencent credentials or call Tencent
Cloud by itself. The command-line interface can only create an offline plan:

```powershell
node deploy/tke/cutover/cutover-controller.mjs `
  --request .artifacts/tke/releases/<release-id>/cutover-request.json `
  --output .artifacts/tke/releases/<release-id>/cutover-plan.json
```

## Safety boundary

- The release ID, environment, provider, four input hashes, checkpoint bindings,
  Jobs single-active state, and existing traffic prefix must all agree.
- The only forward order is `5 -> 25 -> 50 -> 100`; completed steps are
  idempotent and skipped levels are rejected.
- Every level needs passed observation evidence for its configured duration.
- CLB and DNS adapters require an injected transport. There is no built-in real
  provider transport and no default external execution path.
- A runtime confirmation is a transient method argument. Plans and progress
  reject persisted credentials, approvals, authorizations, and confirmations.
- Every runtime call must also supply the reviewed evidence SHA-256. A different
  release, environment, or evidence file is rejected before the provider runs.
- Failed observations retain a pending checkpoint and resume without applying
  the same traffic change twice.
- Rollback walks the applied weights in reverse to zero, recording provider and
  observation evidence for every transition. A completed rollback reports
  whether the orchestrator still needs to hand Jobs back to Lighthouse.

The integration owner wires this library to the P4 orchestrator and chooses a
real provider transport only during a separately authorized N7/N8 execution.
