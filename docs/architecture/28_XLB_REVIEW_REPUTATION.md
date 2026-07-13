# Phase 28 Review / Reputation Architecture

> Status: **APPROVED ENTRY BASELINE — CONSTRUCTION AUTHORIZED — NOT LOCKED**
> Human decision: the conservative fourteen-point entry package was approved on 2026-07-13. This document authorizes Phase28 engineering only; it does not authorize Phase29, push, staging/production deployment, Provider activation, or production data processing.

## 1. Factual baseline

- Phase27 is locked at `xlb-phase27-notification-foundation`; migrations `000`–`055` are immutable.
- `backend/src/review` is the canonical customer order-review writer. Migration `030_order_review_mvp.sql` already enforces one review per city/order and stores rating plus comment.
- Review creation must retain the paid-order, completed-fulfillment, matching-customer, matching-city and one-review invariants.
- Phase27 Platform Delivery is the only approved fan-out boundary. Reputation may not add a direct table scanner or a second rating writer.
- Phase14 remains `64/100`, `IN PROGRESS`, and staging/production `NO-GO`.

## 2. Ownership and write boundaries

| Concern | Sole writer / owner | Allowed readers | Forbidden coupling |
|---|---|---|---|
| Rating and comment fact | existing Review transaction and `order_reviews` | owning Customer; separately authorized same-city moderator | parallel rating/review writer; Worker or Admin rewriting the fact |
| Visibility/moderation | Review moderation sidecar | owning Customer; authorized moderator/auditor; Reputation through events | mutating `order_reviews.rating/comment`; ordinary Operator comment access |
| Appeal | Review appeal sidecar | subject, authorized appeal reviewer, Auditor | original moderator deciding the appeal; more than one active appeal per decision version |
| Reputation contribution/aggregate | Reputation projection subscriber | owning Worker; authorized same-city Admin/Auditor | writes to worker profile, eligibility, Dispatch, Order, Payment, Fulfillment, Ledger or Settlement |
| Source events | existing Review transaction / moderation transaction | exact-version Platform Delivery | event payload containing comment, customer ID, address, evidence, token or unrestricted JSON |

`order_reviews` remains an immutable source fact. Its historical `status='created'` is not repurposed as moderation state. Moderation, visibility, appeal, projection contribution and generation facts are additive sidecars in migration `056`.

## 3. Mandatory security correction

The pre-Phase28 service looked up and returned an existing review before proving that the caller owned the order. Phase28 must lock and validate the caller-owned reviewable order before an existing review can be returned. A wrong owner, wrong city, wrong role, unpaid order or incomplete fulfillment must produce zero Review/Reputation writes and must not disclose review existence or content.

Concurrent duplicate creation is successful only when the same authenticated owner/city/order reaches the canonical existing row. A database duplicate race must be recovered by re-reading through the same ownership guard; it must not leak another customer's row.

## 4. Review and moderation state machines

### 4.1 Immutable source

```text
absent -> created
```

There is no source edit/delete transition in Phase28.

### 4.2 Visibility

```text
pending_moderation -> visible
pending_moderation -> hidden
visible -> hidden
hidden -> visible
```

- A new review defaults to `pending_moderation` and contributes zero reputation points.
- Every transition requires same-city moderator authority, expected moderation version, bounded reason code, actor/trace/time audit and an exact `review.visibility.changed` v1 event. The domain audit retains decision/reason details; the event exposes only review ID, worker ID, rating, from/to visibility, moderation version and occurrence time.
- Review-domain mutations use one lock hierarchy: authorize and locate without a locking read, lock the canonical `order_reviews` row, prove subject ownership where applicable, perform the command's unique-index `FOR UPDATE` idempotency lookup, and only then lock an Appeal row or mutate visibility. Moderation, appeal creation, withdrawal and resolution may not acquire an idempotency/gap lock before the Review row lock. A bounded retry after MySQL duplicate/deadlock arbitration must re-enter this hierarchy and can return only the committed canonical command or a fingerprint/target conflict.
- The Customer who authored the review can see their own source and current moderation result in every visibility state.
- The Worker never receives the raw comment or a source-review feed. Phase28 exposes only the worker's own aggregate through `GET /api/worker/reputation` plus a privacy-minimized self appeal-target list through `GET /api/worker/review-appeal-targets`. The appeal-target response contains at most 100 items. Each target has exactly `reviewId`, `visibility`, `moderationVersion`, `decidedAt`, `activeAppealStatus`; rating, order/customer identity, reason, actor and content remain hidden.
- Moderation queues are always redacted for every role; they never return comment text. Full content is available only to a same-city `admin` through the dedicated single-item `GET /api/admin/reviews/{reviewId}/content` route, and every successful read appends a content-access audit with purpose `moderation_detail`. For Phase28, `role=admin` plus explicit Admin city scope plus this dedicated Review route is the frozen `review.moderate` permission mapping. Operator and Auditor remain read-only and redacted; an ordinary order-trace reader must not receive comment text.

### 4.3 Appeal

```text
absent -> open -> upheld | rejected
                 \-> withdrawn
```

- Customer may appeal a hidden decision. Worker may appeal a decision that removes or adds a contribution to the worker's reputation.
- `GET /api/worker/review-appeal-targets` exists only to make that Worker right exercisable. It is self/city scoped, bounded and is not a public or raw Review listing.
- At most one non-terminal appeal exists for a moderation decision version.
- Idempotency identity is actor/subject scoped and global across Review/Appeal targets inside that scope. Reusing a key for the same target and fingerprint returns the canonical row; reusing it for another target or fingerprint returns a conflict, including under concurrent requests, without exposing a database error.
- The moderator who made the challenged decision cannot decide the appeal.
- `upheld` means the appeal succeeds and creates a new audited moderation decision; `rejected` preserves the challenged decision. Neither outcome edits historical decisions.

Worker replies are explicitly deferred. Phase28 must not create a reply table, endpoint, event, UI or placeholder success state.

## 5. Reputation model

For each real city, worker and validated generation, the projection stores only visible-review facts:

- `visibleReviewCount`;
- `ratingSum`;
- exact `rating1Count` through `rating5Count`;
- arithmetic mean derived as `ratingSum / visibleReviewCount` when count is non-zero;
- generation/revision and source watermark/count/hash evidence.

There is no weighting, time decay, ranking, star band, Bayesian score, qualification effect or dispatch effect. Refund after review does not remove a contribution. Only an audited visibility transition changes inclusion.

Phase28 has no Customer/public reputation API, so no public low-sample threshold is invented. The owning Worker and authorized same-city Admin may see the exact sample count and arithmetic mean. Dispatch is forbidden from importing, querying, subscribing to or otherwise using Reputation.

## 6. Projection and generation safety

- Reputation consumes exact-major Platform Delivery rows and persists a durable `(subscriber_id,event_id)` receipt/contribution identity before acknowledging delivery.
- `review.created` v1 creates a non-contributing pending fact. `review.visibility.changed` v1 includes/removes the contribution according to the latest monotonic decision version.
- Claim-time processing must revalidate active exact-version subscription, city, source event, payload hash, lease token, source snapshot, review identity and decision version inside the target transaction.
- Retry, lease expiry, duplicate materialization and ordinary replay return the same canonical result and never double-count.
- Rebuild writes a new isolated generation, records dry-run count/hash and validation evidence, then changes the current-generation pointer atomically. It never truncates or mutates the current generation in place.
- Historical reviews are not automatically backfilled. Phase28 may implement a bounded dry-run count/hash capability, but executing a historical build/cutover requires a separate explicit human approval.
- No subscriber, subscription, live-start, activation, backfill or replay seed is included in migration `056`.

## 7. Event version contract

Phase28 introduces an explicit `event_major_version` on the source Outbox. Existing rows and existing producers remain compatibility major `0`. The Review producer writes `review.created` with exact major `1` in the same transaction as the source review and pending moderation sidecar.

Platform candidate scans, reconciliation, delivery creation and claim-time validation must bind both `event_type` and `event_major_version`. A known type with an unknown major, or a major-1 payload that fails its strict validator, is rejected fail-closed with zero target effect.

The exact v1 payloads are frozen in `docs/contracts/CONTRACT_REVIEW_REPUTATION.md`. `review.visibility.changed@1` contains exactly seven fields: `reviewId`, `workerId`, `rating`, `fromVisibility`, `toVisibility`, `moderationVersion`, `occurredAt`. Neither payload carries comment, customer/city identity, decision ID/version or reason code.

## 8. Privacy, retention and deletion

- Comment is P2 content. It is absent from Platform Delivery, Reputation, worker responses, ordinary order traces, logs, errors and metrics.
- Phase28 performs no automatic physical cleanup. Review facts, moderation decisions, appeals, contributions, receipts and audit evidence remain immutable while legal duration is unresolved.
- A deletion request or legal hold may be recorded only as a tombstone/audit fact. It cannot physically delete or silently redact the source in Phase28.
- This conservative no-purge policy is engineering-safe but not production-retention approval; Phase14 production `NO-GO` remains in force.

## 9. Migration `056` constraints

Migration `056` is append-only and must:

1. preserve migrations `000`–`055` byte-for-byte;
2. add explicit source event major version with default/compatibility value `0`;
3. harden `order_reviews` with composite same-city references to Order, Fulfillment and `worker_city_bindings` without altering migration `030`;
4. create only Review/Reputation sidecars, generations, contributions, aggregates, receipts/actions and schema marker;
5. use real `city_code`, composite city FKs, non-cascading evidence relationships, unique idempotency/version keys and bounded checks;
6. contain no business seed, activation, subscription, backfill, fake review or projection rows.

## 10. Exit gates

Phase28 is eligible for Lock only after contract/type/validator alignment, migration replay, ownership-before-idempotency proof, cross-city/role/owner zero-leak proof, strict event-v1/PII proof, delivery retry/reconciliation/claim-revalidation proof, contribution idempotency, generation isolation/cutover proof, A/W/Admin real-API evidence, protected-domain zero-write proof, full regression, build, typecheck, architecture preflight and independent review all pass.

No Phase29 code or migration may be included in the Phase28 Lock.
