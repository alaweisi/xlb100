# Phase 20 LBS-lite Dispatch Foundation Report

Date: 2026-07-10
Status: LOCKED
Branch: `codex/phase20-lbs-lite-dispatch`

## Business Closure

Worker-owned location upsert -> freshness/privacy validation -> city/SKU/availability filtering -> local distance/ETA ranking -> offer snapshots -> concurrent accept or timeout -> reassignment/manual-review audit is implemented on the existing dispatch and Phase 7 acceptance path. Admin operators can inspect the dispatch board and trigger matching or timeout scans without seeing exact coordinates.

## Isolation And Concurrency

- Migration `039` is append-only and creates two tables plus four composite foreign keys.
- Explicit tests reject cross-city location writes and cross-city task lookup.
- Two workers accepting concurrently produce one `200`, one `409`, and one acceptance row.
- Accept racing timeout produces one success and one conflict; the offer has one terminal state.

## Privacy And Freshness

- Exact coordinates use `private_exact` and are returned only to the authenticated worker.
- Admin receives distance, ETA, score and freshness, never latitude/longitude.
- Stale/future reports are rejected; expired rows, disabled sharing and workers outside radius do not enter offers.

## Provider Boundary

- No payment/refund/settlement/OSS behavior is introduced.
- No Amap or other real map API, key, SDK, HTTP call, or map tile is used.
- Geo envelopes are local/mock and the formal SQL gate asserts real geo provider executions = 0.

## Verification

Formal gate: `scripts/check-phase20-migration-verification.ps1`.

Final dedicated result: 4 files / 10 Phase 20 tests. Existing dispatch/accept regression adds 3 files / 7 tests in the focused run.

- Typecheck: PASS, 17/17 tasks.
- Build: PASS, 11/11 tasks.
- Full regression: PASS, 279 files / 1,133 tests; 1 existing Phase 1 todo.
- Architecture preflight: PASS.
- Admin browser smoke: PASS at `#/dispatch?cityCode=hangzhou`, 200 rendered rows, local/mock label present, no latitude/longitude labels, zero console errors.
- Migration `039`, four composite foreign keys, cross-city reference checks, privacy checks and real geo provider executions = 0: PASS.

## Migration Once-Only Verification

Migration `039_phase20_lbs_lite_dispatch.sql` follows the repository's append-only protocol:

1. `scripts/migrate-local.ps1` derives the migration version from the filename and queries `schema_migrations` before sourcing the SQL file.
2. The migration inserts `039_phase20_lbs_lite_dispatch` into `schema_migrations` only after all DDL and historical-reference hardening statements complete.
3. `scripts/check-phase20-migration-verification.ps1` reruns the migration runner and asserts `SELECT COUNT(*) ... WHERE version='039_phase20_lbs_lite_dispatch'` equals exactly `1`.
4. The verified replay output is `SKIP 039_phase20_lbs_lite_dispatch (already applied)`, followed by `PASS migration 039 once = 1`.

This proves both that the version marker is unique and that a normal migration replay does not execute the Phase 20 DDL a second time.

## User Asset Protection

Before feature commit and merge, the `E:\xlb100` main worktree contained exactly five user-owned untracked audit artifacts. They remain untouched and are excluded from Phase 20 staging and commits:

- `docs/architecture-reaudit-2026-07-09.md`
- `docs/reports/ARCH_BENCHMARK_WSF_LUBAN_ZMN_2026-07-09.md`
- `docs/reports/FRESH_BENCHMARK_XLB_2026-07-10.md`
- `docs/reports/FRESH_BENCHMARK_XLB_2026-07-10.pdf`
- `docs/reports/FULL_BENCHMARK_XLB_VS_COMPETITORS_2026-07-10.md`

The Phase 20 worktree contains no copy or modification of those files. The main worktree still contains exactly these five untracked files after merge and post-merge verification.

## Lock Conclusion

- Feature commit: `01b9da852e967a68424022737216d2194af3eb86`.
- Main merge commit and tag target: `8481577d947b34ebbadfa63050af97f01bd692a0`.
- Tag: `xlb-phase20-lbs-lite-dispatch`.
- Post-merge typecheck, build, architecture preflight, full regression, migration gate, provider boundary checks, and admin browser smoke: PASS.
- Migration replay: `SKIP 039_phase20_lbs_lite_dispatch`; marker count: exactly `1`.
- User-owned audit assets: untouched and uncommitted.

Phase 20 is LOCKED. Phase 21 was not entered during the Phase 20 Lock ceremony.
