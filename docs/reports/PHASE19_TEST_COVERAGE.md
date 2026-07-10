# Phase 19 Test Coverage

Date: 2026-07-10
Status: LOCKED

| Layer | File | Coverage |
| --- | --- | --- |
| Contract | `tests/contract/enterprise.contract.test.ts` | client, scope, external order, idempotency, callback scheme, event allowlist |
| Unit | `tests/unit/enterpriseWebhookProvider.test.ts` | truthful mock envelopes and unsafe HTTPS callback rejection |
| Unit | `tests/unit/enterpriseWebhookSignature.test.ts` | canonical payload, valid HMAC, changed payload/timestamp, forged/malformed signature rejection |
| Integration | `tests/integration/phase19EnterpriseOpenApi.test.ts` | onboarding, scope denial, agreement order, replay/conflict, client/city isolation, DB tenant rejection, subscription isolation, signed delivery/retry/deduplication, bill issue |
| Security | `tests/security/phase19EnterpriseSecurity.test.ts` | separate API key auth, hashed persistence, forbidden finance/dispatch imports, composite enterprise foreign keys |

Formal command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-phase19-migration-verification.ps1
```

The gate also verifies migrations `037` and `038` once each, eight tables, two enterprise composite foreign keys, three idempotency unique indexes, zero global-city rows, valid credential hashes, zero cross-city/cross-client references, and zero real webhook-provider executions in verification data.

## Dedicated 17-Test Composition

The gate reports top-level Vitest cases, not the much larger number of assertions inside the integration flow:

1. Contract: valid enterprise client and least-privilege credential.
2. Contract: external identity, idempotency key, and service address requirements.
3. Contract: webhook event allowlist and HTTPS/mock callback schemes.
4. Provider: truthful mock success with `externalProviderExecuted=false`.
5. Provider: explicit retryable mock failure.
6. Provider: reject plain HTTP.
7. Provider: reject localhost.
8. Provider: reject loopback IP.
9. Provider: reject URL credentials.
10. Provider: reject non-443 custom ports.
11. Signature: accept authentic HMAC and stable canonical JSON.
12. Signature: reject changed payload or timestamp.
13. Signature: reject forged or malformed signatures.
14. Security: keep API key auth separate and never persist plaintext keys.
15. Security: forbid payment/refund/settlement/dispatch mutations from Phase 19.
16. Security: require same-enterprise composite foreign keys for agreements and webhook deliveries.
17. Integration: run the complete enterprise lifecycle with explicit negative assertions for scope overreach, cross-city access, cross-client order/subscription/internal API access, direct SQL tenant mismatch, duplicate order submission, conflicting idempotency reuse, duplicate scheduler execution, stable delivery id on retry, credential revocation, and inactive clients.

This is sufficient for the Phase 19 acceptance surface because API authentication, authorization, tenant isolation, database enforcement, idempotency, signature integrity, provider truthfulness, and lifecycle behavior each have an active negative test. It is phase acceptance evidence, not a claim that later Phase 22 penetration, load, or chaos testing is complete.

## Idempotency Ownership

- XLB guarantees one persisted delivery per `(city_code, subscription_id, event_id)` and reuses the same `delivery_id` for every retry attempt.
- Re-running the scheduler does not create a second delivery row; the integration test checks the count remains unchanged.
- A network timeout can still make an HTTPS receiver observe the same request more than once. The receiver must deduplicate on `X-XLB-Delivery-Id`; XLB keeps that id stable specifically for this purpose.
- XLB is the webhook sender, not an inbound webhook receiver. The exported `assertWebhookSignature` helper demonstrates the required receiver behavior and rejects altered payloads, timestamps, forged signatures, and malformed signatures.

## Test Count Reconciliation

- Phase 18 lock baseline: 270 files / 1,106 tests.
- Locked Phase 19 result: 275 files / 1,123 tests, an increase of 5 files and 17 top-level tests.
- Compared with the first Phase 19 candidate (274 files / 1,119 tests), audit hardening adds 1 file, 4 top-level tests, and 24 explicit assertion points across signature, database tenant, scope, cross-client, and delivery-id behavior.
- No historical test or assertion was removed, merged, or converted to a skip/todo.

Final verification on 2026-07-10:

- Phase 19 gate after audit hardening: 5 files / 17 tests passed.
- Full regression: 275 files / 1,123 tests passed; 1 existing Phase 1 todo retained.
- Typecheck: 17/17 tasks passed.
- Build: 11/11 tasks passed.
- Architecture preflight passed.
- Admin browser smoke passed at `/enterprise?cityCode=hangzhou`: enterprise operations rendered with live rows and zero console errors.

The retained todo remains `tests/contract/api.contract.test.ts:4` (`Phase 1: customer API contract`). It predates Phase 19; Phase 19 adds no todo or skip.
