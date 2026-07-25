# XLB Three-App Mobile M3 Acceptance

Date: 2026-07-25

Gate status: **PARTIAL PASS — the formal three-role data-plane E2E passes in an
isolated database; the equivalent three-APK Tencent-cloud journey remains
blocked by the missing Worker authentication routes.**

## Repeatable command

```powershell
pnpm mobile:m3:gate
```

The command uses `scripts/run-vitest-projects.mjs` to:

1. create a uniquely named `xlb_test_*` database;
2. apply the current migration chain;
3. execute the current official seed chain;
4. run only the selected M3 database integration tests;
5. drop the isolated database.

The 2026-07-25 run created and then removed:

```text
xlb_test_1784975048321_19304
```

No persistent business or production data was used or changed.

## Formal journey evidence

### Authenticated Worker lifecycle

`tests/integration/phase23dWorkerLifecycleE2E.test.ts` passed and proved:

```text
Customer authenticated
→ order created from the official SKU
→ Admin/Operator dispatch run
→ Worker authenticated
→ same-city task visible
→ cross-city task access denied
→ Worker accepted task
→ fulfillment started
→ PNG evidence stored locally through the formal evidence API
→ fulfillment completed
→ Customer confirmed completion
```

The test also verified the final fulfillment, city scope, evidence count,
completion outbox event and `externalProviderExecuted = 0`.

### Cross-phase order, complaint and Admin lifecycle

`tests/integration/phase22CrossPhaseE2E.test.ts` passed and proved:

```text
official quote snapshot
→ dispatch and Worker acceptance
→ Worker start/evidence/complete
→ Customer confirmation
→ Customer complaint on the same order
→ Admin triage
→ Admin resolution
```

The test verified:

- the original quote snapshot remains byte-for-byte equal after the journey;
- the evidence checksum and order link remain intact;
- the complaint references the same order;
- the dispatch task reaches `completed`;
- the object-storage provider remains local and no external provider is
  falsely reported;
- the enterprise webhook branch preserves its separate order snapshot and
  records `externalProviderExecuted = false`.

## Result

| Test file | Tests | Result |
| --- | ---: | --- |
| authenticated Worker lifecycle | 1 | Pass |
| cross-phase three-role data flow | 1 | Pass |
| Total | 2 | Pass |

The combined database integration duration was 4.32 seconds. Migration and seed
preparation also completed successfully.

## Business-boundary conclusion

- Catalog/SKU comes from the official seed source.
- Amounts come from the formal quote snapshot.
- State transitions use the real order, dispatch, fulfillment and aftersale
  APIs.
- No front-end state is used to advance a backend workflow.
- No Mock order, fake Worker session or fake payment/refund success was added.
- Provider execution stays fail-closed/local.

## Remaining APK/cloud gate

The Tencent test runtime still returns 404 for:

```text
POST /api/auth/worker/code
GET  /api/auth/worker/debug-code
```

Therefore the same journey cannot yet be replayed through all three installed
APKs against Tencent. Closing the complete M3 gate requires an explicitly
authorized Tencent deployment/reconciliation, followed by device replay and
screenshots/logcat evidence.
