# Phase 22 Test Coverage

Date: 2026-07-10
Status: development candidate complete

| Layer | File | Evidence |
| --- | --- | --- |
| Cross-phase E2E | `tests/integration/phase22CrossPhaseE2E.test.ts` | Phase16 quote immutability through Phase20 dispatch, Phase18 evidence, Phase17 complaint, plus Phase19 webhook applicability |
| Security | `tests/security/phase22AuthorizationMatrix.test.ts` | cross-customer, role, city, enterprise key, and DB tenant-rebinding probes |
| Performance | `tests/performance/phase22ConcurrencyGates.test.ts` | 40-request offer race and 20-request webhook storm |
| Observability | `tests/unit/phase22Observability.test.ts` | trace propagation, metrics, 429, retry and busy counters |
| Browser | `tests/e2e/phase21-three-app-smoke.spec.ts` | retained A/W/C real-API smoke with zero browser errors |
| CI behavior | `scripts/check-phase22-ci-fail-closed.mjs` | intentional E2E/security/coverage failures each return non-zero |

Normal full regression: 289 files / 1,149 tests plus one existing Phase 1 todo.
Performance is separate: 1 file / 2 tests. Playwright is separate: 1 spec / 3 tests.

Coverage scope is the new Phase 22 observability and rate-limit core. Gate minimums are
80% statements/lines/functions and 75% branches; observed results are 100%, 100%, 100%,
and 95.83% respectively. Failure injection raises each threshold to 101% and proves
the command exits non-zero.
