# Phase 29 Marketing / Coupon Implementation Report

Date: 2026-07-14
Branch: `codex/phase29-marketing-coupon`
Base: `d7bf3e02e3ae8e3e2ecf74c942fb7350040f1afc` (`xlb-phase28-review-reputation`)
Status: **LOCKED ON LOCAL MAIN — SEE PHASE29 MARKETING/COUPON LOCK REPORT**

## Implemented scope

Phase29 implements the approved D01–D24 conservative Marketing / Coupon MVP:

- Marketing-owned Campaign, immutable fixed-amount Rule revision, Coupon Definition and customer Grant governance;
- explicit one-coupon selection with a five-minute immutable server decision and a two-minute Order reservation;
- Pricing-owned gross amount, Marketing-owned discount decision and Order-owned gross/discount/net evidence;
- same-transaction Order creation, price snapshot, reservation, redemption and Outbox facts;
- Order idempotency replay and fail-closed revalidation of city, customer, SKU, quantity, Pricing fingerprint, Rule and Grant;
- enterprise-agreement and Marketing mutual exclusion;
- Customer coupon list and explicit server-validated coupon application with no silent fallback;
- city-scoped Admin Campaign/Rule/Definition/Grant operations, three-person governance, audit and read-only Order Trace evidence;
- dormant cancellation/full-refund compensation materialization with delivery/trigger idempotency, exact source revalidation and a separate compensation cap;
- append-only schema migration `057_phase29_marketing_coupon.sql` with no business seed or activation row.

The Phase25 presentation-only `Campaign.discountRuleId` compatibility field is not read by Marketing, Pricing, Quote, Order or frontend amount paths.

## Money and transaction ownership

The accepted Order path does not trust client-submitted price, rule, gross, discount, net or fingerprint values. Inside the Order transaction it re-reads the Pricing quote and Marketing evidence, persists the Order and complete quote snapshot, commits reservation to redemption, and writes `marketing.coupon.reserved`, `marketing.coupon.redeemed` and `order.created` Outbox facts atomically. Dormant timeout recovery writes exactly one `marketing.coupon.released` v1 fact in its own release transaction and writes none for reused or success-evidence-preserving outcomes. Payment continues to copy the accepted Order net total.

## Compensation boundary

Compensation code remains dormant and has no route, scheduler, runner, subscriber registration, activation row, seed, replay or backfill entry. It accepts only an already leased exact-v0 claim for:

- `order.reverse.applied` with `reverseType=cancel` and `dispatchMutation=false`; or
- `refund.approved` for a full refund.

Partial refunds, source/customer/city/amount drift and unsupported events fail closed. A successful claim creates a new same-scope fixed-amount Grant equal to the actual redeemed discount, valid for 30 days, under an independent compensation cap in one transaction with audit evidence.

## Verification evidence

| Verification | Result |
|---|---|
| `pnpm gate:phase29` | PASS |
| Phase29 Entry / aggregate boundary Gates | PASS |
| Phase29 unit / contract | 9 files / 61 tests PASS |
| Phase29 security | 1 file / 2 tests PASS |
| Phase29 real-MySQL lifecycle and adversarial acceptance | 2 files / 9 tests PASS |
| Migration 057 Gate | current, fresh, 000–056 upgrade, true partial-DDL, double replay, constraints and five contradictory-SQL rejection cases PASS |
| Phase29 Chromium real-API E2E | aggregate PASS; three additional consecutive focused runs PASS |
| Workspace unit / contract regression | 179 files / 986 passed plus 1 historical todo |
| Workspace db / security / integration regression | 198 files / 587 tests PASS |
| Workspace typecheck | 17/17 PASS |
| Workspace build | 11/11 PASS |
| Complete architecture preflight | PASS through Phase29 |
| Critical dependency audit | PASS; no known vulnerabilities |
| Phase25 no-new-hardcodes gate | PASS; Customer/Admin/Worker remain within frozen baselines |
| Historical Phase27/28 compatibility Gates | PASS with exact Phase29 authorization and locked 054/055/056 tag-blob verification |
| `git diff --check` | PASS before independent review handoff |

The E2E uses real Chromium, HTTP, API and MySQL paths with no route interception or fake success. It covers three distinct Admin actors, Campaign/Rule/Definition/Grant governance, Customer explicit coupon selection, server decision, atomic Order redemption, Admin Marketing and Order Trace, Worker no-change smoke, unchanged Platform subscription snapshots and zero test-data residue.

## First independent review remediation

The first independent read-only review returned `P0=0 / P1=6 / P2=5 / P3=1`. Construction was not declared accepted. Every finding was remediated and reverified before the second-review handoff:

- historical Phase27/28 Gates now always execute from Preflight; Phase29 entry and aggregate Gates verify merge-base ancestry and reject any construction-time skip switch;
- append-only audit coverage now includes definition stock, grant, reservation and decision transitions with expected/actual version, reason and trace evidence;
- dormant two-minute reservation recovery is fail-closed against Order success evidence, CAS/idempotent under concurrency, fully audited and has no route, runner, scheduler or subscriber;
- canonical quote and Order paths lock and recheck enabled SKU state, preserve the SKU-to-Marketing lock order, perform idempotency lookup before mutable reads and use bounded deadlock retry with canonical exhaustion errors;
- migration 057 now enforces the Rule/Grant/Decision/Reservation/Redemption/Compensation evidence chain and proves rejection of five contradictory direct-SQL inserts;
- Customer grant status filtering is strict, authorization precedes business-body validation, Order replay carries the expected decision version, and Admin Campaign/Rule UI state rules are covered by tests;
- real-MySQL adversarial tests cover last-stock issuance, double-decision/double-Order races, scope and role isolation, expiry/fingerprint drift, SKU disable TOCTOU, concurrent timeout recovery, success-evidence fail-close and dormant compensation claims;
- the Chromium request-failure policy only defers an exact canceled catalog read when the same URL later succeeds; all other request, console and HTTP 5xx failures remain fatal.

This remediation record is evidence for a new independent review, not a substitute for that review.

## Second independent review remediation

The second independent read-only review identified additional defects before issuing a verdict. They were treated as construction findings, not waived:

- the public Order command is now strict and rejects every unknown client field, including forged Pricing identity, currency, fingerprint and amount fields; Enterprise now explicitly maps its larger request into the canonical Order command instead of relying on Zod stripping;
- Admin review/schedule/status/revoke commands that have CAS but no idempotency key use `retry: "none"`; only commands with an explicit idempotency key retain automatic idempotent retry;
- Pricing now owns one transaction-safe canonical public quote helper with deterministic rule/fee ordering and exact DECIMAL-to-minor-unit arithmetic; Marketing and Order consume the same quote evidence, and a real-MySQL two-enabled-base counterexample proves the sorted first base is used instead of `MAX(base)`;
- the `available` Customer query excludes `expires_at <= CURRENT_TIMESTAMP(3)`, while historical reads remain unchanged; Customer surfaces independently derive expiry and never make a stale available row selectable;
- dormant reservation recovery writes exactly one strict `marketing.coupon.released` v1 Outbox fact in the same transaction; concurrent reuse and authoritative Order evidence write zero duplicate/release facts;
- the recovery/query hardening tests are included in `gate:phase29`, and the Phase25 closure admits the exact Pricing repository change only when CURRENT_STATE, Entry report, architecture, contract, registry and migration 057 authorization evidence all agree.

The Phase19 Enterprise integration passed in an isolated run. Two earlier webhook assertions failed only when the same shared named-lock/mock-callback test was run concurrently by the main and review processes; the isolated rerun and the subsequent full workspace regression both passed without changing the historical test or timeout.

## Production and phase boundary

Phase14 remains `64/100`, `IN PROGRESS`; staging and production remain **NO-GO**. This implementation does not authorize or perform push, deployment, production migration execution, production activation, subscriber/subscription activation, live start, historical backfill/replay, business seed or Provider integration.

Phase29 is not committed, merged, tagged or locked. The second independent read-only acceptance returned PASS with `P0/P1/P2/P3 = 0/0/0/0`. The next step is explicit human acceptance and, only if separately authorized, the Phase Lock workflow.
