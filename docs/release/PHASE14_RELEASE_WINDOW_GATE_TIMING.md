# Phase 14 Release Window Replay/Immutability Gate Timing

## Decision

- Procedure status: READY FOR RELEASE-WINDOW USE
- `PROD-OPS-010` Replay/immutability release gate timing: NOT RUN
- Production release status: NO-GO / BLOCKED
- Date: 2026-07-06
- Scope: documentation only; no deploy, tag, CI gate, schema, business logic, or ledger/replay/audit logic change.

This document tightens the release-window timing required to close `PROD-OPS-010`. It does not mark `PROD-OPS-010` PASS. Final PASS still requires isolated pre-cut and post-cut `npx pnpm preflight` evidence from the actual production release window.

## Why Isolation Is Required

`scripts/check-ledger-replay.ps1` and `scripts/check-ledger-immutability.ps1` validate the current database state. They compare persisted ledger, outbox, and audit data with deterministic replay/audit expectations. Any concurrent process that writes orders, payments, fulfillments, ledger entries, refund approvals, reversal rows, or audit events can make the proof observe a moving target.

During the 2026-07-06 repository validation for the monitoring scaffold, an initial `npx pnpm preflight` run failed with a ledger replay mismatch while the test suite and staging smoke were also running. A standalone rerun of `npx pnpm preflight` passed, including:

- `check-ledger-replay: passed`
- `check-ledger-immutability: passed`

That standalone PASS is acceptable for repo validation because the failed run was concurrent with other validation writes and the isolated rerun passed. It is not sufficient for `PROD-OPS-010` production PASS because the required release-window evidence has not been collected.

## Release-Window Rule

The preflight/replay/immutability gate must run in a quiet release window:

- Do not run `npx pnpm test`, staging smoke, production smoke, manual UAT, seed scripts, migration drills, rollback drills, refund approval tests, ledger consumer runs, or ad hoc DB write checks concurrently with the replay gate.
- Do not perform concurrent DB writes during the final release-window proof.
- Do not start the deploy/cut step until the pre-cut preflight log is complete and PASS.
- Do not mark the cut complete until the post-cut preflight log is complete and PASS.
- If any replay mismatch appears during the release window, production remains NO-GO until the mismatch is explained, evidence is attached, and the release owner explicitly approves the next action.

## Required Sequence

| Step | Timing | Command/action | Required result |
| --- | --- | --- | --- |
| 1 | Before pre-cut gate | Freeze non-release DB writers and stop manual/UAT/test/smoke activity against the gate database. | Release owner confirms quiet window. |
| 2 | Pre-cut gate | `npx pnpm preflight` | Full command exits 0 and logs replay and immutability PASS. |
| 3 | Evidence capture | Save the complete pre-cut log. | Log includes commit hash, timestamp, operator, environment, and PASS output. |
| 4 | Cut/deploy window | Execute only the approved production cut/deploy procedure. | No unrelated DB write workload is introduced. |
| 5 | Post-cut gate | `npx pnpm preflight` | Full command exits 0 and logs replay and immutability PASS. |
| 6 | Evidence capture | Save the complete post-cut log. | Log includes commit hash, timestamp, operator, environment, and PASS output. |
| 7 | Review | Release owner and Ledger owner review both logs. | `PROD-OPS-010` may be considered for PASS only after review. |

## Required Commands

Pre-cut:

```powershell
npx pnpm preflight
```

Post-cut:

```powershell
npx pnpm preflight
```

The logs must include these lines in both runs:

```text
check-ledger-replay: passed
check-ledger-immutability: passed
```

## Evidence To Attach

Create or update the release evidence artifact:

```text
docs/release/evidence/PHASE14_PROD_RELEASE_GATE_<timestamp>.md
```

It must include:

- Release candidate commit hash and image/tag identifiers under evaluation.
- Environment name and database target used by the gate.
- Release owner, Ledger owner, and command executor.
- Quiet-window start/end timestamp.
- Explicit statement that no tests, smoke, manual UAT, seed, migration, rollback, or ad hoc DB write activity ran concurrently with the replay gate.
- Full pre-cut `npx pnpm preflight` log.
- Full post-cut `npx pnpm preflight` log.
- Evidence that both logs contain `check-ledger-replay: passed`.
- Evidence that both logs contain `check-ledger-immutability: passed`.
- Explanation and owner decision for any failed or retried release-window gate run.

## Failure Handling

| Condition | Required decision |
| --- | --- |
| Pre-cut preflight fails for replay or immutability | Production release is NO-GO; do not start cut/deploy. |
| Post-cut preflight fails for replay or immutability | Production release remains NO-GO; follow rollback/forward-fix decision path with Release and Ledger owners. |
| Any replay mismatch occurs during the release window | Treat as production NO-GO until explained with evidence. |
| Gate was run while tests/smoke/UAT or other DB writers were active | Evidence is invalid for `PROD-OPS-010`; rerun in a quiet window and document the invalidated run. |
| Concurrent failure followed by standalone PASS | Acceptable only when the concurrent failure is documented, the rerun is isolated, and release owners agree it is not masking a real replay issue. |

## PASS Criteria For `PROD-OPS-010`

`PROD-OPS-010` may be marked PASS only when all of the following exist:

- Pre-cut `npx pnpm preflight` log from the actual release window.
- Post-cut `npx pnpm preflight` log from the actual release window.
- Both logs are from the intended production release candidate and environment.
- Both logs include replay and immutability PASS output.
- Both runs were isolated from tests, smoke, manual UAT, and other DB writes.
- Any failed or retried gate run is documented with an explanation and owner decision.
- Release owner and Ledger owner approve the evidence.

## Current Conclusion

The release-window procedure is ready, and the transient concurrent replay mismatch is documented here. `PROD-OPS-010` remains NOT RUN because final isolated pre-cut and post-cut production release-window evidence does not yet exist.
