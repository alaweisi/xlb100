# Phase 22 E2E / Observability / Security / Performance Gates Report

Date: 2026-07-10
Status: DEVELOPMENT CANDIDATE COMPLETE / PENDING INDEPENDENT REVIEW AND LOCK
Branch: `codex/phase22-e2e-security-performance-gates`
Base: Phase 21 locked main `88eaa61b94688cbb7fe402420575646af4a86418`

## Business Closure

Phase 22 turns the Phase 16-21 implementation into one blocking quality gate rather
than adding another isolated business module. `pnpm gate:phase22` runs fail-closed
probes, cross-phase E2E, browser smoke, authorization attacks, observability tests,
concurrency/performance gates, coverage thresholds, and critical dependency audit.

## Cross-Phase E2E

`tests/integration/phase22CrossPhaseE2E.test.ts` executes one database-backed chain:

`customer order -> Phase 16 quote snapshot -> Phase 20 dispatch/accept -> Phase 18 evidence -> fulfillment completion -> customer confirmation -> Phase 17 complaint/triage/resolution`

The test captures `order_price_snapshots.quote_snapshot` before state transitions and
compares it after completion and aftersale resolution. It also captures the media
checksum and proves that checksum, order linkage, and `external_provider_executed=0`
remain unchanged. The dispatch task reaches `completed`; complaint and evidence rows
remain attached to the same canonical order.

Phase 19 applicability is explicit: a normal customer order has no `business_orders`
mapping and therefore produces no enterprise webhook. In the same suite, an enterprise
order uses canonical `OrderService`, receives a signed mock `order.created` delivery,
keeps `externalProviderExecuted=false`, and retains its quote snapshot after delivery.

## Systematic Authorization Baseline

`tests/security/phase22AuthorizationMatrix.test.ts` performs explicit attack probes:

- customer B reading customer A order, private evidence, and complaint;
- the same customer crossing from Hangzhou to Shanghai;
- a worker crossing city to upload evidence;
- worker/customer/admin cross-role route calls;
- Shanghai admin reads against Hangzhou evidence and complaints;
- enterprise B API key reading enterprise A order;
- read-only API key attempting order creation;
- enterprise API key attempting internal admin access;
- direct database tenant rebinding.

The direct tenant-rebinding probe exposed a real gap in Phase 19 hardening. Append-only
migration `042` adds `business_order_tenant_ownership` and a composite foreign key from
`business_orders(city_code, business_client_id, order_id)`. The attack is now rejected
by MySQL. Locked migrations `037/038` were not edited.

## Concurrency And Performance

`tests/performance/phase22ConcurrencyGates.test.ts` is isolated from normal test counts:

- 40 simultaneous accept requests from two workers against one offer set: one
  `worker_task_acceptances` row, one accepted offer, no 5xx; observed 429-649 ms across
  final local runs, with an 8,000 ms gate.
- 20 simultaneous webhook `run-once` requests against one failed mock delivery: one
  delivery row, `attempt_count=1`, external provider executions 0; observed 5.1-5.5 s,
  with a 10,000 ms gate.

The first webhook storm run took 40.6 s and exposed connection-pool starvation from
waiting advisory locks. Phase 22 changed webhook execution to fail-fast city locking:
one runner processes the city while concurrent runners return a truthful `busy` result
without consuming pool connections waiting for the lock.

## Observability And API Edge

- `/metrics` exports Prometheus request count/duration, rate-limit rejection, webhook
  delivery outcome, and webhook lock-contention counters.
- completion logs include trace ID, city, app type, method, route, status, and duration.
- caller trace IDs propagate through `traceId`, `requestId`, `correlationId`, and the
  response header.
- OTP, OpenAPI, and evidence upload edges have in-memory fixed-window limits and 429 /
  `Retry-After` behavior. Multi-instance production deployment must put the existing
  gateway/WAF or a shared limiter in front; this process-local guard is defense in depth.
- alert rules are checked in at `infra/observability/phase22-alert-rules.yml`.
- operator guidance is in `docs/operations/PHASE22_OBSERVABILITY_RUNBOOK.md`.

## CI Fail-Closed Evidence

`.github/workflows/phase22-quality-gates.yml` invokes the same `pnpm gate:phase22`
command used locally. `scripts/check-phase22-ci-fail-closed.mjs` injected three real
failures and observed non-zero exits:

| Probe | Injected failure | Observed result |
| --- | --- | --- |
| E2E | test throws before chain setup | exit 1; Playwright step not reached |
| Security | authorization matrix throws | exit 1 |
| Coverage | thresholds raised to 101% | exit 1 with four threshold errors |

The self-test itself passes only when all three child commands fail. This proves the
repository-level command is fail-closed.

Hosted run `Phase 22 Quality Gates #1` (`29089467224`) also produced a real red result:
`pnpm/action-setup` rejected duplicate pnpm version sources (`version: 9` in the
workflow and `packageManager: pnpm@9.15.0` in `package.json`) before any quality test
could run. The workflow now removes the duplicate and trusts `packageManager` as the
single version source. A hosted green rerun is pending and is not claimed yet.

## Verification

- `pnpm gate:phase22`: PASS.
- Cross-phase API E2E: 1 file / 1 test passed.
- A/W/C Playwright smoke: 1 spec / 3 tests passed, zero page/console errors.
- Authorization matrix: 1 file / 1 test passed.
- Observability/rate-limit: 1 file / 2 tests passed.
- Performance: 1 file / 2 tests passed, reported separately.
- Phase 22 core coverage: statements 100%, lines 100%, functions 100%, branches 95.83%.
- Critical dependency audit: zero known vulnerabilities after upgrading Vitest and
  coverage-v8 from 2.1.9 to patched 3.2.6.
- Full normal regression: 289 files / 1,149 tests passed; 1 existing Phase 1 todo.
- Typecheck: 17/17 tasks passed.
- Build: 11/11 tasks passed.
- Architecture preflight: passed, including Phase 22 boundary gate.
- Migration verification: `042` replayed as `SKIP`; marker/table/FK each present once;
  orphan ownership and real provider execution counts all equal 0.

## Boundaries

- No real payment, refund, payout, withdrawal, bank, or settlement provider execution.
- No real Amap/map provider or tiles.
- No real OSS/S3/COS provider.
- Webhook success/failure remains explicit mock unless HTTPS is deliberately configured;
  Phase 22 tests execute mock only and external provider calls equal 0.
- No locked Phase 16-21 migration or tag was modified.

## Todo And Test Accounting

Phase 21 baseline was 286 files / 1,145 tests. Phase 22 adds three normal-suite files
and four tests: cross-phase E2E (+1), authorization matrix (+1), and observability (+2).
The performance project adds one separate file / two tests. No prior assertion was
removed, merged, skipped, or converted to todo. The retained todo remains
`tests/contract/api.contract.test.ts:4` from Phase 1.

## User Asset Protection

The five user-owned audit files in the `E:\xlb100` main worktree remain untracked and
were not read into staging, overwritten, or committed by Phase 22.

Phase 22 is development-candidate complete. It is not LOCKED.
