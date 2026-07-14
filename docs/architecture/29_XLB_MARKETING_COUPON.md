# Phase 29 — Marketing / Coupon Architecture

> Status: **ENTRY DECISIONS HUMAN-APPROVED; CONSTRUCTION AUTHORIZED** on 2026-07-14. This document authorizes only the Phase 29 MVP described here. Production activation, historical replay/backfill, external Provider work and later-phase behavior remain prohibited.

## 1. Baseline and purpose

Phase 29 starts from immutable Phase 28 commit/tag `d7bf3e02e3ae8e3e2ecf74c942fb7350040f1afc` / `xlb-phase28-review-reputation`. Phase 28 is LOCKED, migration `056` is the last verified locked migration, and Phase 29 is the next formal phase.

The repository already has city/SKU Pricing, fee breakdowns, Order price snapshots, Payment copying Order total, full-refund approval facts, controlled cancellation and a Phase 25 presentation `Campaign` type. It has no Marketing/Coupon source-of-truth runtime. Phase 29 adds that business domain without creating a second Pricing, Order, Payment or presentation authority.

## 2. Non-negotiable ownership

| Fact | Writer | Marketing access |
| --- | --- | --- |
| Presentation theme/banner `Campaign` | Phase 25 runtime-theming boundary | no money interpretation; optional separately resolved presentation bridge only |
| Marketing campaign/revision | Marketing | canonical writer |
| Coupon definition/inventory/grant | Marketing | canonical writer |
| Decision/reservation/redemption/release/compensation | Marketing through approved orchestration | canonical writer |
| SKU, base price, price rule, fee item | Pricing | read-only approved quote input |
| Final Order total and quote snapshot | Order | validated decision input only; zero direct write |
| Payment/refund state | Payment/Aftersale | approved result event input only |
| Customer profile/contact/address | canonical Customer/Order domain | no copy; customer reference only |
| Ledger/Settlement | canonical finance domains | zero read/write for MVP except no-op boundary proof |

`Campaign.discountRuleId` is deprecated compatibility data, not a business rule. Keeping the field temporarily avoids breaking the Phase 25 schema; every Phase 29 execution path must prove it never reads it. The only money-bearing output is `MarketingDiscountDecision`.

## 3. MVP product shape

Phase 29 implements a coupon-first fixed-amount engine:

```text
MarketingCampaign
  -> immutable MarketingRuleRevision
  -> finite CouponDefinition
  -> customer-scoped CouponGrant
  -> short-lived MarketingDiscountDecision
  -> Order-transaction Reservation + Redemption
  -> audited release or compensating grant
```

Included:

- city-scoped Admin campaign/coupon lifecycle;
- finite issuance inventory and explicit customer grant;
- Customer own-grant list and explicit coupon selection;
- five-minute immutable quote decision;
- atomic Order acceptance and authoritative discount snapshot;
- cancellation/full-refund compensation;
- strict audit, PII minimization and deterministic tests.

Excluded:

- automatic promotions, public coupon codes, percentage/tiered/material/shipping discounts;
- multiple coupons or best-coupon auto-selection;
- customer behavior/segment engine;
- enterprise agreement + coupon stacking;
- partial-refund allocation;
- fabricated payment-failure handling;
- Campaign-theme money execution;
- Provider, SMS/Push/WeChat, production activation, replay/backfill;
- Risk-Control decisions and Analytics/BI projections owned by Phases 30/31.

## 4. Components

```text
Customer/Admin App
  -> @xlb/api-client
  -> RequestContext / CityCode / Authz
  -> strict @xlb/validators contract
  -> Marketing route/service
  -> Marketing repository (city-scoped SQL)
  -> MySQL 057+ append-only schema

Customer Order command
  -> Order quote orchestrator
      -> Pricing read
      -> Marketing decision validation/CAS
      -> Order + price snapshot writer
      -> Marketing reservation/redemption writer
      -> outbox/audit
     all in one local MySQL transaction

Platform delivery (dormant unless separately activated)
  -> exact approved order.reverse.applied(cancel) / refund.approved shapes
  -> idempotent Marketing compensation handler
```

No frontend calculates money. No Marketing repository accepts an unscoped query. No event subscriber writes Order/Payment/Aftersale.

## 5. Shared contract

Canonical TypeScript types are in `packages/types/src/marketing.ts`; executable strict schemas are in `packages/validators/src/marketingSchema.ts`. Contracts use:

- `currency: "CNY"`;
- safe integer `*AmountMinor` fields in fen;
- UTC ISO timestamps ending in `Z`;
- positive row versions and expected-version CAS;
- strict object validation; unknown fields rejected;
- normalized lowercase SHA-256 request fingerprints.

Existing `DECIMAL(*,2)` values cross the boundary through exact decimal-string conversion. JavaScript floating arithmetic is never the stored or signed decision authority.

## 6. Lifecycle model

### 6.1 Marketing campaign

```text
draft -> reviewed -> scheduled -> active <-> paused -> ended
                                  |          |
                                  +--------> revoked
```

Only reviewed/published facts can schedule. Active requires its UTC window and an active/published revision. Revoked is terminal. Pause/revoke stops new decisions but retains history.

### 6.2 Rule revision

```text
draft -> reviewed -> published -> retired
```

Published revisions are immutable. Changes create a new numbered revision. Publication computes a lowercase SHA-256 over the canonical rule JSON. A decision persists both the exact revision ID and this `ruleContentHash`, so audit does not depend on mutable lookup behavior.

Rule revision reachability is an explicit four-eyes Admin workflow:

1. an authorized same-city Admin creates a draft under one MarketingCampaign and records `createdBy`;
2. a different Admin reviews it with `expectedVersion` and reason;
3. publication records a publisher who is not the reviewer, again with CAS and reason;
4. only a same-city `published` revision belonging to the selected campaign can be referenced by a CouponDefinition;
5. published content is immutable; a changed SKU allowlist requires a new revision.

The creator and publisher may be the same actor after an independent review; the reviewer may be neither. This is the minimum approved separation and every transition writes audit evidence.

### 6.3 Coupon definition and grant

```text
definition: draft -> active <-> suspended -> expired | retired
grant:      granted -> available -> reserved -> redeemed
                         |             |
                         |             +-> released -> available
                         +-> expired | revoked
```

Each definition has one positive finite ordinary issuance cap and one separate positive finite compensation cap. Both counters are consumed irreversibly in their own lane. A grant is non-transferable and unique for the frozen definition/customer/reason/reference tuple.

### 6.4 Decision and reservation

```text
decision:    issued -> accepted | expired | rejected
reservation: active -> redeemed | released | expired
compensation: pending -> granted | denied
```

A decision is immutable and valid for five minutes. Normal Order acceptance creates and redeems its reservation within the same transaction; the two-minute reservation timeout is an abnormal-recovery ceiling, not a second checkout promise.

## 7. Eligibility and fingerprint

Grant time verifies:

- authenticated/authorized actor and real city;
- active issuance policy and positive capacity;
- customer reference, issuance reason/reference and expiry;
- idempotency request identity.

Decision time verifies:

- authenticated customer owns the same-city available grant;
- campaign/revision/definition/grant are currently eligible;
- SKU is allowlisted and all UTC windows are open;
- public Pricing rule/version and gross amount are current;
- gross meets minimum spend and net remains at least one fen;
- no enterprise agreement pricing;
- no other coupon selection.

The Customer decision command contains only `skuId`, `quantity`, `selectedCouponGrantId` and `idempotencyKey`. Pricing/Marketing resolves the canonical price rule ID/version, CNY and exact gross amount server-side. Any client-supplied price, rule, currency, discount or net field is an unknown strict-schema field and receives `400`; the backend never “validates then trusts” a client amount.

The fingerprint includes city, customer, SKU, quantity, price rule ID/version, gross fen, CNY, selected grant, coupon definition, rule revision ID and `ruleContentHash`. Retrying the same idempotency key and normalized request returns the same decision; a changed request is a conflict.

## 8. Order transaction boundary

The Order orchestrator remains the final amount writer:

1. Load the current city/SKU public quote and convert its exact amount to fen.
2. Load the issued decision by same city/customer and lock the grant/decision rows.
3. Verify status, expiry, fingerprint, Pricing version, gross/discount/net and expected versions.
4. Generate Order ID.
5. CAS grant `available -> reserved`; write reservation tied to Order and decision.
6. Insert Order and authoritative price snapshot.
7. Insert redemption and CAS reservation/grant/decision to redeemed/accepted.
8. Insert required audit/outbox facts.
9. Commit once; any failure rolls back all participating writes.

The snapshot records gross, discount and net minor amounts plus decision/revision/`ruleContentHash`/expiry/fingerprint and definition/grant/reservation/redemption IDs. Existing decimal total remains the compatibility amount but must equal the exact net fen conversion.

Redemption is tied to committed Order creation, not Payment. The existing workflow creates Payment only after service completion; payment-time redemption would create an unsafe long-lived reservation.

## 9. Inventory and abuse resistance

- Issuance update uses row lock or atomic conditional update and rejects `issued_count >= issuance_cap`.
- No unlimited inventory flag exists in MVP.
- One grant can create one accepted decision/redemption path at a time.
- Database unique keys enforce grant, active reservation, redemption and compensation idempotency.
- Manual grant/revoke/adjustment requires Admin identity, reason, trace and idempotency key.
- All state mutations use CAS version and append audit.
- Cross-city/other-customer access returns no target data and performs zero mutation.
- Grants cannot be transferred, merged or converted to cash.

## 10. Cancellation, refund and compensation

The Marketing subscriber may receive only:

- `order.reverse.applied`, filtered to `reverseType=cancel`;
- `refund.approved`, whose current source contract is full refund only.

The source redemption remains immutable. An accepted trigger creates a separate compensation decision and, when granted, a new coupon grant:

- value equals original actual discount in fen;
- expiry is 30 days;
- city/customer/SKU scope cannot broaden;
- unique source redemption + trigger type + trigger ID;
- atomically consumes `compensationIssuedCount < compensationCap`, never ordinary `issuedCount < issuanceCap`;
- revoked/fraud-disqualified/explicitly denied cases end as `denied` with reason.

The compensating grant reuses the immutable source definition and published rule so its city,
customer and SKU scope cannot broaden. Its own validity is exactly 30 days from compensation
issuance: a natural `campaign=ended` or `definition=expired` state and the original time windows
do not shorten that period. Safety controls remain fail-closed: `campaign=paused|revoked`,
`definition=suspended|retired`, a non-published/drifted rule revision, SKU mismatch or minimum-
spend failure makes the compensating grant unusable.

Phase 29 contains only a dormant, lease-bound materialization method. It revalidates the exact
Platform Delivery claim and source event under the same MySQL transaction that writes the
compensation decision, independent-cap mutation, new grant and audits. No Marketing subscriber,
subscription seed, runner, scheduler, route, replay/backfill or production activation is created.

Partial refund returns no coupon and fails closed. There is no current `payment.failed` producer; no scheduler or mock state may pretend otherwise.

## 11. Persistence model

Append-only migration `057+` may create the following Marketing-owned, real-city tables:

| Logical table | Key invariants |
| --- | --- |
| `marketing_campaigns` | city + campaign identity; version; valid status/window |
| `marketing_rule_revisions` | immutable city/campaign/revision uniqueness |
| `coupon_definitions` | positive finite ordinary/compensation caps; each issued counter <= its cap; CNY/fen |
| `coupon_grants` | frozen customer/definition/reason/ref uniqueness; CAS version |
| `coupon_reservations` | grant/Order uniqueness; expiry/version |
| `coupon_redemptions` | one per reservation and grant/Order path |
| `marketing_discount_decisions` | request idempotency/fingerprint; immutable money/revision; one accepted Order |
| `marketing_compensations` | source redemption/trigger uniqueness |
| `marketing_audit_records` | append-only actor/reason/version/trace evidence; no cascade |

Every table includes `city_code`, rejects `__global__`, and uses composite city-aware foreign keys where applicable. Locked migrations `000`–`056` are immutable.

## 12. API and authorization

Customer routes expose only own grants and own discount decisions in the current city. Admin routes expose same-city campaign/definition/grant operations to authorized Admin principals. Rule revision commands are `POST /api/admin/marketing/campaigns/:id/rule-revisions`, `POST /api/admin/marketing/rule-revisions/:id/review`, and `POST /api/admin/marketing/rule-revisions/:id/publish`; they enforce the four-eyes rule above. Internal Order acceptance is a service boundary, not a public route.

The existing read-only Order Trace projects the persisted pricing source, gross/discount/net integer-fen values, and Marketing decision/rule/grant/reservation/redemption evidence. It never recomputes a discount and does not expose customer eligibility inputs.

Error behavior:

- malformed/unknown field/amount/currency: `400`;
- unauthenticated/unauthorized: existing gateway semantics;
- cross-city/not-owner/not-found: non-enumerating not-found where appropriate;
- stale version, invalid transition, inventory exhaustion, fingerprint/price drift, idempotency conflict: `409`;
- no mutation/audit/outbox target effect on a rejected command, except approved security denial telemetry outside Marketing facts.

## 13. PII, retention and deletion

Allowed: P1 pseudonymous customer IDs and minimal domain references; P2-FIN integer amounts and financial decision metadata.

Forbidden: name, phone, address, Support/review text, exact location, credentials/tokens, provider trade numbers, evidence body.

Approved retention:

- accepted decisions/redemptions/compensations and referenced rule revisions: R2, ten years after Order closure;
- terminal unaccepted decisions/reservations: 180 days;
- unused expired/revoked grants: two years;
- audit: at least as long as its retained financial fact.

Legal hold blocks purge. No Phase 29 runtime may implement physical purge without a separate gated job and Finance/Privacy/Legal sign-off.

## 14. Event and rollout boundary

Marketing-owned candidate events are versioned/minimized forms of:

- `marketing.discount.decision.issued`;
- `marketing.coupon.reserved`;
- `marketing.coupon.redeemed`;
- `marketing.coupon.released`.

Registration of types/builders is not subscription activation. Initial source subscription rows, live-start, replay, historical backfill and automatic scheduler stay paused/absent until an explicit activation decision. Event processing uses exact major-version allowlists and `(subscriber_id,event_id)` idempotency.

## 15. Verification and exit gates

Phase 29 cannot Lock without:

1. contract/schema alignment tests and strict unknown-field rejection;
2. state-machine transition and terminal-state tests;
3. CNY integer-fen, gross/discount/net and exact decimal-conversion tests;
4. concurrent last-stock grant, same-grant Order race and duplicate redemption proof;
5. decision expiry, fingerprint/price-revision drift and idempotency conflict proof;
6. atomic Order snapshot/reservation/redemption rollback proof;
7. cancel/full-refund compensation and partial-refund/payment-failure no-op proof;
8. city/customer/role/existence-oracle and audit evidence tests;
9. zero-read of `Campaign.discountRuleId` and protected-domain zero-write gates;
10. migration fresh apply/replay/marker proof, focused/full regression, typecheck, build, preflight and three-app browser evidence for approved surfaces.

Phase 29 Lock does not imply production readiness or authorize Phase 30.
