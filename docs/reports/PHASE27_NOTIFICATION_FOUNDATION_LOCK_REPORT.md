# Phase 27 Notification Foundation Lock Report

Date: 2026-07-13
Status: EXIT VERIFICATION PASS — READY FOR MAIN MERGE AND LOCK

## Lock scope

Phase27 closes the Customer/Worker same-city in-app notification foundation through five bounded work packages:

- Phase27A: additive Platform Delivery ledger, compatibility boundary, materialization, lease/retry/reaper/DLQ and reconciliation;
- Phase27B B1/B2: empty Notification schema, strict contracts and dormant prospective-only projection worker;
- Phase27C: authenticated recipient-scoped Customer/Worker list, unread, read and archive/restore APIs;
- Phase27D: real-API Customer and Worker inbox pages;
- Phase27E: aggregate gates, migration replay, browser proof, regression, independent review and Lock governance.

This Lock contains migrations `054` and `055` only. It does not authorize migration `056+`, Phase28, production activation, subscription/template seed data, historical backfill/replay, an automatic worker scheduler, external Providers, deployment or push.

## Independent review

The final read-only Phase27 A–E review concluded:

- P0: none;
- P1: none;
- P2: none;
- P3: none;
- decision: PASS, suitable for feature commit and Lock.

The review confirmed canonical receipt/revision reuse, claim and source revalidation, recipient/city/role scope, scope-bound HMAC cursors, durable idempotency results, CAS semantics, SPA-safe Worker navigation, test-owned cleanup, zero activation data and no protected-domain writes.

## Verification evidence

| Evidence | Result |
|---|---|
| Phase27 focused unit/contract/UI | PASS — 7 files / 33 tests |
| Phase27 focused integration/security | PASS — 6 files / 24 tests |
| Phase27A/B/B2/C/D direct gates | PASS |
| Phase27 aggregate completion gate | PASS |
| Migration 054 gate | PASS — empty, existing, true partial-DDL, double replay; 86.498s |
| Migration 055 gate | PASS — existing, empty, 000–054 upgrade, true partial-DDL, double replay; 87.186s |
| Workspace typecheck, forced/no cache | PASS — 17/17 |
| Workspace build, forced/no cache | PASS — 11/11 |
| Critical dependency audit | PASS — no known critical vulnerability |
| Architecture preflight | PASS — complete Phase0–27 chain |
| Diff hygiene | PASS |

The stable full regression ran 192 files / 549 tests. All Phase27 and business assertions passed. One historical Phase8F PowerShell gate exceeded its fixed five-second test timeout under the full serial run; its complete file immediately passed in isolation at 1 file / 9 tests in 3.38s. No Phase27 timeout or assertion failure occurred, and the historical timeout was not modified.

## Real browser acceptance

`npx pnpm test:e2e:phase27` passed 2/2 Chromium tests on dedicated backend/customer/worker ports with `reuseExistingServer=false`.

The tests use no route interception or mocked API response. They exercise:

- Customer OTP login and real order creation, then `order.created` Outbox → Platform materialization → dormant Notification projection → Customer inbox;
- Worker OTP login and real Support ticket resolution, then `support.ticket.resolved` Outbox → Platform materialization → dormant Notification projection → Worker inbox;
- list, unread count, mark read, archive, restore and persisted reload state;
- other-recipient, cross-city and cross-role rejection;
- 390px and 1440px layouts with no horizontal overflow;
- zero page error, console error, failed request or HTTP 5xx.

Cleanup deletes only test-owned Platform/Notification/template rows and restores the temporary Worker phone hash. It does not delete or mutate Order, Support or source Outbox evidence. Post-run test-owned subscriber, subscription, template, revision, record and recipient-state counts are zero.

## Migration and data truth

- migrations `000`–`053` are unchanged;
- migration `054` is unique;
- migration `055` is unique and creates exactly eight Notification-owned tables;
- migration `056+` does not exist;
- migration `055` contains only the `schema_migrations` marker insert and no business seed;
- local migrate and seed scripts pass, and seed does not activate Notification or Platform subscribers;
- no production subscriber, subscription, template, revision, record or recipient state is present.

## Governance boundary

Historical gates were extended only where Phase27 made later-phase work legitimate. Every extension is bound to the Phase27E/LOCKED state and an exact file or status allowlist; payout, withdrawal, refund, aftersale, payment-instruction, Provider and unrelated notification paths remain forbidden.

Phase14 remains `64/100`, `IN PROGRESS`, with staging/production `NO-GO`. Phase27 Lock is an engineering foundation Lock only and does not imply production readiness.

## Exit decision

Phase27 A–E exit verification is complete and accepted for a no-fast-forward merge to `main`, canonical tag `xlb-phase27-notification-foundation`, and governance metadata finalization. No Phase28 work is included.
