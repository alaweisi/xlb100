# Contract — Review / Moderation / Reputation

> Phase: 28
> Status: **APPROVED FOR PHASE28 CONSTRUCTION — NOT PRODUCTION-ACTIVE**

## 1. Canonical source compatibility

The existing Customer mutation remains the only rating writer:

```http
POST /api/orders/{orderId}/reviews
x-xlb-city-code: <real city>
Authorization: Bearer <customer token>
```

Request remains strict: integer `rating` from 1 through 5 and trimmed `comment` from 1 through 500 characters. The UI must require real user input and must not synthesize a fallback comment.

The service validates authentication, Customer app/role, real city, matching order owner, paid order and completed same-city fulfillment before returning either a new or existing review. Wrong owner/city/role/status does not disclose an existing review.

Successful creation atomically persists:

1. one immutable `order_reviews` row;
2. one `pending_moderation` visibility fact;
3. one `review.created` exact-major-1 Outbox row.

## 2. Strict event contracts

### 2.1 `review.created` v1

```ts
type ReviewCreatedV1 = {
  reviewId: string;
  orderId: string;
  workerId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  visibility: "pending_moderation";
  occurredAt: string;
};
```

Envelope requirements: `event_type='review.created'`, `event_major_version=1`, `aggregate_type='order_review'`, `aggregate_id=reviewId`, real envelope city and aggregate version/sequence `1`.

### 2.2 `review.visibility.changed` v1

```ts
type ReviewVisibilityChangedV1 = {
  reviewId: string;
  workerId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  fromVisibility: "pending_moderation" | "visible" | "hidden";
  toVisibility: "visible" | "hidden";
  moderationVersion: number;
  occurredAt: string;
};
```

Envelope requirements: exact major `1`, aggregate `order_review/reviewId`, and aggregate version/sequence equal to the positive `moderationVersion`.

Both schemas are strict. `review.visibility.changed@1` has exactly seven payload fields: `reviewId`, `workerId`, `rating`, `fromVisibility`, `toVisibility`, `moderationVersion`, and `occurredAt`. Unknown keys and invalid timestamps fail. `decisionId`, `decisionVersion`, `reasonCode`, `comment`, `customerId`, `cityCode`, name, phone, address, evidence, token, rendered content and unrestricted JSON are forbidden. Moderation decision/reason details remain inside the Review domain.

## 3. Moderation contract

Moderation queues are always redacted for every role. Only a same-city `admin` principal may read full comment content through the dedicated single-item route or decide visibility. For Phase28, `role=admin` plus explicit Admin city scope plus the dedicated Review route is the frozen `review.moderate` permission mapping. Every successful content read and every decision creates append-only audit evidence; each content-read audit uses purpose `moderation_detail`.

The logical operations are:

- list pending work with a signed opaque keyset cursor and a limit from 1 through 100, always with `comment=null` and `commentRestricted=true`;
- read one same-city moderation item through `GET /api/admin/reviews/{reviewId}/content` after content-access authorization and append the `moderation_detail` access audit;
- decide `visible` or `hidden` with `expectedVersion` bound to the current visibility row version, bounded `reasonCode` and idempotency key;
- list and decide appeals under separate appeal-review permission.

Operator and Auditor access is read-only and redacted. An ordinary order-trace route or broad role without the frozen `review.moderate` mapping is not sufficient for content access or mutation. Cross-city and unauthorized lookups must not reveal existence.

Appeal review is a separate permission mapping: `role=admin` plus explicit Admin city scope plus the dedicated `/api/admin/review-appeals` routes is `review.appeal.review`. It does not follow from `review.moderate`; Operator and Auditor may use only the redacted appeal list and cannot resolve appeals.

Moderation and appeal queue cursors bind the queue kind, city, verified Admin role and normalized visibility/status filter. They advance by the stable `(created_at, id)` keyset, responses return `nextCursor: string | null`, and tampered or cross-scope cursors fail with `400` before any queue row is returned.

## 4. Appeal contract

- Customer can create an appeal only for their own review's current `hidden` decision.
- Worker can create an appeal only from bounded decision metadata affecting that worker's aggregate; no raw comment is returned.
- One active appeal is allowed per `(city, decision_id, decision_version, subject_type, subject_id)`.
- Same idempotency key plus same fingerprint returns the canonical appeal. Same key plus different fingerprint conflicts.
- The owning Customer or Worker may idempotently withdraw the active appeal for the same moderation version; a terminal appeal releases the database active-appeal guard.
- Only a different authorized same-city appeal reviewer may resolve it to `upheld` or `rejected`.
- Upholding the appeal appends a new moderation decision and v1 visibility event in the same transaction; rejecting it preserves the challenged decision.

### Worker self appeal targets

```http
GET /api/worker/review-appeal-targets
x-xlb-city-code: <real city>
Authorization: Bearer <worker token>
```

The Worker identity is derived from verified RequestContext. The response contains at most 100 items, and each item has exactly five fields:

```ts
type WorkerReviewAppealTarget = {
  reviewId: string;
  visibility: "visible" | "hidden";
  moderationVersion: number;
  decidedAt: string;
  activeAppealStatus: "open" | null;
};
```

`comment`, `rating`, `orderId`, `customerId`, `reason`, and moderator/actor identity are forbidden. This endpoint is a self/city-scoped capability index for appeal, not a public review list or Worker source-review feed.

## 5. Reputation reads

### Worker own read

```http
GET /api/worker/reputation
x-xlb-city-code: <real city>
Authorization: Bearer <worker token>
```

The subject is derived from verified RequestContext; no worker override is accepted. The response contains only the current validated generation, exact visible review count, rating sum/distribution, optional arithmetic mean and freshness/watermark metadata. It contains no source review ID, comment, customer identity or reviewer profile.

### Admin same-city read

Authorized Admin/Auditor may query a worker aggregate only inside an assigned city scope. Admin does not gain mutation authority from read authority.

### Forbidden reads

There is no Customer/public Reputation endpoint and no Dispatch endpoint, import or query. No reputation result changes eligibility, offer order, dispatch ranking, worker profile, certification or penalty.

## 6. Error and concurrency model

| Condition | Public result | Target effect |
|---|---|---|
| missing/invalid city header | RequestContext 400 | zero |
| wrong role/permission | 403 or route-standard hidden result | zero |
| wrong owner or cross-city record | 404-style non-disclosure | zero read of protected content; zero write |
| unreviewable order | 409 | zero |
| stale decision/generation version | 409 | zero |
| already-applied same command | 200 canonical result | no duplicate row/event/contribution |
| idempotency-key fingerprint conflict | 409 | zero |
| unknown event major / invalid strict payload | sanitized Platform failure/DLQ | zero projection effect |
| expired or mismatched claim | conflict/failure | zero projection effect |

All Review-domain commands follow the same database lock order: canonical Review row, command idempotency unique-index current-read, then Appeal row when one is required. Ownership is proved after the Review lock and before an appeal/withdrawal idempotency result is considered. The rule applies to moderation, appeal creation, appeal withdrawal and appeal resolution. Concurrent same-scope reuse of a key across different targets or fingerprints produces `409`; an exact replay produces canonical `200`. MySQL duplicate-key or deadlock arbitration is retried only through this same lock order and must never surface as an unhandled `500`.

## 7. Projection contract

The Reputation subscriber consumes only exact v1 Review events from Platform Delivery. Target processing and durable receipt/contribution identity are atomic. The projection must revalidate city, subscription, event major, source hash, claim lease, source snapshot, review/worker identity and monotonic decision version before changing a target.

Visible contribution identity is unique by source review and generation. Repeated create/visibility events, retry, reconciliation and replay cannot double-count. `hidden` removes the contribution exactly once; returning to `visible` restores it exactly once.

No historical backfill executes in Phase28. A generation dry run produces bounded count/hash evidence only until separate human approval authorizes build/cutover.

## 8. Deferred and prohibited

Worker reply, public ratings, weighted score, time decay, ranking, dispatch use, external Provider, physical deletion, automated retention purge, production subscription activation, historical backfill and Phase29 Marketing are not part of this contract.
