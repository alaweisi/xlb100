# Phase 20 Test Coverage

Date: 2026-07-10
Status: LOCKED

| Layer | File | Tests / coverage |
| --- | --- | --- |
| Contract | `tests/contract/phase20Dispatch.contract.test.ts` | 3: valid location, bounds, forged identity rejection |
| Unit | `tests/unit/geoProvider.test.ts` | 3: deterministic geocode, honest envelope, deterministic distance/ETA |
| Security | `tests/security/phase20GeoSecurity.test.ts` | 3: no network/Amap path, composite FKs, worker-only exact location |
| Integration | `tests/integration/phase20LbsLiteDispatch.test.ts` | 1 flow with fresh/stale/radius/privacy/cross-city/provider/concurrency assertions |

Compared with locked Phase 19, Phase 20 adds 4 top-level test files and 10 tests; no old test is removed, merged, skipped, or converted to todo. The retained todo remains `tests/contract/api.contract.test.ts:4` from Phase 1.

Full count reconciliation: Phase 19 locked at 275 files / 1,123 tests; Phase 20 candidate passes 279 files / 1,133 tests. The delta is exactly +4 files / +10 tests.

Migration verification is part of the formal gate rather than a Vitest case: it replays the migration runner, proves version `039_phase20_lbs_lite_dispatch` is present exactly once, and then executes all 10 Phase 20 tests.
