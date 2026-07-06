# Phase 14 CI Gate Change Audit

## Decision

- Audit status: PASS
- Commit audited: `60ba2105821d7a1c55d63a051ce64f3333529302`
- Commit subject: `chore(ci): allow phase 14r refund reversal gates`
- Audit date: 2026-07-06
- Production release status after audit: NO-GO / BLOCKED
- Scope of this audit: documentation and review evidence only; no CI gate, business logic, ledger/replay/audit logic, schema, deploy, or tag changes.

Reviewer decision: PASS. The change is narrow enough for Phase 14R production-readiness purposes because it adds explicit Phase 14R refund/reversal file and migration exceptions to older phase structural gates, while replay, immutability, stableHash audit proof, ledger idempotency, and runtime behavior validation remain active.

## Files Changed By Audited Commit

`git show --stat 60ba210` reports 13 changed gate scripts:

- `scripts/check-phase12-no-mutation-settlement-payment-ledger-refund-reversal-export.ps1`
- `scripts/check-phase12-only-preparation-table-writes.ps1`
- `scripts/check-phase8j-forbidden-zone.ps1`
- `scripts/check-phase8k-forbidden-zone.ps1`
- `scripts/check-phase8l-forbidden-zone.ps1`
- `scripts/check-phase9a-no-migration.ps1`
- `scripts/check-phase9b-forbidden-zone.ps1`
- `scripts/check-phase9b-no-migration.ps1`
- `scripts/check-phase9c-forbidden-zone.ps1`
- `scripts/check-phase9c-no-migration.ps1`
- `scripts/check-phase9d-forbidden-zone.ps1`
- `scripts/check-phase9e-forbidden-zone.ps1`
- `scripts/check-worker-receivable-statement-audit-forbidden-zone.ps1`

The requested ledger-script inspection commands produced no patch output because `60ba210` did not modify files matching `scripts/check-ledger-*.ps1`.

## Reason For Change

Phase 14R intentionally introduced a refund approval and ledger reversal slice. Existing Phase 8/9/12 structural gates were built before refund/reversal code existed and treated terms such as `refund`, `aftersale`, and `reversal` as false blockers even when they appeared in the approved Phase 14R implementation files.

The commit adjusts those older structural gates so they can evaluate the Phase 14R branch without blocking solely on approved refund/reversal paths. The change does not approve production deployment and does not replace production owner approval.

## Exact Allowed Exception

The allowed exception is limited to Phase 14R refund reversal artifacts:

- Migration exception: `db/migrations/027_aftersale_refund_reversal.sql` is added beside the existing Phase 12 migration exception in Phase 9 migration gates.
- Table-write exception: `backend/src/aftersale` may write `aftersale_refund_requests` in the Phase 12 table-write gates.
- Forbidden-term exception: older forbidden-zone gates allow exact Phase 14R files under aftersale refund, event outbox typing/validation, and ledger reversal/replay integration. The allowlists enumerate concrete files such as `backend/src/aftersale/refund/refundService.ts`, `backend/src/events/refundEvents.ts`, `backend/src/ledger/ledgerReversalService.ts`, `backend/src/ledger/ledgerReversalRepository.ts`, `backend/src/ledger/ledgerOutboxConsumer.ts`, `backend/src/ledger/replay/replayValidator.ts`, `packages/types/src/refund.ts`, and `packages/validators/src/refundSchema.ts`.

No catch-all directory exception such as `backend/src/ledger/**` was added. The changed gates still scan diffs and skip only exact allowed files or the exact allowed table pattern.

## Gate Strength Audit

| Audit question | Result | Evidence |
| --- | --- | --- |
| Only allows Phase 14R refund reversal structural changes | PASS | The changed migration gates add only `027_aftersale_refund_reversal.sql`; the changed table-write gates add only `backend/src/aftersale = aftersale_refund_requests`; forbidden-zone gates list exact Phase 14R files. |
| Does not bypass replay validation | PASS | `scripts/check-ledger-replay.ps1` was not changed by `60ba210`; `scripts/preflight-architecture.ps1` still invokes it after Phase 12 gates. |
| Does not bypass immutability validation | PASS | `scripts/check-ledger-immutability.ps1` was not changed by `60ba210`; `scripts/preflight-architecture.ps1` still invokes it after replay validation. |
| Does not bypass stableHash checks | PASS | `check-ledger-immutability.ps1` still imports `packages/shared/deterministic/stableHash.ts`, recomputes expected snapshot hashes, and fails on missing or mismatched audit snapshot hashes. |
| Does not bypass ledger single-write guard | PASS | The audited commit does not edit ledger runtime services. Existing integration coverage still includes `tests/integration/ledgerIdempotency.test.ts`; Phase 14R reversal code also checks existing reversal entries under transaction before writing. |
| Does not broadly ignore `backend/src/ledger/**` | PASS | The allowlists name individual ledger files; no wildcard ledger directory skip was introduced. |
| Does not create catch-all allowlists | PASS | No `*`, directory-wide, or term-wide skip was added. Existing diff scanning remains active and only exact files/table patterns are skipped. |
| Preserves runtime behavior validation | PASS | Preflight still runs runtime-oriented Phase 9 gates plus `check-ledger-replay.ps1` and `check-ledger-immutability.ps1`; full typecheck, test, preflight, and staging smoke validation passed for the audited release candidate. |

## Commands Run

Inspection:

```powershell
git status --short
git log -8 --oneline
git show --stat 60ba210
git show 60ba210 -- scripts/check-ledger-*.ps1
git diff 0f0f26d..60ba210 -- scripts/check-ledger-*.ps1
git show --name-only --format=fuller 60ba210
git show --stat --patch --find-renames 60ba210 -- scripts
Get-Content scripts\check-ledger-replay.ps1
Get-Content scripts\check-ledger-immutability.ps1
Get-Content scripts\preflight-architecture.ps1
```

Validation:

```powershell
git diff --check
npx pnpm typecheck
npx pnpm test -- --bail=1 --reporter=verbose
npx pnpm preflight
scripts\smoke-staging.ps1
```

## Validation Results

| Command | Result |
| --- | --- |
| `git diff --check` | PASS |
| `npx pnpm typecheck` | PASS |
| `npx pnpm test -- --bail=1 --reporter=verbose` | PASS |
| `npx pnpm preflight` | PASS, including Phase 8/9/12 gates, ledger replay, and ledger immutability proof |
| `scripts\smoke-staging.ps1` | PASS |

## Production Readiness Impact

`PROD-OPS-011` is PASS for CI gate script change audit evidence.

Production remains NO-GO / BLOCKED until the other non-PASS production ops items are closed, including release-window replay/immutability timing and release owner approval.
