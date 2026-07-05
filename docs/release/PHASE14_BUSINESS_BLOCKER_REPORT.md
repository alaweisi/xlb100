# Phase 14 Business Blocker Report

Date: 2026-07-05
Gate analyzed: `scripts/check-phase9a-route-order.ps1`

## Summary

`check-phase9a-route-order.ps1` fails because it deterministically compares `git diff --name-only main...HEAD` against a narrow allowlist.

The gate allows only:

- `backend/src/preparation/envelopeRoutes.ts`
- `backend/src/preparation/envelopeService.ts`
- `backend/src/app.ts` is implicitly exempted

The current branch contains additional backend changes outside that allowlist, so the gate fails.

## Root Cause Category

**Primary category: deterministic mismatch**

This is not a live routing logic failure, not missing city configuration, and not invalid order routing state. The failure is caused by a deterministic mismatch between:

- the gate's expected changed-file set for the current phase, and
- the actual changed backend files on the branch.

Secondary category: **gate allowlist / phase-scope mismatch**.

## Failing Files

The gate reports these disallowed backend files:

| File | Module | Change type observed | Gate classification |
| --- | --- | --- | --- |
| `backend/src/governance/governanceIntentService.ts` | governance | JSON parsing normalization | Outside Phase 9A route-order allowlist |
| `backend/src/governance/governanceReadinessService.ts` | governance | JSON parsing normalization | Outside Phase 9A route-order allowlist |
| `backend/src/ledger/ledgerAccrualService.ts` | ledger / audit | Ledger audit event recording | Outside Phase 9A route-order allowlist |
| `backend/src/ledger/ledgerRepository.ts` | ledger | Single-write key helper | Outside Phase 9A route-order allowlist |
| `backend/src/planner/plannerPlanBuilder.ts` | planner / deterministic hash | `stableHash` and JSON parsing normalization | Outside Phase 9A route-order allowlist |
| `backend/src/settlement/workerReceivableStatementExportHash.ts` | settlement / deterministic hash | `stableHash` normalization | Outside Phase 9A route-order allowlist |

Allowed backend files present in the same branch:

- `backend/src/preparation/envelopeRoutes.ts`
- `backend/src/preparation/envelopeService.ts`
- `backend/src/app.ts`

## Exact Gate Logic

The script:

1. Runs `git diff --name-only main...HEAD`.
2. Scans changed files under `backend/src/`.
3. Ignores `backend/src/app.ts`.
4. Allows only the two preparation envelope files.
5. Fails if any other backend source file is changed.

Therefore any backend change outside the two preparation envelope files triggers failure, even if the change is valid for Phase 13/14 readiness work.

## Repair Plan Only

### SAFE FIX (can auto apply after approval)

1. Update `scripts/check-phase9a-route-order.ps1` to align with current phase reality.

   Minimal safe options:
   - Rename/reword the gate to reflect actual purpose, or
   - keep the script name but update the allowlist to include approved Phase 13/14 readiness files, or
   - skip this locked Phase 9A allowlist check when `docs/CURRENT_STATE.md` says Phase 13 is complete / Phase 14 is in progress.

   Exact file involved:
   - `scripts/check-phase9a-route-order.ps1`

2. Preferred minimal fix:

   Keep locked Phase 9A behavior for Phase 9A branches, but make the check phase-aware using `docs/CURRENT_STATE.md`.

   If Phase 14 is in progress, the gate should not use the Phase 9A-only backend allowlist as a hard blocker for Phase 13/14 ledger/audit readiness files.

### DATA FIX (requires migration or repair script)

None for this specific gate.

The failure is not caused by database data. It is entirely based on Git diff paths.

### BLOCKER (requires design decision)

Decide whether historical locked-phase gates should remain active unchanged on later-phase branches.

Design choice needed:

- Option A: Locked phase gates are immutable and only apply when locking that phase.
- Option B: Locked phase gates continue to run forever but must support explicit future-phase allowlists.
- Option C: Preflight dispatches phase-specific gate sets based on `docs/CURRENT_STATE.md`.

Until this is decided, this gate will keep blocking valid later-phase backend changes.

## Minimal Safe Fix Recommendation

Recommended path: **SAFE FIX after approval**.

Implement a phase-aware guard in `scripts/check-phase9a-route-order.ps1`:

- Read `docs/CURRENT_STATE.md`.
- If Phase 14 is `IN PROGRESS`, do not enforce the Phase 9A-only preparation envelope allowlist.
- Continue enforcing the original allowlist for Phase 9A lock validation contexts.

This keeps Phase 9A protection intact while avoiding false blockers on later readiness phases.

## Non-Recommendations

Do not change:

- `backend/src/governance/governanceIntentService.ts`
- `backend/src/governance/governanceReadinessService.ts`
- `backend/src/ledger/ledgerAccrualService.ts`
- `backend/src/ledger/ledgerRepository.ts`
- `backend/src/planner/plannerPlanBuilder.ts`
- `backend/src/settlement/workerReceivableStatementExportHash.ts`

Those files may still need normal code review, but editing them is not the minimal fix for this gate failure.

Do not perform:

- DB repair
- schema migration
- runtime routing changes
- order state mutation
- city configuration changes

## Readiness Impact

This blocker is CI governance-related. It does not prove a production runtime routing defect.

Current go/no-go impact:

- **Staging**: blocked until phase-gate policy is clarified or the gate is made phase-aware.
- **Internal test**: possible only if the failing Phase 9A gate is explicitly waived for Phase 14 readiness runs.

