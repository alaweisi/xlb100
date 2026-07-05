# Phase 14 Staging Acceptance

## RC baseline

- Current commit: `9c7bff5`
- Baseline commit: `9c7bff5 chore(deploy): validate staging bootstrap`
- RC tag target: `phase14-staging-rc1`

## Staging container status summary

- `xlb-mysql-staging`: Up, healthy, host port `3307` -> container port `3306`
- `xlb-redis-staging`: Up, healthy, host port `6380` -> container port `6379`
- `xlb-backend-staging`: Up, host port `3000` -> container port `3000`
- `xlb-customer-staging`: Up, host port `4173` -> container port `4173`
- `xlb-worker-staging`: Up, host port `4174` -> container port `4173`
- `xlb-admin-staging`: Up, host port `4175` -> container port `4173`

## Validation summary

- typecheck: PASS
- tests: PASS
- preflight: PASS
- staging build/up: PASS
- migrate: PASS
- seed: PASS
- smoke: PASS

## Changed files since staging bootstrap

- `docs/release/PHASE14_STAGING_ACCEPTANCE.md`

## Remaining blocker

- none

## Manual UAT checklist

1. Customer create order
2. Payment metadata snapshot
3. Dispatch city stream
4. Worker accept and fulfill
5. Admin city-scope review
6. Certification ownership check
7. Aftersale refund request
8. RefundApproved event
9. Ledger reversal
10. Audit log / trace check
