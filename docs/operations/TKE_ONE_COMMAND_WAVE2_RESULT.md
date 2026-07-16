# TKE one-command release Wave 2 result

Date: 2026-07-17 (Asia/Shanghai)

WAVE2_STATUS=BLOCKED_FINAL_REVIEW

> Correction: the earlier `5061892` acceptance candidate is superseded. A
> later independent P4 review found four open fail-closed issues. Passing tests
> from that candidate are retained below as historical evidence only and do
> not constitute Gate 2 acceptance.

## Review findings

1. **Resolved by P4 third correction `8519a82`:** an expired release lease can be taken over while the previous runner's
   heartbeat is still alive, allowing the old runner to overwrite the new
   lease record.
2. **Resolved by P4 third correction `8519a82`:** explicit simulation execution can write mock-provider receipts into the
   same formal checkpoint/evidence path used by a non-simulation release.
3. **Resolved by P4 third correction `8519a82`:** an `ARTIFACTS_READY` failure records the wrong `failedStage`, weakening
   exact resume and failure attribution.
4. **Resolved by P4 third correction `8519a82`:** long-running stage receipt freshness is measured against an unsuitable
   clock boundary, so a valid receipt can become stale before the stage
   commits.
5. **Resolved by P6 real-chain increment `cfa9221`:** the earlier P6 wiring
   candidate did not drive the actual P4 advance into the P5 advance path and
   did not round-trip real evidence, provider receipt hashes and the resulting
   P4 checkpoint. The real-chain increment now covers success, failure/resume,
   external drift and rollback/retry paths.
6. **Resolved by P4 fourth correction `a5dda43`:** `LEASE_LOST` or fencing-owner mismatch can enter a generic catch
   path and persist `FAILED` or `ROLLBACK_FAILED`. Under reverse interleaving,
   the stale owner can claim revision + 1 before the new owner. Fencing failures
   must rethrow without any persistent write.
7. **Resolved by P4 fourth correction `a5dda43`:** an artifacts failure uses `SAFETY_EVIDENCE_READY` while the frozen
   checkpoint schema permits `SAFETY_CONTRACT_READY`; a temporary mapping masks
   an otherwise illegal persisted `failedStage`.
8. **Resolved by P4 fourth correction `a5dda43`:** only provider-receipt validation uses a post-executor clock. Other
   business evidence, rollback evidence, checkpoint and failure timestamps use
   the entry clock, so a task longer than five minutes can incorrectly reject
   fresh evidence as future-dated.
9. **Resolved:** the fourth P4 correction completed independent final review
   with 29/29 tests passing and no remaining P4 findings.
10. **Open:** the real P4/P5 chain currently proves the first `TRAFFIC_5` step,
    failure/resume, external drift and rollback/retry. It still needs the full
    `5 -> 25 -> 50 -> 100` staircase and cross-process/cross-instance durable
    resume coverage against the fourth P4 correction.

P4 fourth-correction tests pass 29/29. The real P4/P5 chain passes 4/4 against
that correction and the aggregate root tests pass 149/149. Gate 2 remains
blocked until finding 10 closes, the expanded real chain passes, the complete
offline gate passes and a final independent integration review accepts the
result.

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
