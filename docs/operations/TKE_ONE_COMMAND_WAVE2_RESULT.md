# TKE one-command release Wave 2 result

Date: 2026-07-17 (Asia/Shanghai)

WAVE2_STATUS=BLOCKED_P4_REVIEW

> Correction: the earlier `5061892` acceptance candidate is superseded. A
> later independent P4 review found four open fail-closed issues. Passing tests
> from that candidate are retained below as historical evidence only and do
> not constitute Gate 2 acceptance.

## Open P4 review findings

1. An expired release lease can be taken over while the previous runner's
   heartbeat is still alive, allowing the old runner to overwrite the new
   lease record.
2. Explicit simulation execution can write mock-provider receipts into the
   same formal checkpoint/evidence path used by a non-simulation release.
3. An `ARTIFACTS_READY` failure records the wrong `failedStage`, weakening
   exact resume and failure attribution.
4. Long-running stage receipt freshness is measured against an unsuitable
   clock boundary, so a valid receipt can become stale before the stage
   commits.
5. The P6 wiring candidate does not drive the actual P4 advance into the P5
   advance path and does not round-trip real evidence, provider receipt hashes
   and the resulting P4 checkpoint. Its passing wiring test therefore does not
   yet prove the integrated failure, resume and rollback chain.

Gate 2 remains blocked until the third P4 correction and the real P4/P5 wiring
increment close all five findings, add regression coverage, pass the complete
offline gate and receive a final integration review.

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

## Superseded candidate evidence

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

## Blocked next gate

N7 TKE Staging cannot start from this candidate. After P4 is corrected and
Gate 2 is accepted, N7 must provide reviewed cloud inputs, real immutable TCR
digests, separately authorized provider operations and a complete staging
evidence bundle. N8 production remains blocked until N7 has the real `PASS`
result required by the production-plan gate.
