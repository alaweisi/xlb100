# Phase 28 Review / Reputation Runtime Decision Report

Date: 2026-07-13
Status: **HUMAN APPROVED — ENTRY DECISIONS FROZEN**

## Decision record

The human explicitly approved the conservative Phase28 entry package and authorized continuous construction through independent acceptance, merge and Lock. The authorization does not include push, production deployment or Phase29.

| # | Frozen decision | Engineering consequence |
|---:|---|---|
| 1 | New reviews start `pending_moderation` | pending reviews contribute zero until an audited visibility decision |
| 2 | `order_reviews` is the one immutable writer | no edit/delete and no parallel rating table or service |
| 3 | Customer sees own review; Worker sees own aggregate only | no Worker raw review/comment surface |
| 4 | Full comment requires dedicated same-city moderator authority and audit | all moderation lists and ordinary order traces are redacted; same-city `admin` uses a dedicated single-item content route and each successful read records purpose `moderation_detail`; Operator/Auditor remain read-only and redacted |
| 5 | Worker Reply deferred | no reply schema/API/event/UI |
| 6 | Customer/Worker bounded appeal, one active appeal, four-eyes decision | append-only appeal and decision sidecars with subject/city/version guards; Worker receives only the self/city-scoped appeal-target index, capped at 100 five-field items |
| 7 | Visible count/sum/distribution/arithmetic mean only | no weighting, decay, bands, ranking or Bayesian formula |
| 8 | Refund does not remove review | only visibility decisions change contribution inclusion |
| 9 | No public/Customer Reputation API | no invented public low-sample threshold; exact count visible only to owner/admin |
| 10 | Dispatch may not read Reputation | no import, query, subscriber, eligibility or ranking coupling |
| 11 | No Phase28 physical purge | tombstone/audit only; legal retention remains a production blocker |
| 12 | No automatic historical backfill | dry-run count/hash may be built; execution/cutover needs separate approval |
| 13 | Strict explicit-major Review v1 events exclude comment/customer ID | source Outbox exact version plus strict validators and exact Platform filtering; visibility event is the approved seven-field minimum |
| 14 | Append-only migration `056` with composite city hardening | migrations `000`–`055` immutable; no seed/activation data |

## Additional mandatory remediation

Entry audit found a P1 ownership ordering defect: the old create service returned an existing review before validating the caller-owned order. Phase28 construction must validate/lock the owned reviewable order first and must prove wrong-owner non-disclosure before exit.

Entry audit also found that the Customer UI supplied a fabricated default comment when input was blank. Phase28 must remove that behavior and require real input under the unchanged strict review contract.

## Version decision

The source Outbox gains explicit `event_major_version`, defaulting existing/legacy rows and producers to compatibility major `0`. `review.created@1` and `review.visibility.changed@1` use exact major `1`. Candidate materialization, retained-source reconciliation, claim projection and claim-time target revalidation all bind the exact major; no payload-based version guessing is permitted. `review.visibility.changed@1` is exactly `reviewId`, `workerId`, `rating`, `fromVisibility`, `toVisibility`, `moderationVersion`, `occurredAt`; decision/reason/comment/customer/city fields are prohibited.

## Worker appeal-discovery decision

`GET /api/worker/review-appeal-targets` is approved only as a privacy-minimized self/city-scoped capability index. The response contains at most 100 items. Each item is exactly `reviewId`, `visibility`, `moderationVersion`, `decidedAt`, `activeAppealStatus`. It must not contain comment, rating, order/customer ID, reason or actor and must not be represented as a public Review list. Worker Reputation itself is read only through the self-scoped `GET /api/worker/reputation` endpoint.

## Review moderation permission mapping

Moderation queues are redacted for every role. For Phase28, `role=admin` plus explicit Admin city scope plus the dedicated `GET /api/admin/reviews/{reviewId}/content` Review route is the frozen `review.moderate` permission mapping. Each successful content read appends a content-access audit with purpose `moderation_detail`. Operator and Auditor access remains read-only and redacted; neither role may read Review content or mutate moderation/appeals.

## Production truth

This decision freezes engineering semantics only. Phase14 remains `64/100`, staging/production `NO-GO`; no subscriber activation, scheduler, live-start, historical replay, Provider, deployment or push is approved.
