# CONTRACT_MARKETING_COUPON

> Phase 29 human-approved contract. This contract supersedes any money implication previously inferred from `CONTRACT_CAMPAIGN_THEME.md#discountRuleId`; the Phase 25 `Campaign` contract remains presentation-only.

## 1. Scope and authority

Phase 29 owns city-scoped `MarketingCampaign`, immutable rule revisions, fixed-amount coupon definitions, customer grants, discount decisions, reservation/redemption/release facts, compensation grants and their audit trail.

It does not own Pricing base rules or fee items, Order totals or price snapshots, Payment/refund state, Ledger/Settlement, Phase 25 presentation tokens, customer profiles, or Provider execution.

Every business read/write follows `RequestContext -> CityCode -> Contract -> Guard`. Customer identity comes from authenticated context. Admin mutations require same-city `admin` authority, explicit reason, idempotency and optimistic version where applicable.

## 2. Naming and the legacy Campaign field

- `Campaign` means the Phase 25 presentation/theme/banner shape only.
- `MarketingCampaign` means a Phase 29 business promotion container.
- `Campaign.discountRuleId` remains nullable solely for backward schema compatibility, is deprecated, must not be populated by new Phase 29 paths, and must never be read by eligibility, quote, discount, Order or Payment code.
- Phase 29 money flows only through the separately versioned `MarketingDiscountDecision` contract.

## 3. Money contract

1. Currency is exactly `CNY`.
2. Every Phase 29 amount is a non-negative safe integer in fen and uses a `*Minor` field name.
3. MVP discounts are fixed amounts only. Percentage, tiered, material, shipping and automatic discounts are absent.
4. A decision must satisfy `0 < discountAmountMinor < grossAmountMinor` and `netAmountMinor = grossAmountMinor - discountAmountMinor`; net is at least one fen.
5. Existing `DECIMAL(*,2)` values must be parsed as exact two-decimal strings before conversion to fen. Floating-point multiplication is not an authority.
6. A future percentage contract must separately approve rounding level and mode. Phase 29 does not pre-authorize one.

## 4. Product rules

- Coupon-first MVP: only explicitly granted coupons can produce a discount.
- One order accepts at most one coupon grant.
- The customer explicitly selects the grant; the server never silently applies a “best” coupon.
- No selected grant means the authoritative public quote remains unchanged.
- Enterprise agreement pricing and Marketing discounting are mutually exclusive and fail closed.
- No customer behavior, Support/review content, precise location or profile segment is an eligibility input.
- Eligibility is revalidated at decision issuance and again at Order acceptance.

Grant-time checks: same city, definition is issuable, positive remaining issuance capacity, customer reference, allowed issuance reason/reference and UTC expiry.

Decision-time checks: same customer and city, active campaign/revision/definition, grant is `available`, SKU is allowlisted, validity windows include current UTC instant, gross meets minimum spend, currency is CNY, public price rule/version matches and the normalized fingerprint matches.

## 5. State machines

```text
MarketingCampaign
  draft -> reviewed -> scheduled -> active <-> paused -> ended
                                      |          |
                                      +--------> revoked

MarketingRuleRevision
  draft -> reviewed -> published -> retired

CouponDefinition
  draft -> active <-> suspended -> expired
             |            |
             +----------> retired

CouponGrant
  granted -> available -> reserved -> redeemed
                |             |
                |             +-> released -> available
                +-> expired | revoked

CouponReservation
  active -> redeemed | released | expired

MarketingDiscountDecision
  issued -> accepted | expired | rejected

MarketingCompensation
  pending -> granted | denied
```

Terminal facts are immutable. `published` rule revisions are immutable. Campaign pause/revoke blocks new decisions but never rewrites accepted decisions, redemptions, Order snapshots or payments. Invalid transitions and stale versions return conflict without side effects.

Rule revisions use a mandatory Admin four-eyes flow. Creation records `createdBy`; review records `reviewedBy/reviewedAt`; publication records `publishedBy/publishedAt`. The reviewer must differ from both the creator and publisher. Each transition uses `expectedVersion` CAS and a non-empty audit reason. A CouponDefinition may reference only a same-city `published` revision owned by its MarketingCampaign; an unknown, draft, reviewed-only, retired, cross-city or foreign-campaign revision is rejected.

## 6. Inventory, uniqueness and concurrency

- Every coupon definition has a positive finite `issuanceCap` and a separate positive finite `compensationCap`; unlimited inventory is forbidden in MVP.
- Grant creation atomically increments `issuedCount` only while `issuedCount < issuanceCap`.
- Compensation grant creation atomically increments `compensationIssuedCount` only while `compensationIssuedCount < compensationCap`.
- Expiry, revocation, redemption and compensation do not replenish normal issuance capacity.
- Grant uniqueness is `(city_code,coupon_definition_id,customer_id,issuance_reason,issuance_ref)`.
- Active reservation uniqueness is grant + Order; one reservation can have at most one redemption.
- Compensation uniqueness is `(source_coupon_redemption_id,trigger_type,trigger_id)`.
- All lifecycle mutations use row version/CAS. Duplicate idempotency keys with an identical normalized request return the prior result; conflicting payloads return `409`.

Quote preview does not reserve. During Order creation, the quote orchestrator generates the Order ID and, in the same MySQL transaction, validates the decision and moves the grant through `available -> reserved -> redeemed` while Order owns the final snapshot and total. Any failure rolls back all participating writes. A two-minute reservation expiry is only an abnormal-recovery ceiling; recovery may CAS an actually stale reservation to `released` with a reason and audit record, never infer Order success.

Redemption occurs on successful authoritative Order creation, not Payment. This avoids holding inventory through service fulfillment because the current Payment flow begins only after service completion.

## 7. Discount decision and Order acceptance

`IssueMarketingDiscountDecisionRequest` contains:

- `skuId`, `quantity`;
- `selectedCouponGrantId`, `idempotencyKey`.

City and customer are taken from `RequestContext`, never from this body. Pricing/Marketing loads canonical `priceRuleId`, `priceRuleVersion`, exact gross amount and currency on the server, converts the authoritative quote to integer fen and uses those values in eligibility, the decision and the fingerprint. The Customer does not send or calculate any price fact. Because the request schema is strict, bodies containing `priceRuleId`, `priceRuleVersion`, `grossAmountMinor`, `currency`, `discountAmountMinor` or `netAmountMinor` are rejected with `400` as unknown fields.

The published rule revision has a canonical JSON representation whose lowercase SHA-256 is persisted as `ruleContentHash`. The normalized SHA-256 request fingerprint covers city, customer, SKU, quantity, price-rule identity/version, gross amount, currency, selected grant, coupon definition, rule revision ID and `ruleContentHash`. Decisions are immutable, expire five minutes after issuance and may be accepted by exactly one Order.

Order acceptance verifies the decision ID, fingerprint, rule revision, grant ownership, amounts, expiry, status and expected versions. The authoritative Order price snapshot must contain:

- `grossAmountMinor`, `discountAmountMinor`, `netAmountMinor`, `currency`;
- decision ID/revision/`ruleContentHash`/expiry/fingerprint;
- coupon definition, grant, reservation and redemption IDs.

Marketing cannot write `orders`, `order_price_snapshots`, `payment_orders`, refunds, ledger or settlement records. The Order orchestrator owns those writes; Payment continues to copy the final Order total.

## 8. Cancellation, refund and compensation

- Only `order.reverse.applied` with `reverseType=cancel` can trigger cancellation compensation. Requested/approved-but-not-applied reverse events do nothing.
- Only `refund.approved` can trigger refund compensation. The current refund contract is full-refund only.
- An already redeemed grant is never resurrected. A successful policy decision creates one new compensating grant.
- Compensation value equals the original actual `discountAmountMinor`, expires 30 days after issuance, and cannot broaden SKU/city/customer scope.
- Compensation uses `compensationCap` / `compensationIssuedCount` and does not consume `issuanceCap` / `issuedCount`.
- Revoked/fraud-disqualified source promotions or explicitly denied manual review produce a terminal `denied` decision with audit reason.
- Partial-refund coupon return is unsupported and fails closed.
- No `payment.failed` event or producer exists; Phase 29 must not invent payment-failure release. A future Payment-owned producer and Finance-approved policy are prerequisites.
- A compensating grant is valid for exactly 30 days from its own issuance. Natural
  `campaign=ended`, `definition=expired`, and the original campaign/definition time windows do
  not shorten it; `campaign=paused|revoked`, `definition=suspended|retired`, unpublished/drifted
  rule evidence, SKU mismatch and minimum-spend failure remain fail-closed.
- Compensation code is dormant in Phase 29: it requires an already leased exact-v0 Platform
  Delivery claim, revalidates claim/source inside the target MySQL transaction, and atomically
  persists the compensation, independent-cap mutation, grant and audit evidence. Phase 29 does
  not register or activate a subscriber, subscription, runner, scheduler, route, backfill or replay.

## 9. API surface

Customer:

- `GET /api/customer/marketing/coupon-grants` — own same-city grants only.
- `POST /api/customer/marketing/discount-decisions` — issue an immutable five-minute decision for one explicitly selected own grant.

Admin:

- `GET|POST /api/admin/marketing/campaigns`;
- `POST /api/admin/marketing/campaigns/:id/review`;
- `POST /api/admin/marketing/campaigns/:id/schedule`;
- `POST /api/admin/marketing/campaigns/:id/status`;
- `GET|POST /api/admin/marketing/campaigns/:id/rule-revisions`;
- `POST /api/admin/marketing/rule-revisions/:id/review`;
- `POST /api/admin/marketing/rule-revisions/:id/publish`;
- `GET|POST /api/admin/marketing/coupon-definitions`;
- `POST /api/admin/marketing/coupon-definitions/:id/status`;
- `POST /api/admin/marketing/coupon-grants`;
- `POST /api/admin/marketing/coupon-grants/:id/revoke`.

The public Admin grant route accepts only `issuanceReason=admin_manual`. Cancellation and full-refund reasons are internal compensation facts and cannot be forged through the Admin route.

The decision-accept operation is an internal Order-orchestration service boundary, not a public escape-hatch route. Its command contains only `discountDecisionId`, `expectedDecisionVersion`, `orderId`, `orderCommandKey`, `skuId` and `quantity`; Order/Marketing re-read Pricing and stored fingerprint evidence instead of accepting either from a caller. Request/response validators are strict; unknown fields fail. Cross-city and non-owner reads collapse to not-found where needed to avoid an existence oracle.

The existing read-only Admin Order Trace may project persisted pricing source, integer-fen gross/discount/net, and decision/rule/grant/reservation/redemption evidence. It must not recompute money or expose raw eligibility inputs.

## 10. PII, retention and audit

Marketing persistence may contain P1 pseudonymous customer IDs and references plus P2-FIN integer amounts. It must not contain names, phones, addresses, Support/review text, exact coordinates, credentials, tokens or provider identifiers.

Approved retention schedule:

| Record | Retention |
| --- | --- |
| Accepted decision, redemption, compensation and referenced published rule revision | R2; 10 years after Order closure |
| Unaccepted terminal decision and reservation | 180 days after terminal/expiry |
| Unused expired or revoked grant | 2 years after terminal state |
| Audit required to explain retained financial facts | Same period as the retained financial fact |

Legal hold suspends purge. Customer-facing hiding never deletes required financial/audit evidence. Any physical purge requires a separately gated job, dependency ordering, reason evidence and Finance/Privacy/Legal approval.

Definition/revision review/publication, campaign status, manual grant/revoke, inventory adjustment, reservation recovery and compensation decisions write append-only audit with actor, role, reason, expected/actual version, trace and timestamp.

## 11. Event allowlist

Initial Marketing source-event allowlist:

- `order.reverse.applied` — only the minimal cancel-applied shape;
- `refund.approved` — minimal full-refund fact.

Marketing does not subscribe to `payment.paid`, reverse requested/approved, Review, Reputation, Support, Dispatch, Fulfillment, Ledger or Settlement events in MVP.

Marketing-owned event candidates are `marketing.discount.decision.issued`, `marketing.coupon.reserved`, `marketing.coupon.redeemed` and `marketing.coupon.released`. Each requires a strict versioned payload, same-city identity, minimal PII and idempotency. This contract does not activate a Platform subscriber, replay, backfill or external Provider.

## 12. Required rejection behavior

The runtime fails closed for wrong city/customer, unauthorized role, inactive/revoked lifecycle, expired decision/grant, stale version, fingerprint mismatch, price-rule drift, gross mismatch, insufficient spend, enterprise pricing, inventory exhaustion, duplicate/conflicting idempotency, multiple coupons, non-CNY money, non-integer amounts, zero/free Order result, unsupported partial refund and unknown fields.

Frontend code may display server results but may not calculate discount, infer eligibility, execute `discountRuleId`, reserve stock or synthesize success.
