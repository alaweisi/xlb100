# TKE one-command release Wave 2 result

Date: 2026-07-17 (Asia/Shanghai)

WAVE2_STATUS=SUCCESS

## Integrated baseline

- Gate 1 baseline: `ad44833`
- P4 resumable orchestrator source: `dd8ad25`, hardened by `77b3b86`
- P5 traffic cutover source: `94f8979`, hardened by `efe3a93`
- P6 deterministic simulation source: `dab4c39`, hardened by `0aebc80`
  and `b4f69df`
- Gate 2 integration branch: `codex/tke-wave2-integration`
- Gate 2 integration commit: use this document's containing commit

## Accepted capabilities

1. A release orchestrator validates immutable release artifacts, creates an
   atomic checkpoint, serializes runners with a release lease, advances only
   through adjacent states and resumes only the recorded failed state.
2. Runtime authorities remain transient and release-step scoped. They are not
   written to manifests, checkpoints or evidence. The shared offline entry
   cannot accept a cloud execution grant or execute provider rollback.
3. The CLB/DNS-neutral cutover controller enforces `5 -> 25 -> 50 -> 100`,
   minimum 900-second observation windows, evidence SHA validation, CAS
   progress updates, stable idempotency keys and reverse traffic rollback.
4. Jobs single-active, backup/restore, migration, smoke and traffic evidence
   remain fail-closed prerequisites. Mock provider receipts are rejected
   outside the explicit simulation context.
5. The deterministic P6 harness covers success, structured failures, missing
   success evidence, process interruption, exact resume, artifact drift,
   double-active Jobs, cutover order, rollback failure and cross-release
   evidence isolation.
6. Wave 1 now writes the exact `cloud-bundle.json` filename declared by the
   release manifest; the temporary `manifest.json` compatibility path was
   removed.
7. Shared `RunRelease` and `PrepareCutover` actions, root tests, static checks
   and CI paths include the Wave 2 implementation.

## Gate 2 evidence

- P4 focused tests: 21/21 passed.
- P5 plus Wave 0 contract tests: 24/24 passed.
- P6 real P4/P5 wiring and failure simulations: 43/43 passed.
- Wave 0 plus P6 combined tests: 52/52 passed.
- Aggregate Node tests: 137/137 passed.
- Unified PowerShell positive and negative entry tests: passed.
- Static delivery and release contract checks: passed.
- Helm lint/render for local, staging and production: passed.
- kubeconform: 21 valid, 0 invalid, 0 errors, 1 missing CRD schema skipped.
- Terraform fmt/init without backend/validate and mocked tests: 3/3 passed.
- `pnpm tke:gate`: passed.
- `git diff --check`: passed.

## External-operation boundary

No Tencent Cloud login, TCR push, Terraform real plan/apply, Kubernetes cloud
deployment, production database access, Jobs stop/start, CLB/DNS change,
traffic cutover or Lighthouse operation occurred. Gate 2 accepts repository
automation and deterministic offline evidence only. It grants no N7 or N8
runtime authority.

## Next gate

The next serial gate is N7 TKE Staging. It must provide reviewed cloud inputs,
real immutable TCR digests, separately authorized provider operations and a
complete staging evidence bundle. N8 production remains blocked until N7 has
the real `PASS` result required by the production-plan gate.
