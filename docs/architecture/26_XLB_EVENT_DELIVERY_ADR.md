# ADR-26-01 — Independent Platform Event Delivery

- **Status:** Accepted for Phase26 design — design only, not implemented
- **Date:** 2026-07-13
- **Decision owner:** Human architecture/product acceptance
- **Scope:** Design only; no implementation or migration is authorized

## 1. Context

The current `event_outbox` transactionally records domain events. Migration `044_phase23b_event_outbox_reliability.sql` added one source-row lifecycle: `pending → processing → published`, with `retry_wait`, `dead_letter`, owner/token lease, attempt count, retry delay, and lease reaping.

Dispatch claims `order.created`. Ledger claims `fulfillment.completed` and `refund.approved`. Each successful consumer acknowledges the source row as `published`. This is a leased work queue in which the same source row shares one lifecycle and completion state. At any instant there is at most one active lease; a failure or lease expiry can produce multiple **sequential retry claims** over time. Competing workers implement the same consumer responsibility and are not independent subscribers.

Notification, Reputation projections, Risk-Control, and Analytics/BI need independent consumption. Adding each as another `claimEventsByType` caller would be incorrect because:

1. one subscriber could set the source row to `published` before another sees it;
2. retries, DLQ, and leases would be shared across unrelated subscribers;
3. one subscriber's outage could steal or block another subscriber's work;
4. source `published` would be falsely interpreted as “all subscribers completed.”

Enterprise Webhook demonstrates a local pattern with `business_webhook_subscriptions` and unique `(city_code, subscription_id, event_id)` deliveries. It is restricted to enterprise orders, enterprise event allowlists, and enterprise callback delivery. It is a reference only and must not be promoted into a general platform backbone.

## 2. Decision drivers

- Preserve all locked source-event, Dispatch, and Ledger semantics.
- Add independent per-subscriber retry/DLQ/replay without source-row contention.
- Use the existing MySQL operational baseline while production-readiness ownership, backup/restore, alerts, and external prerequisites remain explicit.
- Enforce real-city scope, role/service identity, minimal PII, auditability, and bounded operations.
- Retain at-least-once truthfulness; do not claim exactly-once processing.
- Permit a later broker migration without coupling business writers to a broker today.

## 3. Options considered

### Option A — Additive MySQL per-subscriber delivery ledger

Keep `event_outbox` as the producer-owned source record and existing work-claim path. Add a platform registry and one canonical independently leased delivery row per `(subscriber_id, event_id)`. Replay attempts and projection-rebuild generations are recorded separately and must not create a second canonical delivery row for the same subscriber/source event pair.

Advantages:

- smallest additive change to the current MySQL architecture;
- preserves existing producer transactions and current Dispatch/Ledger consumers;
- independent subscriber leases, retries, dead letters, replays, retention and audit;
- composite city foreign keys and uniqueness can be enforced in the database;
- aligns with the proven shape of enterprise Webhook deliveries without inheriting enterprise-specific scope.

Costs/risks:

- materialization/reconciliation correctness becomes a platform responsibility;
- MySQL delivery volume, indexes, purge, backup/restore and alert thresholds require capacity evidence;
- source event schema version and aggregate sequence are currently mostly implicit/absent;
- it is not a globally ordered streaming platform.

### Option B — Immutable event log plus per-subscriber checkpoint

Create a new immutable canonical log and let every subscriber advance an independent checkpoint.

Advantages:

- natural replay and append-only semantics;
- fewer per-delivery rows for high subscriber counts;
- clear separation from mutable source delivery status.

Costs/risks:

- the current `event_outbox` is not an immutable log and has mutable delivery state;
- adopting this now requires a new canonical event-write path, dual-write or log materialization, gap detection, retention and log-compaction decisions;
- a checkpoint alone does not retain per-event attempts/DLQ without additional tables;
- poison events and out-of-order retry can stall a checkpoint or require complex skip ledgers.

### Option C — External broker plus consumer groups

Publish source events to Kafka/Pulsar/RabbitMQ or another approved broker and use independent consumer groups.

Advantages:

- native consumer isolation, partitioning, retention and replay capabilities;
- better path for sustained high throughput and many subscribers;
- established ecosystem for lag and group operations.

Costs/risks:

- no broker is currently an approved XLB dependency or operated Provider;
- introduces provisioning, security, monitoring, backup/DR, schema registry, cost and on-call ownership;
- still requires a transactional Outbox relay and consumer idempotency;
- would expand the current production-readiness surface before volume evidence justifies it.

## 4. Accepted design decision

**Accepted for Phase26 design:** adopt **Option A: additive MySQL per-subscriber delivery ledger** as the target architecture for possible Phase 27–31 implementation, subject to each implementation Phase's independent entry Gate and authorization.

This acceptance is not implementation. Phase 27 runtime remains blocked. Migration `054+`, runtime modules, APIs, pages, Providers, subscription activation, backfill and replay are not authorized. Existing `event_outbox`, Dispatch, Ledger, and Enterprise Webhook code and semantics remain unchanged until an independently authorized compatibility step.

Option B remains an evolution path if immutable-log requirements become concrete. Option C requires a separate architecture decision supported by throughput, reliability, staffing, and operations evidence.

## 5. Ownership model

| Concern | Owner |
| --- | --- |
| Source event type, business meaning, payload, aggregate, occurrence time | Producing business domain |
| Transactional insertion of source event | Producing business domain |
| Existing source-row claim/ack for Dispatch and Ledger | Existing consumer and Events module |
| Subscriber identity, event/version allowlist and PII ceiling | Platform delivery control plane, approved by producer/privacy owner |
| Subscription city scope and activation boundary | Platform delivery control plane |
| Candidate-scan checkpoint optimization and retained-source anti-join gap reconciliation | Platform delivery control plane |
| Delivery status, lease, retry, dead letter and attempt history | Platform delivery control plane |
| Replay request/generation and manual action audit | Platform delivery control plane plus human operator approval |
| Business side effect and durable deduplication | Subscriber domain |
| Source/derived data deletion and correction | Canonical business domain / derived-domain owner respectively |

The platform layer never edits source payloads or business tables.

### 5.1 Three-layer semantic comparison

| Boundary | Source `event_outbox` | Phase 19 Enterprise Webhook delivery | Proposed platform delivery |
| --- | --- | --- | --- |
| Owner | Producer owns event meaning/payload; Events plus the designated typed consumer own the shared source lifecycle | Enterprise owns subscriptions, enterprise-order eligibility, delivery and Provider envelope | Platform owns subscriber registry, materialization, delivery, attempt and replay control; producer still owns source meaning |
| Claim / ack | One shared lifecycle/completion state; at most one active lease; sequential retry claims are possible; `published` acknowledges only the designated source-queue responsibility | Candidate discovery creates one row per enterprise subscription/event; delivery run updates that enterprise delivery only | One canonical row per `subscriber_id + event_id`; lease/ack is independent per subscriber and never updates source status |
| Retry | Shared source attempt/backoff for the designated current responsibility | Per enterprise delivery `pending/retry_wait`; manual force-retry exists | Per subscriber delivery with bounded backoff, lease CAS and independent reaper |
| DLQ | One source-row `dead_letter`; unresolved source DLQ is not “all subscribers done” | Per enterprise delivery `dead_letter` | Per subscriber delivery DLQ; unresolved DLQ blocks relevant purge but not other subscribers |
| Replay | No generic multi-subscriber replay contract; existing domain diagnostics are not a fan-out replay API | Force-retry of an existing enterprise delivery; no platform replay generation | Bounded, approved replay generation/action against the same canonical delivery/idempotency boundary; projection rebuild uses a separately approved subscriber/target generation |
| Retention | Producer/Privacy owner decides source retention; it must cover approved materialization/reconciliation or subscription is rejected/uses approved tombstone handling | Enterprise policy is additionally constrained by its source-event FK and unfinished/unresolved deliveries | Platform policy covers delivery/attempt/replay/audit windows but cannot unilaterally extend source PII retention |
| FK boundary | Existing city/event keys and producer-domain references; Phase 19 deliveries reference `(city_code,event_id)` | Composite city subscription/client/source-event FKs; source purge remains restricted while dependencies exist | Proposed delivery→source and attempt→delivery use `RESTRICT/NO ACTION`; audit is never cascade-deleted and retains copied identifiers |
| Audit boundary | Source lease/error/status plus producer/domain audit; not per-subscriber completion evidence | Attempt count, last error and truthful Provider envelope for the enterprise subscription | Append-only attempt/manual-action/replay audit with sanitized errors; subscriber target idempotency is separate evidence |

The three layers are compatible but not interchangeable. In particular, Enterprise Webhook delivery is not the platform backbone, and proposed platform acknowledgement cannot reinterpret source `published`.

## 6. Subscriber registration

A subscriber registration must freeze:

- stable `subscriber_id`, owning domain/team, handler/schema revision and operational contact;
- allowed app/service identity and real-city scope;
- exact `event_type` and one exact accepted **major version** per subscription row; implicit current events use major `0`;
- purpose, maximum PII level, retention class and target table/read model;
- activation status: proposed, active, paused, revoked;
- live start boundary and whether a bounded historical backfill is approved;
- concurrency, lease duration, maximum attempts, retry policy and DLQ policy;
- ordering requirement and aggregate sequence support;
- durable idempotency mechanism and reconciliation command/gate;
- rollback owner and kill switch.

Registration is deny-by-default. Wildcard event types, unbounded cities, unknown versions, or PII above the subscriber ceiling are rejected. A “global admin” marker is never stored as a business subscription city.

The executable allowlist key is exactly `(city_code, subscriber_id, event_type, event_major_version)`. One row represents one major version; ordinary MySQL uniqueness can enforce that key. Overlapping `min_version/max_version` ranges are forbidden because a normal unique key cannot prove that two ranges do not overlap.

- A new major event version creates a new paused allowlist row and passes catalog, PII, handler and replay review before activation; it never widens an existing row.
- Pausing a row stops new live materialization and claims. Existing deliveries remain auditable. A paused row participates in historical replay only with an explicit replay approval that names that exact major version.
- Revoking a row permanently stops new materialization, claims and replay. Re-enablement requires a new human decision and a new approved row/revision; it is not an in-place range edit.
- Historical replay is filtered against the exact major-version allowlist effective for that replay. It cannot use a currently unknown or revoked major version.

## 7. Materialization and compatible source reads

The future materializer may use `(created_at, event_id)` and a per-subscription cursor to optimize candidate scans, **regardless of source delivery status**, but that cursor is not a correctness boundary. `created_at` is not a database commit sequence: a long producer transaction can insert an event with an earlier timestamp, commit after the materializer has advanced beyond that timestamp, and create commit skew. A high-water cursor plus a unique key therefore cannot by itself guarantee no gap.

Correctness comes from reconciliation over **retained source events**. For every active `(city_code, subscriber_id, event_type, event_major_version)` allowlist row, a bounded anti-join compares eligible retained `event_outbox` rows with `platform_event_deliveries` and inserts every missing delivery. The exact live idempotency key is unique `(subscriber_id, event_id)`; repeated candidate scans and repeated reconciliation are safe no-ops after the first insert. City remains an enforced column and composite FK boundary even where `event_id` is globally unique.

Candidate cursor scans provide low-latency delivery creation. Periodic anti-join reconciliation, overlapping retained windows, row-count/hash/watermark evidence and an explicit unresolved-gap alert provide completeness. A crash, long transaction, delayed commit or cursor advance can delay a delivery but cannot be declared complete until reconciliation proves no eligible retained source row lacks its subscriber delivery.

New subscribers start at an explicit event/time boundary and exact major version. Historical delivery requires a separate bounded replay/backfill approval; activation must not silently scan all history. The approved source retention window must cover the materialization and reconciliation horizon before activation.

Existing source readers continue unchanged:

- Dispatch and Ledger use their current typed claims and source-row lifecycle.
- Enterprise Webhook keeps its enterprise-order-scoped delivery tables and queries.
- New platform subscribers use only their own delivery ledger.

No Phase 27 subscriber may interpret source status when deciding whether it is entitled to a delivery.

## 8. Delivery state and lease/CAS

Proposed delivery states:

```text
pending -> processing -> delivered
   |           |
   |           +-> retry_wait -> processing
   |                         \
   +--------------------------> dead_letter

paused subscription: no new claim; rows remain unchanged
manual retry: dead_letter/retry_wait -> pending, with append-only action audit
```

Rules:

- claim is restricted by `city_code`, `subscriber_id`, accepted event type/version, status and `available_at`;
- claim sets owner, random token, lease expiry and increments attempt count under row lock/skip-locked or equivalent atomic SQL accepted by DBA review;
- renew, acknowledge and fail use owner+token+unexpired-lease CAS;
- lease expiry reaper changes only that subscriber's delivery;
- errors are sanitized and bounded; secrets, authorization headers, payload dumps and Provider bodies are forbidden;
- maximum attempts and backoff are subscription-policy values within platform hard bounds;
- `delivered` means that one subscriber durably committed its idempotent target effect, not that all subscribers completed.

## 9. At-least-once and subscriber idempotency

The guarantee is **at-least-once delivery**. A lease may expire after the subscriber commits its target effect but before delivery acknowledgement.

Every subscriber therefore must use one of:

1. a durable inbox with unique `(subscriber_id, event_id)` committed in the same transaction as its side effect; or
2. a target-table unique key containing `(subscriber_id, event_id)` where the insert/update itself is the idempotency boundary.

Process memory, Redis-only locks, timestamps, “already seen” caches, or source `published` are not acceptable deduplication mechanisms.

Replay does not bypass this key. A normal replay re-enqueues or re-attempts the same canonical subscriber/event delivery, proves idempotency and records a no-op when already applied; it does not create a second live delivery row. A destructive projection rebuild must use a separately approved subscriber identity plus projection generation/target namespace and later atomic read cutover; it may not masquerade as ordinary replay.

## 10. Ordering

The maximum future ordering promise is:

`city_code + aggregate_type + aggregate_id + aggregate_version/sequence`.

- There is no cross-city, cross-aggregate, or platform-global order.
- Parallelism is permitted across different aggregate keys.
- A subscriber requiring order must not apply sequence `n+1` before `n`; it parks/retries and triggers gap reconciliation.
- Duplicate sequence with different payload hash is a fail-closed contract violation.
- Current events mostly have no explicit schema version or aggregate sequence. They are cataloged as implicit v0 and cannot provide stronger ordering. `created_at,event_id` is a scan cursor, not a business-order guarantee.
- Future producer changes must add explicit envelope metadata through the contract-first path before an ordered subscriber relies on it.

## 11. Retry, DLQ, reaper and manual retry

- Retry uses bounded exponential backoff plus optional jitter within accepted limits.
- Non-retryable schema/PII/authorization failures fail closed to DLQ immediately or after the policy's bounded attempts.
- Reaper operates by city/subscriber and expired lease; it never touches source rows or other subscriber deliveries.
- DLQ entries retain sanitized error classification and attempt references, not raw payload duplication.
- Manual retry requires city-scoped admin/operator authority, reason, ticket/change reference, expected delivery version, and append-only audit.
- A subscriber may be paused without pausing others. A poison event in one subscriber does not block another subscriber or the existing Dispatch/Ledger path.

## 12. Replay generation

A replay request must specify:

- requesting actor, city, subscriber, event types and accepted versions;
- bounded event-ID/time/aggregate range and maximum row count;
- purpose, dry-run count/hash, approval reference and expiry;
- target projection generation if this is a rebuild;
- start/end status, counts, failures, cancellation and audit timestamps.

Replay generations select and audit existing canonical subscriber/event deliveries. They may reset an eligible delivery for a new attempt under CAS or record an already-applied no-op, but they do not bypass unique `(subscriber_id,event_id)`. Projection rebuild uses a separately approved subscriber/target generation. Live and replay claim limits are isolated so replay cannot starve live processing. Cancellation stops new replay claims but retains completed effects and all audit evidence.

## 13. Retention, purge and FK lifecycle

- Source-event retention is decided by the Producer and Privacy owner. Before subscription activation they must approve that the retained source horizon covers low-latency materialization, periodic anti-join reconciliation, commit-skew/long-transaction overlap and incident recovery.
- Platform delivery cannot unilaterally extend source PII retention. If the approved source retention cannot cover those windows, the subscription is rejected or must use a separately approved controlled tombstone/redaction plus reconciliation contract that preserves only the minimum non-PII identity/hash needed to prove completeness.
- Live delivery rows remain through terminal processing, reconciliation and the approved incident window. Attempts and manual/replay audit have independent, explicitly approved retention and legal-hold policies.
- Payload duplication is avoided: delivery rows reference `(city_code,event_id)` and store only routing/version/hash metadata.

A source event is purge-eligible only when **all** of the following hold:

1. the source work-claim lifecycle is terminal; `pending`, `processing` and `retry_wait` block purge, and unresolved source `dead_letter` also blocks purge;
2. every eligible Phase 19 Enterprise Webhook subscription has materialized its delivery and every such delivery is terminal; unresolved enterprise DLQ blocks purge;
3. every eligible platform subscription has a canonical delivery, every delivery is terminal, and anti-join reconciliation reports no missing row;
4. no unresolved platform DLQ, active/approved replay, materialization gap, incident freeze or legal hold covers the event;
5. no source-domain, enterprise or platform FK dependency still requires the row;
6. Producer/Privacy retention has expired and any required redaction/tombstone policy has completed.

Cleanup order is dependency-aware and never cascades audit evidence:

1. resolve legal holds, DLQs, replays and reconciliation gaps; apply approved payload redaction/tombstone before physical deletion where required;
2. after their own retention, purge non-held operational attempt rows; `attempt → delivery` uses `ON DELETE RESTRICT/NO ACTION`, so attempts are handled before delivery;
3. after delivery retention and reconciliation proof, purge terminal platform and Enterprise delivery rows; `delivery → source` and subscription/city FKs use `ON DELETE RESTRICT/NO ACTION`;
4. only then may the Producer purge the source row if all source-domain FKs permit it;
5. append-only manual-action, replay and audit records are retained independently and deleted last, if ever, by their audit/legal policy. They must not use `ON DELETE CASCADE`; they retain copied immutable identifiers/hashes and use either no destructive FK or a nullable `SET NULL` linkage that preserves the audit row.

Exact durations, legal-hold owners, payload redaction fields, tombstone schema, unresolved-DLQ disposition and whether physical deletion is ever allowed remain human decisions. No automatic purge is authorized by this ADR.

## 14. Source `published` semantics

After this design, source `event_outbox.status='published'` continues to mean only:

> the source row's existing work-claim consumer acknowledged its current source-queue responsibility.

It must never mean:

- every platform subscriber received or applied the event;
- Notification/Risk/Analytics completed;
- Enterprise Webhook completed;
- the event is safe to purge only after reconciliation, retention, legal-hold, and FK-dependency checks.

Subscriber completion is read exclusively from the per-subscriber delivery ledger.

## 15. New-subscriber and failure isolation

- Registering or backfilling a new subscriber does not reset or clone the source row's status.
- Its failures, retries, DLQ, pause, replay and retention do not change Dispatch, Ledger, Enterprise Webhook, or any other subscriber.
- Platform materializer failure delays creation of new delivery rows but does not block source producers or existing typed consumers; lag/gap alerts must expose that delay.
- A subscriber kill switch pauses only its claims. Protected-domain zero-write gates remain in force.

## 16. Design-level `054+` schema plan — no SQL

The following names and migration numbers are reservations for review, not approved schema.

| Proposed migration | Table | Key fields | Required indexes/constraints |
| --- | --- | --- | --- |
| `054` | `platform_event_subscribers` | subscriber ID, owner domain, handler revision, purpose, max PII, status, policy bounds, audit fields | PK subscriber; unique stable owner/name; status/policy checks |
| `054` | `platform_event_subscriptions` | subscription ID, subscriber ID, real city, event type, exact event major version, live start boundary, status, retention class | unique `(city_code,subscriber_id,event_type,event_major_version)`; city FK; subscriber FK; materialization lookup |
| `054` | `platform_event_materialization_checkpoints` | city, subscription ID, last candidate created time/event ID, last reconciliation range/result, version | unique city+subscription; composite subscription FK; candidate cursor index; explicitly non-authoritative for completeness |
| `054` | `platform_event_deliveries` | delivery ID, city, subscriber/subscription, source event ID, event major version/hash, aggregate/sequence, status, lease, attempts, availability, error class, row version | unique `(subscriber_id,event_id)`; composite FK to source `(city_code,event_id)` and exact-version subscription; anti-join, typed claim, lease-reaper, DLQ and aggregate-order indexes; source FK `RESTRICT/NO ACTION` |
| `054` | `platform_event_delivery_attempts` | attempt ID, city, delivery ID, attempt number, claimant, start/end, outcome, sanitized error, trace | unique city+delivery+attempt; composite delivery FK; incident/time lookup |
| `054` | `platform_event_replay_generations` | generation ID, city, subscriber, filters, dry-run counts/hash, approval, status, requester, timestamps | unique generation; city/subscriber/status indexes; bounded-filter validation |
| `054` | `platform_event_delivery_actions` | action ID, city, copied delivery/event/subscriber/replay identifiers and hashes, optional nullable live linkage, action, actor, reason, expected row version, timestamp | append-only; no cascade-delete FK; any live linkage uses `RESTRICT`/`NO ACTION`; actor/time index |

Composite city FKs are mandatory for all business-scoped relationships. `platform_event_deliveries` references the existing unique source key `(city_code,event_id)` added by Phase 19; it does not introduce a second source-event writer.

Backfill plan:

1. create empty platform tables only after migration approval;
2. register subscribers as paused;
3. dry-run count and payload-classification validation by city/type/version;
4. establish explicit candidate cursor and retained reconciliation horizon at deployment cutover;
5. activate candidate materialization plus repeated anti-join reconciliation and verify commit-skew/gap/duplicate evidence;
6. request bounded historical replay only where product/privacy owners approve it;
7. activate one subscriber at a time after idempotency and protected-domain gates pass.

Compatibility and rollback:

- existing source consumers and reads remain unchanged throughout initial rollout;
- new subscribers read only delivery tables; no dual acknowledgement exists;
- rollback pauses subscriber/materializer, reverts derived reads to the old path, and preserves all ledger/audit rows;
- no down migration deletes evidence or modifies migrations `000`–`053`;
- if materialization is incomplete, resume candidate scanning and run retained-source anti-join reconciliation; cursor/checkpoint alone never closes the gap and source status is never rewritten.

## 17. Consequences and approved deferred decisions

Positive consequences:

- subscriber isolation and truthful completion semantics;
- incremental adoption with current infrastructure;
- auditable retries/replays and database-enforced idempotency boundaries;
- no coupling of producer transactions to future consumers.

Negative consequences:

- more MySQL tables and operational load;
- platform materializer becomes a critical monitored component;
- implicit-v0 events need compatibility handling and may not support ordered projections;
- retention and replay require disciplined human governance.

Human acceptance of Option A and the D2/E2/F2 PASS reviews closes the Phase26 design decision. The following values are explicitly approved as **deferred decisions**, not as implemented capability:

1. exact source/delivery/attempt/audit retention, purge, legal-hold, PII redaction/tombstone and physical-deletion policy — Producer, Privacy, Legal, Audit and Operations owners; rechecked before every affected Phase 27–31 subscription or data lifecycle is activated;
2. initial subscriber/event/exact-major-version/PII allowlist and any historical boundary — Producer, Privacy and the subscriber domain owner; required at the corresponding Phase 27–31 entry Gate before registration or activation;
3. Notification product/channel rules — Notification/Product/Privacy/Security owners; Phase 27 entry Gate;
4. Marketing campaign/eligibility/money rules, including the `Campaign.discountRuleId` replacement or deprecation path — Marketing/Product/Finance/Privacy owners; Phase 29 entry Gate;
5. Risk-Control rules, case policy, permissions and zero-action boundary — Risk/Security/Legal/Privacy owners; Phase 30 entry Gate;
6. Analytics/BI metric, cohort, freshness, access and Dashboard product rules — Analytics/Product/Data Governance/Privacy/Finance owners; Phase 31 entry Gate.

Deferral is not authorization. Until the applicable values are independently confirmed, the corresponding subscription or Provider must remain inactive and no implementation may infer production readiness. Phase 27–31 entry must recheck every relevant deferred decision. A material change to this ADR, the event catalog or the migration ledger reopens the affected G2/G5 review and impacted test-matrix rows.
