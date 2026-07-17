# TKE one-command release Wave 2 result

Date: 2026-07-17 (Asia/Shanghai)

WAVE2_STATUS=SUCCESS

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
10. **Resolved by P6 child-process increment `bd9674a`:** the real P4/P5 chain
    now covers the full `5 -> 25 -> 50 -> 100` staircase, separate-process
    restart, both P5/P4 commit crash windows, reverse rollback, concurrent CAS,
    live-owner rejection, confirmed dead-owner recovery and corrupt-main
    fail-closed behavior against the fourth P4 correction.
11. **Candidate-resolved by P5 runtime increment `e1062b4`:** production and
    staging compose the product file store through a runtime factory.
12. **Candidate-resolved by P6 increments `a98cee6` and `f3bc334`:** the
    in-process fake store was removed and real/child chains use the product
    runtime and file store.
13. **Candidate-resolved by P5 increments `e1062b4` and `4518fd4`:** recovery
    uses fenced claims, exact nonce revalidation and adversarial ABA tests.
14. **Candidate-resolved by P5 third correction `4518fd4`:** confirmation is
    bound to a non-downgradable 15-minute production recovery floor.
15. **Candidate-resolved by P5 second correction `e1062b4`:** quarantine and
    recovery paths reject symlink/junction escape and revalidate physical
    containment before rename.
16. **Candidate-resolved by P5 second correction `e1062b4`:** persisted
    progress recursively rejects confirmation, approval, decision, grant,
    token and secret material.
17. **Candidate-resolved by P5 third correction `4518fd4`:** a dead recovery
    owner can be fenced and its exact claim resumed after each recorded crash
    window without isolating a newly acquired canonical owner.
18. **Candidate-resolved by P5 third correction `4518fd4`:** production and
    staging runtime reject simulation/memory/custom-store/mode/fake-clock
    options; simulation is a separate manifest-only entry.
19. **Candidate-resolved by P5 third correction `4518fd4`:** the product
    module no longer exports a constructor capable of lowering the recovery
    floor. P6 acceptance `f3bc334` tests the public export surface.
20. **Independently resolved by P4 fifth correction `e8226be`:** forward and
    rollback persistence now use owner-specific pending receipts and a fenced
    commit guard with ownership checks around durable writes. Deterministic
    short-lease and cross-process tests cover takeover before receipt, after
    pending receipt, after durable receipt, rollback persistence, live-owner
    refusal, dead-owner recovery and guard ABA protection. Independent directed
    review reports `P4_REAUDIT=CLOSED` with no P0-P3 finding.

The accepted candidate passes P4 35/35, P5 35/35, P6 65/65 and the serialized
complete offline gate 193/193. PowerShell safety entry tests, Helm lint/render,
kubeconform (21 valid, 0 invalid), Terraform offline tests (3/3), static
delivery/release-contract checks and N5 offline validation also pass. Test
files run serially in the aggregate gate so cross-file CPU contention cannot
invalidate the deliberately short P4 fencing-window test; concurrency remains
exercised inside its dedicated process and lease tests. Findings 11-20 are
closed, the complete gate passes, and independent final plus directed P4
reviews report no remaining open finding. Gate 2 is accepted.

## Integrated baseline

- Gate 1 baseline: `ad44833`
- P4 resumable orchestrator source: `dd8ad25`, hardened by `77b3b86` and
  fifth-correction integration `e8226be`
- P5 traffic cutover source: `94f8979`, hardened by `efe3a93`
- P6 deterministic simulation source: `dab4c39`, hardened by `0aebc80`
  and `b4f69df`; child-process and recovery increments: `bd9674a`, `a98cee6`
  and `f3bc334`
- P5 durable-store corrections: `e1062b4` and `4518fd4`
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

## Next gate

N7 TKE Staging repository work may start from this candidate. Real cloud work
still requires reviewed inputs, immutable TCR digests and separate external
operation authorization before any billable or provider action. N7 must produce
a complete staging evidence bundle and real `PASS`; N8 production remains
blocked until that result satisfies the production-plan gate.
