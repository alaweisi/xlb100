# Phase 29 Marketing / Coupon — Entry Report

## 1. Entry conclusion

**Result: ENTRY ACCEPTED; CONSTRUCTION IN PROGRESS.**

- Baseline: `main@d7bf3e02e3ae8e3e2ecf74c942fb7350040f1afc`.
- Immutable predecessor tag: `xlb-phase28-review-reputation`, same target.
- Phase 28: LOCKED.
- Branch: `codex/phase29-marketing-coupon`.
- Last locked migration: `056`; Phase 29 may use new append-only migration `057` only.
- Production/staging activation, replay/backfill, external Provider and Phase 30 remain prohibited.

Human construction authorization received on 2026-07-14:

> “phase28工程已经全面竣工，先阶段可以进入phase 29工程， 开启agent 集群， 全面进入phase 29工程的施工”

The Entry decision pack was then submitted and explicitly accepted. The binding orchestration record states:

> “D01–D24 已由用户明确批准。进入写入施工。”

This report records that acceptance without treating it as production activation or permission to bypass gates.

## 2. Repository evidence reviewed

- `docs/CURRENT_STATE.md`: Phase 28 LOCKED; Phase 29 now IN PROGRESS with D01–D24 approved.
- `docs/governance/phase-registry.json`: last locked Phase remains 28; Phase 29 is the current formal phase.
- `docs/architecture/26_XLB_PLATFORM_DOMAIN_OWNERSHIP.md:182-263`: Marketing ownership, lifecycle, forbidden writes and Entry/Exit requirements.
- `docs/architecture/26_XLB_PLATFORM_FOUNDATION.md:83-103`: existing-domain writer boundaries.
- `packages/types/src/campaign.ts:25-35` and `packages/validators/src/campaignSchema.ts:45-56`: presentation `Campaign.discountRuleId` compatibility field.
- `docs/contracts/CONTRACT_CAMPAIGN_THEME.md:27-38`: Campaign is presentation-only; frontend money calculation forbidden.
- `backend/src/order/orderService.ts:100-181`: Pricing-derived current Order total/snapshot and the enterprise override seam.
- `packages/types/src/order.ts:42-54`: pre-Phase29 snapshot lacked discount decision evidence.
- `backend/src/payment/paymentOrderService.ts:62-80`: Payment begins after service completion and copies Order total.
- `backend/src/enterprise/enterpriseService.ts:65-68`: agreement-price override, which cannot be reused as a Marketing decision.
- `backend/src/aftersale/refund/refundService.ts:73-90,157-175`: full-refund-only approval and `refund.approved` fact.
- `backend/src/order/reverse/orderReverseService.ts:218-229`: applied cancellation fact shape.
- `packages/types/src/eventOutbox.ts:10-29`: no `payment.failed` event.
- `docs/contracts/CONTRACT_PLATFORM_EVENT_CATALOG.md:17-41,133-136`: PII/retention classes and proposed Marketing events.

## 3. Approved Entry decisions D01–D24

Every row below is **HUMAN APPROVED** for the Phase 29 MVP.

| ID | Approved decision |
| --- | --- |
| D01 | Use `Campaign` only for Phase 25 presentation; use `MarketingCampaign` for the business promotion aggregate. |
| D02 | Keep `Campaign.discountRuleId` temporarily as deprecated nullable schema compatibility data, populate it nowhere new, execute it nowhere, and remove only through a future presentation-contract version. Marketing uses `MarketingDiscountDecision`. |
| D03 | Coupon-first MVP: explicitly granted fixed-amount coupons only. Automatic promotion, public codes, percentage/tiered discounts and multi-coupon behavior are excluded. |
| D04 | Split eligibility into grant-time issuance checks and decision/Order-time revalidation. Use references, not copied customer profiles. |
| D05 | No behavioral/profile/Review/Support/location segmentation in MVP. Any future segment engine requires a new Privacy review. |
| D06 | At most one coupon per Order; customer explicitly selects it; no automatic best-coupon application. |
| D07 | Every coupon definition has positive finite ordinary and compensation caps. Ordinary and compensation issuance atomically consume separate counters; terminal grants do not restore either capacity. Unlimited/oversold stock is forbidden. |
| D08 | Grant uniqueness is city + definition + customer + issuance reason + issuance reference. Grants are non-transferable and redeem at most once. |
| D09 | Discount decision is immutable, fingerprint-bound, idempotent and valid for five minutes. Fingerprint covers city/customer/SKU/quantity/Pricing identity+version/gross/CNY/grant/definition/revision ID and canonical rule-content SHA-256. |
| D10 | Quote preview does not reserve. Order acceptance performs decision validation, reservation, Order/snapshot write and redemption in one local MySQL transaction. Marketing never directly writes Order. |
| D11 | Reservation abnormal-recovery ceiling is two minutes. Recovery can only CAS an actually stale reservation to released with reason/audit; it cannot infer success. |
| D12 | Redemption authority is committed Order creation, not Payment, because Payment occurs only after service completion in the current lifecycle. |
| D13 | Only applied cancellation (`order.reverse.applied`, `reverseType=cancel`) can trigger cancellation compensation. Requested/approved intents do not. |
| D14 | There is no current `payment.failed` producer. Phase 29 does not fabricate payment-failure release; a future Payment contract and policy are prerequisites. |
| D15 | Only full `refund.approved` triggers refund compensation under the current refund contract. |
| D16 | Partial-refund coupon return is unsupported and fails closed until Finance approves an allocation/recalculation policy and a canonical source fact exists. |
| D17 | Compensation creates a new grant rather than resurrecting redemption; it is unique by source redemption/trigger, equals original discount, lasts 30 days, cannot broaden scope and atomically consumes the separate `compensationCap` lane. |
| D18 | Abuse controls: one Order/one coupon, one redemption/grant, no transfer, Admin reason/idempotency, compensation unique key, CAS versioning and non-enumerating cross-city/ownership rejection. |
| D19 | Phase 29 currency is exactly CNY; money is integer fen. Fixed discount is positive and less than gross, leaving at least one fen net. |
| D20 | Fixed-fen MVP has no percentage rounding. Existing decimal values cross through strict two-decimal conversion; future percentage rounding requires separate approval. |
| D21 | Enterprise agreement pricing and Marketing discounting are mutually exclusive. The legacy enterprise override lacks Marketing decision evidence and is not a Marketing seam. |
| D22 | Order remains final writer and snapshots gross/discount/net plus decision/revision/rule-content SHA-256/grant/reservation/redemption/fingerprint/expiry evidence. Payment copies the accepted net Order total. |
| D23 | Accepted financial facts and referenced rule revisions: R2 for ten years after Order closure; unaccepted terminal decisions/reservations: 180 days; unused terminal grants: two years; legal hold blocks purge; audit follows retained fact. |
| D24 | Store only pseudonymous IDs/references and financial amounts. Audit all policy/admin/stock/compensation mutations. Initial source allowlist is applied cancellation and full-refund approval only; Marketing-owned candidate events are decision issued and coupon reserved/redeemed/released. |

### 3.1 Approved reachability correction

During runtime design, the team proved that a CouponDefinition could otherwise reference a rule-revision ID that no authorized API could create or publish. The human accepted the conservative correction: RuleRevision has an Admin create -> independent review -> publish workflow; the reviewer differs from both creator and publisher; all transitions use CAS/reason/audit; published revisions are immutable; and CouponDefinition accepts only a same-city published revision owned by its campaign. Shared contracts therefore add `createdBy`, `reviewedBy`, `reviewedAt`, `publishedBy`, `publishedAt`, `version` and the three strict Admin commands without expanding discount scope.

### 3.2 Approved rule-integrity correction

D22 requires enough evidence to prove the exact rule content accepted by Order. A revision ID alone is insufficient if lookup data is corrupted or interpreted differently later. The accepted correction adds lowercase SHA-256 `ruleContentHash` to every `MarketingDiscountDecision`, includes it in the request fingerprint, validates it as exactly 64 lowercase hexadecimal characters and requires Order to snapshot it beside the revision ID.

### 3.3 Approved server-price-authority correction

The first shared request shape asked Customer to submit Pricing rule/version, gross amount and currency. That would force frontend amount derivation and contradict D18/D22. The accepted correction reduces `IssueMarketingDiscountDecisionRequest` to `skuId`, `quantity`, `selectedCouponGrantId` and `idempotencyKey`. Pricing/Marketing now resolves every price fact server-side. Strict validation rejects client `priceRuleId`, `priceRuleVersion`, `grossAmountMinor`, `currency`, discount or net fields with `400`.

## 4. Accepted state machines

```text
MarketingCampaign:
  draft -> reviewed -> scheduled -> active <-> paused -> ended
                                      |          |
                                      +--------> revoked

MarketingRuleRevision:
  draft -> reviewed -> published -> retired

CouponDefinition:
  draft -> active <-> suspended -> expired | retired

CouponGrant:
  granted -> available -> reserved -> redeemed
                |             |
                |             +-> released -> available
                +-> expired | revoked

CouponReservation:
  active -> redeemed | released | expired

MarketingDiscountDecision:
  issued -> accepted | expired | rejected

MarketingCompensation:
  pending -> granted | denied
```

Terminal history is immutable. Published revisions are immutable. Pause/revoke blocks new decisions without rewriting prior Order/Payment facts.

## 5. Contract and amount authority

The accepted sequence is:

```text
Pricing public quote (gross)
  -> Marketing immutable CNY-fen decision
  -> Order validates decision and atomically reserves/redeems
  -> Order writes gross/discount/net snapshot and final total
  -> Payment copies Order net total
```

Marketing rejects enterprise agreement pricing, non-CNY, fractional minor units, stale Pricing revision, mismatched fingerprint, expired decision/grant, insufficient minimum spend, net below one fen, second coupon and unauthorized/cross-city access.

## 6. Retention, PII and audit acceptance

Allowed persistent identity is purpose-limited P1 pseudonymous customer/domain references. Amount/decision evidence is P2-FIN. Marketing must not receive customer name, phone, address, Support/review text, precise location, secrets, tokens, provider trade identifiers or evidence body.

Retention values in D23 are now the Phase 29 contract. They do not authorize a purge worker. Physical deletion remains separately gated; legal hold always blocks it. Customer-facing hiding does not delete required evidence.

Append-only audit is required for definition/revision review/publication, campaign status, manual grant/revoke, inventory adjustment, reservation recovery and compensation. Evidence includes actor, role, reason, expected/actual version, trace and timestamp.

## 7. Event acceptance and non-activation

Allowed source candidates:

- `order.reverse.applied` with an exact minimal shape and `reverseType=cancel` filter;
- `refund.approved` with the current full-refund semantics.

Not allowed: Payment paid/failure inference, reverse requested/approved, Review/Reputation, Support, Dispatch/Fulfillment, Ledger/Settlement or raw payload subscription.

Marketing-owned versioned event candidates are:

- `marketing.discount.decision.issued`;
- `marketing.coupon.reserved`;
- `marketing.coupon.redeemed`;
- `marketing.coupon.released`.

Types/builders/tests do not activate live subscriptions. Live-start, subscriber rows, replay, backfill and schedulers require separate explicit approval.

## 8. Construction work packages

| Work package | Deliverable | Boundary |
| --- | --- | --- |
| P29-A | architecture, contract, shared types/validators | strict CNY/fen, D01–D24 and approved RuleRevision four-eyes reachability |
| P29-B | append-only `057` schema, repository, state machines, audit | Marketing tables only; city-scoped |
| P29-C | Customer grant/decision and Admin lifecycle APIs/surfaces | real API data; no UI-only success |
| P29-D | Order quote integration and authoritative price snapshot | Order-owned write; atomic transaction |
| P29-E | applied-cancel/full-refund compensation | exact allowlist; no activation/backfill |
| P29-F | gates, focused/full tests, browser evidence and independent acceptance | all exit requirements |

## 9. Gate plan

Phase 29 must prove:

1. D01/D02 semantic separation and zero `discountRuleId` execution.
2. Strict schemas and unknown-field rejection.
3. CNY integer-fen invariants and exact decimal conversion.
4. Valid state transitions, immutable terminal facts and stale-CAS rejection.
5. Finite inventory under concurrent last-stock grants.
6. Same-grant concurrent Order attempts yield one redemption.
7. Expiry/fingerprint/Pricing drift and idempotency conflict fail closed.
8. One transaction owns Order snapshot + reservation/redemption outcome.
9. Applied cancel/full-refund compensation is unique and value-bounded.
10. Partial refund and absent payment failure produce zero Marketing mutation.
11. Customer/city/Admin authorization, privacy minimization and complete audit.
12. Zero Marketing write to Pricing/Payment/Refund/Ledger/Settlement and zero frontend money logic.
13. Migration fresh apply/replay/marker, focused/full tests, typecheck, build, preflight and browser evidence.
14. Independent acceptance returns no unresolved P0/P1/P2/P3 before Lock.

## 10. Entry deliverable verification

At report creation:

- `packages/types/src/marketing.ts` added and exported;
- `packages/validators/src/marketingSchema.ts` added and exported;
- `docs/contracts/CONTRACT_MARKETING_COUPON.md` added;
- `docs/architecture/29_XLB_MARKETING_COUPON.md` added;
- `pnpm --filter @xlb/types typecheck` passed;
- `pnpm --filter @xlb/validators typecheck` passed.

These checks establish the Contract-first foundation. They are not Phase 29 completion or Lock evidence.
