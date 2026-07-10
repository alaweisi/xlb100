# Phase 18 Test Coverage

Date: 2026-07-10
Status: development verification complete; Lock not yet declared

## Automated Coverage

| Layer | File | Coverage |
| --- | --- | --- |
| Contract | `tests/contract/evidence.contract.test.ts` | local/mock-only envelope, no external success/public URL, dispute request rules |
| Unit | `tests/unit/evidenceFileSafety.test.ts` | JPEG/PNG/WebP signatures, MIME/extension match, empty/oversize/path rejection |
| Unit | `tests/unit/objectStorageProvider.test.ts` | actual local write/read, mock write/read, honest envelopes, key traversal rejection |
| Unit | `tests/unit/customerConfirmationStateMachine.test.ts` | pending terminal transitions and invalid transitions |
| Integration | `tests/integration/phase18FulfillmentEvidence.test.ts` | worker upload, local persistence, order/fulfillment/complaint binding, completion snapshot, customer confirm/dispute, Phase 17 timeline, private content, explicit cross-city API rejection/empty results, direct cross-city SQL rejection, terminal freeze |
| Security | `tests/security/phase18EvidenceSecurity.test.ts` | no real cloud provider path and HTTP 5 MiB parser limit |

Formal gate:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-phase18-migration-verification.ps1
```

The gate also verifies migration `035` is applied once, three tables exist, global-city rows remain zero, and every persisted asset has no external-provider execution and no public URL.

## Final Development Verification

- Phase 18 migration verification gate before city hardening: PASS, 6 files / 24 tests.
- Monorepo typecheck: PASS, 17/17 tasks.
- Monorepo build: PASS, 11/11 tasks.
- Architecture preflight: PASS.
- Full repository tests after city hardening: PASS, 270 files / 1,106 tests; 1 existing todo.
- The first full run exposed three historical Phase 7 recursive scanners that entered the new independent Phase 18 submodule. Their ownership was narrowed to Phase 7 top-level lifecycle files; the Phase 18 submodule remains covered by its stricter provider, finance, privacy, and city-scope gate. The three affected historical test files then passed 7/7, followed by a complete green rerun.

## Existing Todo

The retained todo is `tests/contract/api.contract.test.ts:4`, identifier `Phase 1: customer API contract`. It predates Phase 18 and is the original Phase 1 placeholder; Phase 18 introduced no new todo. It remains visible rather than being silently converted to a passing placeholder.

## City-Isolation Hardening

Append-only migration `036_phase18_city_reference_hardening.sql` adds composite foreign keys over city, order, fulfillment, complaint, and media identities. Integration tests now prove active enforcement rather than only checking a clean dataset:

- a Shanghai-scoped admin receives no Hangzhou order evidence or complaint rows;
- a Shanghai-scoped worker cannot upload to a Hangzhou fulfillment;
- a direct SQL insert combining `city_code='shanghai'` with Hangzhou order/fulfillment IDs fails its composite foreign key.
