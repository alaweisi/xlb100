# Phase 19 Enterprise OpenAPI And Webhook Foundation Report

Date: 2026-07-10
Status: LOCKED
Branch: `codex/phase19-enterprise-openapi-webhook`

## Objective

Phase 19 closes the minimum B-side platform gap against Wanshifu and Luban Daojia: enterprise onboarding, scoped integration credentials, external order identity, agreement pricing, order/status callbacks, delivery retry, and monthly bill snapshots.

## Delivered

- Eight city-scoped enterprise tables in append-only migration `037`, plus append-only tenant hardening migration `038`.
- Enterprise client/contact onboarding with active, suspended, and closed lifecycle.
- One-time API key issuance, SHA-256 persistence, least-privilege scopes, expiry, revocation, and last-use audit.
- Enterprise order create/list/detail APIs with external id and idempotency constraints.
- Existing `OrderService`, official SKU, quote snapshot, order outbox, and agreement-price override reuse.
- Webhook subscriptions for Phase 17/18 order, fulfillment, evidence, confirmation, and aftersale events.
- AES-GCM protected signing secrets and HMAC-SHA256 signatures over stable canonical payloads, with a receiver-side rejection helper.
- Idempotent delivery logs, exponential retry, manual retry, pause/activate, and dead-letter state.
- Truthful mock provider envelopes plus opt-in HTTPS delivery with SSRF-oriented URL checks.
- Monthly bill snapshot create/list/issue workflow with no invoice, payment, settlement, or payout execution.
- Admin enterprise operations page and checked-in OpenAPI 3.1 document.

## Isolation And Security

- API key authentication is separate from Bearer authentication.
- City and client identities come only from the credential record.
- Strict request schemas reject forged `cityCode` or `businessClientId` fields.
- External order and idempotency identities are unique inside city/client scope.
- Another client key cannot read an external order or list another client's webhook subscriptions; API keys cannot enter internal bill or webhook mutation routes.
- Composite foreign keys bind clients, SKUs, orders, subscriptions, outbox events, deliveries, and bill snapshots to one city. Migration `038` additionally binds agreement/order and subscription/delivery references to the same `business_client_id`.
- Plaintext API keys are never persisted. Webhook secrets are encrypted at rest and returned once.
- HTTPS callbacks reject HTTP, credentials, non-443 ports, localhost, and private/resolved-private addresses.

## Boundaries

- No payment provider, refund, payout, withdrawal, ledger, or settlement execution.
- No Phase 20 worker location, ETA, ranking, assignment, Amap, or other real map API call.
- No real OSS or other object-storage integration is introduced by Phase 19.
- Bill issue is an immutable operational status, not invoice issuance or funds movement.
- Mock webhook success is labeled `delivered_mock` with `externalProviderExecuted=false`.

## OpenAPI Artifact

The OpenAPI 3.1 specification is checked in at `docs/openapi/phase19-enterprise-v1.yaml`. It is part of the Phase 19 feature file list and is verified by `scripts/check-phase19-boundaries.ps1` for version, API-key security scheme, required order scope, and webhook path.

## Webhook Integrity And Duplicate Delivery

- XLB signs `<timestamp>.<canonical-raw-json>` and sends the signature in `X-XLB-Signature`.
- Signature tests accept the authentic HMAC and reject changed payloads/timestamps plus forged or malformed signatures.
- XLB stores at most one delivery per `(city_code, subscription_id, event_id)` and retries that row with the same `X-XLB-Delivery-Id`.
- Receivers must deduplicate by `X-XLB-Delivery-Id` because a network timeout can cause the same persisted delivery to be transmitted again.

## Verification

Formal gate: `scripts/check-phase19-migration-verification.ps1`.

Final dedicated result after audit hardening: 5 files / 17 tests passed. The detailed scenario and count reconciliation is in `docs/reports/PHASE19_TEST_COVERAGE.md`.

- Full regression: 275 files / 1,123 tests passed; 1 existing Phase 1 todo retained.
- Typecheck: 17/17 tasks passed.
- Build: 11/11 tasks passed.
- Architecture preflight passed.
- Admin browser smoke passed with enterprise data rendered and zero console errors.

Phase 19 passed independent audit closure requirements and is LOCKED. Phase 20 business code has not been entered.

## Pre-Merge Lock Verification

| Check | Result |
| --- | --- |
| `npx pnpm typecheck` | PASS, 17/17 tasks |
| `npx pnpm build` | PASS, 11/11 tasks |
| `npx pnpm test` | PASS, 275 files / 1,123 tests; 1 existing Phase 1 todo |
| `npx pnpm preflight` | PASS |
| Phase 19 migration gate | PASS, 5 files / 17 tests |
| Migrations | `037` and `038` each applied exactly once |
| Tenant constraints | 2 enterprise composite foreign keys and 3 idempotency unique indexes present |
| Invalid credential hashes / cross-client references / real webhook execution in verification data | 0 / 0 / 0 |
| Infrastructure | MySQL and Redis healthy; migration and seed replay idempotent |
| Admin browser smoke | PASS, enterprise data rendered with zero console errors |

Verified lifecycle identifiers: client `bcl_dd559dd6bf78444993a1c280`, business order `bord_ea96e2e8c4824c8cb5ee8841`, canonical order `ord_mrem91zn_ad9cdd71`, delivery `bdlv_dbb1032045a044ff94fcc169`, and bill `bill_5889d780051b41c08da96117`.

## User Asset Protection

The five user-owned untracked audit/analysis artifacts in the `G:\xlb100` main worktree were listed before Lock work and remain untouched and excluded from the Phase 19 feature commit:

- `docs/architecture-reaudit-2026-07-09.md`
- `docs/reports/ARCH_BENCHMARK_WSF_LUBAN_ZMN_2026-07-09.md`
- `docs/reports/FRESH_BENCHMARK_XLB_2026-07-10.md`
- `docs/reports/FRESH_BENCHMARK_XLB_2026-07-10.pdf`
- `docs/reports/FULL_BENCHMARK_XLB_VS_COMPETITORS_2026-07-10.md`

## Lock Conclusion

- Merged: yes, with `--no-ff`.
- Feature commit: `2bc9a33`.
- Main merge commit: `6b14b20459edbcfabbea30a69befa5d800013f54`.
- Tag: `xlb-phase19-enterprise-openapi-webhook`.
- Tag target: `6b14b20459edbcfabbea30a69befa5d800013f54`.
- Branch and post-merge tests: 275 files / 1,123 passed; 1 existing Phase 1 todo.
- Build 11/11, typecheck 17/17, architecture preflight, infrastructure, migration/seed replay, and Phase 19 gate 5 files / 17 tests passed before and after merge.
- Migrations `037` and `038` are append-only and each applied exactly once.
- Cross-client references, invalid credential hashes, and real webhook executions in verification data: zero.
- User-owned audit artifacts: untouched and excluded from commits.
- Phase 20 business implementation: not entered during Lock.
