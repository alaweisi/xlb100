# Phase 26 Platform Foundation Design Report

> **Phase26 design status:** **ACCEPTED — DESIGN ONLY**. D2/E2/F2: **PASS**. Runtime: **NOT AUTHORIZED**. Migration `054+`: **NOT AUTHORIZED**.

## 1. Session Sync

| Item | Observed fact |
| --- | --- |
| Repository | `G:\xlb100` |
| Branch | `main` |
| HEAD | `0ce4ed8 docs: correct Phase 25 lock metadata` |
| Phase 25 tag query | `xlb-phase25-ui-standardization-v1.0` points at the queried locked state |
| Working tree at final acceptance window entry | exactly the five authorized Phase26 design drafts are untracked; no other dirty file |
| Remote relation | local `main` ahead of `origin/main` by 41 commits |
| Current phase truth | Phase 25 LOCKED; `CURRENT_STATE.md` explicitly says no Phase 26 work is included in that Lock |
| Phase 14 truth | `CURRENT_STATE.md` retains Phase 14 readiness diagnostics at 64/100 and IN PROGRESS; the historical readiness report is NO-GO |
| Write mode | `WRITE_PHASE0`, limited to the five named Phase 26 documents |

The final human acceptance record approves Option A and accepts the D2/E2/F2 focused re-review results as PASS. This acceptance closes Phase26 design review only. It does not supersede current Git/source facts, production-readiness blockers, Provider absence, or the separate Phase 27–31 implementation entry Gates.

## 2. Skills and factual sources

Startup order completed:

1. `xlb-session-sync`
2. `xlb-context-map` plus its `reference.md`
3. `xlb-current-vs-target`
4. `xlb-phase-boundary`

Primary sources inspected:

- `AGENTS.md`, `docs/CURRENT_STATE.md`, mandatory architecture rules;
- `docs/reports/XLB100_PLATFORM_CAPABILITY_CONSTRUCTION_PLAN.md` and `XLB100_PHASE_PROMPT_PACK.md`;
- current Events/Outbox implementation and migration `044`;
- Dispatch and Ledger claim/ack consumers;
- Enterprise Webhook subscriber/delivery implementation and migrations `037`/`038` as a local reference only;
- Review service, type contract and migration `030`;
- Pricing, Order quote snapshot and Payment paths;
- Support producers, Security, Audit, Compliance, governance, Observability and Providers;
- Phase 25 Campaign/theme, OA readiness and Dashboard readiness evidence;
- the historical Phase 14 readiness and production-gap reports.

Fact priority was Git + `CURRENT_STATE` + source code, then historical reports, then prompt/session context.

## 3. Scope delivered

Only these files were created:

1. `docs/architecture/26_XLB_PLATFORM_FOUNDATION.md`
2. `docs/architecture/26_XLB_EVENT_DELIVERY_ADR.md`
3. `docs/contracts/CONTRACT_PLATFORM_EVENT_CATALOG.md`
4. `docs/architecture/26_XLB_PLATFORM_DOMAIN_OWNERSHIP.md`
5. `docs/reports/PHASE26_PLATFORM_FOUNDATION_DESIGN_REPORT.md`

No backend/app/package/test/infra/deploy/migration file, `CURRENT_STATE`, phase registry, tag or Git state was changed.

## 4. Main architecture conclusion

The current source Outbox has one shared work-claim lifecycle/completion state per row. At any instant it permits at most one active lease; failure or lease expiry can lead to multiple sequential retry claims, and competing workers remain one consumer responsibility rather than independent subscribers. Dispatch and Ledger consume different typed events, but the mechanism cannot support multiple independent consumers for the same event. Source `published` is not and must not become “all subscribers completed.”

ADR-26-01 accepts for Phase26 design an **additive MySQL per-subscriber delivery ledger**:

- business domains continue to own and transactionally insert source events;
- existing Dispatch/Ledger and enterprise-local Webhook behavior stays isolated;
- a future platform materializer reads source rows without claiming or updating them; cursor scans are optimization only, while retained-source anti-join reconciliation supplies completeness across commit skew and long transactions;
- each registered subscriber gets an independently leased delivery row and attempt/DLQ/replay audit;
- subscribers provide durable `(subscriber_id,event_id)` idempotency;
- only per-city/per-aggregate explicit sequence ordering may be promised;
- a subscriber's pause/failure/DLQ/replay never changes another subscriber or the source row.

The ADR is **Accepted for Phase26 design**, but it is not implemented. Existing Outbox, Dispatch, Ledger and Enterprise Webhook behavior is unchanged; Phase27 runtime and migration `054+` remain unauthorized.

ADR §5.1 now contains the required three-layer semantic table comparing source `event_outbox`, Phase 19 Enterprise Webhook delivery and proposed platform delivery across owner, claim/ack, retry, DLQ, replay, retention, FK and audit boundaries.

### 4.1 Window D/E/F revision record

| Review item | Revised location |
| --- | --- |
| Materialization no-gap correction | ADR §§7, 9, 12, 16; Foundation §§7.5–7.7; this report §§6.1, 7–8 |
| Retention/purge/FK lifecycle | ADR §13; Foundation §7.4; Catalog §1.3; this report §6.7 and retention Gate |
| Source Outbox terminology | ADR §1 and §5.1; Catalog §6; this report §4 |
| Exact major-version subscription | ADR §6/§16; Catalog §§1.1/5; this report §§6.1, 7–8 |
| G6 tightening/reopen rule | Foundation §8; this report §5 |
| Phase 28 composite-city compatibility | Domain Ownership §3.7; this report §§6.3 and 8 |
| Phase 29 Campaign field isolation | Domain Ownership §§4.1/4.7; Foundation §4; this report §§6.4, 8 and 10 |
| Three-layer semantic table | ADR §5.1 |

Human focused-review acceptance: **D2 PASS, E2 PASS, F2 PASS**. These PASS results accept the corrected design evidence; they do not authorize schema or runtime construction.

## 5. Phase 26 G0–G6 acceptance table

| Gate | Status at this delivery | Evidence / remaining acceptance |
| --- | --- | --- |
| G0 — Baseline and scope | **PASS** | Locked Phase 25 fact, actual source inventory and five-file write allowlist recorded; no runtime write |
| G1 — Delivery ADR | **PASS** | Human accepted Option A for Phase26 design; existing Outbox/Dispatch/Ledger/Enterprise Webhook unchanged |
| G2 — Event catalog | **PASS WITH APPROVED DEFERRED DECISIONS** | Exact retention/redaction and initial subscriber allowlists are deferred to affected Phase entry Gates with named owners |
| G3 — Domain ownership | **PASS WITH APPROVED DEFERRED DECISIONS** | Ownership boundaries accepted; Notification/Marketing/Risk/BI product rules are deferred to Phase 27/29/30/31 entry respectively |
| G4 — Privacy and operations | **PASS WITH APPROVED DEFERRED DECISIONS** | Exact retention, legal hold, PII redaction/tombstone and activation policy require independent owner confirmation before use |
| G5 — `054+` migration/compatibility ledger | **PASS (design review)** | D2/E2/F2 focused review accepted; ledger is design evidence only and migration `054+` is not authorized |
| G6 — Cross-domain verification and final acceptance | **PASS — DESIGN ONLY** | G1–G5 are signed off or covered by the explicit human-approved deferrals in §10; test matrix remains future implementation evidence |

G6 records Phase26 design acceptance only. Deferral does not authorize an affected subscriber or Provider: it remains inactive until its exact retention, legal-hold, redaction, allowlist and product prerequisites are confirmed. Every Phase 27–31 entry rechecks its relevant deferred decisions. A material ADR, event-catalog or migration-ledger change automatically reopens affected G2 and/or G5 review and every impacted test-matrix row. Phase 27 runtime remains forbidden until a separate implementation authorization is issued.

## 6. `054+` migration design ledger — no SQL

Names and numbers are proposed reservations only. Formal entry may rename/re-number them; locked migrations `000`–`053` remain immutable.

### 6.1 Proposed `054` — platform event delivery foundation

| Table | Field-level design | Indexes, unique keys and FKs | Backfill / compatible read / rollback |
| --- | --- | --- | --- |
| `platform_event_subscribers` | `subscriber_id`, stable name, owner domain/team/contact, handler revision, purpose, max PII class, default lease/retry/max attempts/concurrency, status, created/updated actor/time, row version | PK ID; unique owner+stable name; status/policy checks | Empty create; registrations start proposed/paused. Existing consumers ignore. Rollback pauses; retain audit rows. |
| `platform_event_subscriptions` | `subscription_id`, subscriber ID, real `city_code`, event type, exact event major version, live start boundary, retention class, status, created/updated actor/time, row version | executable unique `(city_code,subscriber_id,event_type,event_major_version)`; subscriber/city FKs; active materialization index; no version ranges | New major version creates a new paused row. Pause stops live work; exact-version replay needs explicit approval; revoke stops live/replay. Existing source reads unchanged. |
| `platform_event_materialization_checkpoints` | city, subscription ID, last candidate created-at/event ID, last scan time/count, last reconciliation range/count/hash/result, row version | unique city+subscription; composite subscription FK; cursor/reconciliation indexes; cursor explicitly non-authoritative | Initialize only as candidate-scan optimization. `created_at` is not commit sequence; retained anti-join reconciliation must close commit-skew gaps. Rollback freezes candidate scan and preserves reconciliation evidence. |
| `platform_event_deliveries` | delivery ID, city, subscriber/subscription, source event ID, event type/major version/payload hash, aggregate type/ID/version/sequence, status, available-at, lease owner/token/expiry, attempt/max attempts, last error code/time, delivered/dead-letter time, row version, timestamps | unique `(subscriber_id,event_id)`; composite source FK `(city_code,event_id)` and exact-version subscription FK; anti-join, typed claim, lease reaper, DLQ and aggregate-order indexes; source FK `RESTRICT/NO ACTION` | Candidate materialization plus repeated retained-source anti-join; no source update. Ordinary replay reuses the row. Projection rebuild uses separately approved subscriber/target generation. |
| `platform_event_delivery_attempts` | attempt ID, city, delivery ID, attempt number, owner/token hash/reference, started/finished time, outcome, sanitized error code/message, trace/correlation ID | unique city+delivery+attempt; composite delivery FK with `RESTRICT/NO ACTION`; outcome/time index | No payload copy. Purge only after attempt retention/hold approval and before delivery; rollback retains held/audit evidence. |
| `platform_event_replay_generations` | generation ID, city, subscriber, event type/exact major version/aggregate/time/event-ID filters, row cap, purpose, dry-run count/hash, approval ref, requested/approved actor, status, start/end/cancel times, result counts | PK; city+subscriber+status/time indexes; bounded-filter/status checks; subscriber FK | Created only after dry run/approval. Separate live/replay quotas. Cancel stops new claims; completed evidence retained. |
| `platform_event_delivery_actions` | action ID, city, copied delivery/event/subscriber/replay identifiers and hashes, optional nullable live FK, action kind, actor/service ID, reason/change ticket, expected/actual row version, trace, created time | append-only PK; no cascade-delete FK; actor/time indexes | Records manual retry, pause, reaper and cancellation. Audit retention is independent; delete last, if ever. |

The source FK uses the existing unique `(city_code,event_id)` introduced in migration `037`; no second source-event writer is created.

### 6.2 Proposed `055` — Notification in-app MVP

| Table group | Field-level design | Required integrity | Backfill / read / rollback |
| --- | --- | --- | --- |
| Templates/revisions | template ID/key, owner policy, city/global-control classification, channel=`in_app`, immutable revision, locale, parameter schema/PII ceiling, content hash/body, review/publish/retire actors/times | unique template key+scope; one active revision pointer; revision immutability; no arbitrary HTML/script | Start with explicitly approved templates; no historical rendering. Roll back active pointer. |
| Preferences | city, recipient type/ID, policy/template class, enabled/override source, version, actor/time | unique city+recipient+class; real-city FK where applicable; CAS index | Default policy applies until explicit preference. Rollback to previous version; audit retained. |
| Notification records | notification ID, city, recipient, source event, template revision, minimal render parameters/hash, visibility, created/hidden/archived times, row version | unique city+recipient+source event+template revision; subscriber inbox `(subscriber,event)`; recipient list index | No bulk fake backfill. New approved events only; bounded historical backfill separately approved. Pause subscriber/read previous records on rollback. |
| Read state | city, notification, recipient, read/archive flags/times, version | unique city+notification+recipient; composite recipient/notification FK; CAS | No default “read” backfill. Idempotent state changes. |
| Channel intent/attempt | channel intent ID, notification, channel, provider config ref, truthful status, attempt/error/audit fields | no delivered state without truthful provider envelope; unique notification+channel+intent revision | External rows remain `not_configured`/`unavailable`; Phase 27 does not install Providers. |

### 6.3 Proposed `056` — Review/Reputation evolution

| Table group | Field-level design | Required integrity | Backfill / read / rollback |
| --- | --- | --- | --- |
| Review sidecars | reply ID/review/city/author/version/visibility/content; moderation decision ID/review/from-to/reason/actor/version; appeal ID/review/subject/status/reason/decision/version | composite city+review FKs; one accepted decision per expected version; reply/appeal idempotency keys | Existing `order_reviews` unchanged. Sidecars start empty. Compatibility reads default to current `created` review. |
| Reputation projection generations | generation ID, city, metric/revision/status, source watermark/count/hash, build/validate/cutover times | unique city+generation; one current pointer after validation | Initial generation computes from existing reviews only after privacy/product approval. Rollback pointer to previous complete generation. |
| Worker reputation aggregates/contributions | city, worker, generation, window/dimensions, counts/sums/bands, source review/event, visibility, revision | unique city+worker+generation+window; contribution unique subscriber+event/review; worker city FK | No Worker profile update. Dual-read behind approved API; disable projection on rollback. |

`review.created` must be added transactionally to the existing Review writer in Phase 28. No second rating writer is permitted. Migration `030_order_review_mvp.sql` remains immutable. Phase 28 entry must audit composite city unique keys on the `orders`, `worker_profiles` and `fulfillments` parents referenced by `order_reviews`; if hardening is needed, only a new append-only migration may add parent composite unique keys and composite-city FKs after existing-data/replay validation. Existing service-layer city, ownership and paid/completed guards remain required.

### 6.4 Proposed `057` — Marketing/Coupon

| Table group | Field-level design | Required integrity | Backfill / read / rollback |
| --- | --- | --- | --- |
| Marketing campaigns/rules | business campaign ID, city, immutable revision, status, schedule, scope/priority, rule JSON under strict schema, review/publish actors/times | unique city+campaign+revision; one accepted active revision per conflict policy; real-city FK | No reuse/backfill from Phase 25 visual `Campaign`. Rollback pauses active revision. |
| Coupon definitions/grants | definition/revision, city, inventory policy; grant ID, recipient, status, issued/expiry/revoke facts, version | policy-defined grant uniqueness; city/recipient scope; CAS; no negative inventory | Existing customers get no invented grants. Import requires separate approved source. |
| Reservations/redemptions | reservation ID, grant, quote/order refs, rule revision, amount/currency, expiry/status/version; redemption/release/compensation refs | one active reservation per accepted key; one redemption per reservation; composite city FKs | No Order/Payment mutation. Cancellation/refund compensation follows accepted product policy. Rollback releases only uncommitted eligible reservations. |
| Discount decisions | decision ID, city/customer/SKU/quantity/request hash, rule revisions, base/discount/final amounts, currency, reason, expiry, status/version | unique normalized request hash+revision; positive/rounding/check constraints; quote validates exact fingerprint | No historical quote rewrite. Expire/disable new decisions on rollback. |

Current `Campaign.discountRuleId` is a Phase 25 non-authoritative, non-executable visual compatibility field. It cannot identify a Marketing campaign/rule/coupon, prove eligibility or supply an amount. Phase 29 cannot start until a human approves its deprecation/removal or replacement by a separately versioned Marketing-to-Quote contract.

### 6.5 Proposed `058` — Risk-Control manual-review MVP

| Table group | Field-level design | Required integrity | Backfill / read / rollback |
| --- | --- | --- | --- |
| Rules/revisions | rule ID, city/control scope, immutable revision, accepted inputs/event versions, reason codes, thresholds, PII ceiling, review/activation actors/times/status | unique rule+revision; one active pointer; strict schema; no action fields that mutate protected domains | Start inactive; no silent historical evaluation. Rollback active pointer/pause subscriber. |
| Signals | signal ID, city, source event, subject type/ID, rule revision, severity/band, reason codes, evidence refs/hash, supersedes ID, created time | unique event+rule revision+subject/fingerprint; append-only; composite source FK | Bounded replay creates linked superseding signals, not updates. |
| Cases/reviews | case ID, city, subject, source signals, status/assignee/version; decision ID, outcome/reason/actor/time; appeal refs if approved | CAS assignment/decision; policy-defined case grouping uniqueness; admin city FK/scope | No automatic source-domain action. Rollback pauses new cases; retain decisions. |
| Evidence/handoffs | evidence ref ID/source owner/classification/expiry/hash; Support handoff request/result refs | references only; no raw payload; Support writes its own ticket | Revoke access without deleting source. Support handoff through canonical API only. |

### 6.6 Proposed `059` — Analytics/BI read models

| Table group | Field-level design | Required integrity | Backfill / read / rollback |
| --- | --- | --- | --- |
| Metric definitions/revisions | metric ID, owner/source, immutable formula revision, unit, dimensions, window, timezone, freshness/stale thresholds, PII/access class, status/actors/times | unique metric+revision; one active pointer; bounded dimensions; formula/source-owner approval | No metric without owner acceptance. Rollback definition pointer. |
| Projection generations/watermarks | generation ID, city, metric revision, source range/watermark, status, row count/hash, build/validate/cutover times | unique city+metric+generation; one current pointer; source/version compatibility | Backfill one city/metric/window with dry-run/reconciliation. Dual-read/cutover only after validation. |
| Aggregate buckets/contributions | city, metric revision/generation, window start/end/timezone, approved dimension keys, value/count, observed/generated time, freshness, bucket revision; source contribution key where incremental | unique city+metric+generation+window+dimensions; contribution `(subscriber,event)`; CAS bucket revision | Rebuild new generation, never source write. Rollback read pointer. Low-cell suppression before serving. |

No warehouse, ETL, Dashboard runtime, realtime transport or fake data is authorized by this ledger.

### 6.7 Unified retention, purge and FK plan

- Producer/Privacy owners decide source-event retention and must approve a horizon that covers candidate materialization, anti-join reconciliation, long-transaction commit skew and incident recovery before subscription activation.
- Platform cannot extend source PII retention unilaterally. Insufficient coverage rejects the subscription unless a controlled minimum-data tombstone/redaction and reconciliation contract is separately approved.
- Purge is blocked by non-terminal source work claim; missing/non-terminal eligible Enterprise Webhook delivery; missing/non-terminal platform delivery; unresolved source/enterprise/platform DLQ; active replay; reconciliation gap; legal hold; or any FK dependency.
- After each applicable retention expires and holds are released, cleanup order is operational attempts first, then terminal Enterprise/platform deliveries, then the Producer-owned source event, and independent audit last if its own legal policy permits. Delivery→source and attempt→delivery use `RESTRICT/NO ACTION`. Audit never uses `ON DELETE CASCADE`; copied IDs/hashes survive any nullable unlink.
- Exact source/delivery/attempt/audit durations, legal-hold ownership, redaction fields, tombstone schema, DLQ disposition and physical-deletion policy remain human decisions. No purge implementation is authorized.

## 7. `054` rollout and backfill sequence

1. Future implementation creates empty tables with subscribers paused.
2. Verify schema, composite city FKs, uniqueness, partial/re-execution behavior and migration rollback runbook.
3. Register exact city/type/**major-version**/PII rows with an explicit candidate cursor and Producer/Privacy-approved retained reconciliation horizon.
4. Dry-run candidate materialization plus retained-source anti-join counts/hash; verify no source update and no range-based version uniqueness.
5. Activate candidate scans and repeated reconciliation for one subscriber at a time with bounded concurrency.
6. Verify commit skew, long transactions, repeated reconciliation, missing-delivery repair, duplicate, lease, retry/DLQ and protected-domain zero-write evidence.
7. Historical replay is a separate city/type/exact-major/time/event-bounded approval that reuses canonical `(subscriber_id,event_id)`; projection rebuild requires a separate subscriber/target generation.
8. Rollback pauses claimant/materializer and reverts derived read pointer; evidence is preserved and source rows remain unchanged.

## 8. Cross-domain Gate/Test matrix

| Gate | Required scenario | Pass condition | Earliest owner phase |
| --- | --- | --- | --- |
| Consumer isolation | Same source event delivered to two test subscribers; one succeeds, one fails/DLQs | Independent status/lease/attempt; source/other subscriber unchanged | 27 |
| Existing consumer isolation | New subscriber observes event also used by Dispatch/Ledger | Dispatch/Ledger behavior and source acknowledgement unchanged | 27 |
| City denial | Claim/read/write with mismatched/missing/`__global__` business city | Fail closed; zero rows leaked/written | 27–31 |
| Role denial | Customer/worker cross-user; admin outside city; auditor mutation | 403/contract denial; audited where required | 27–31 |
| Lease expiry/CAS | Worker commits late or loses token; reaper races renew/ack | Exactly one valid CAS transition; expired owner cannot ack | 27 |
| Duplicate delivery | Same event processed concurrently/replayed | One target effect via `(subscriber_id,event_id)`; repeats are audited no-op | 27–31 |
| Commit-skew cursor | Materializer advances past timestamp T while a transaction with `created_at<T` commits later | Cursor scan may miss initially; retained-source anti-join creates the missing delivery and completeness stays open until reconciliation passes | 27 |
| Long producer transaction | Event inserted, transaction held across multiple candidate scans, then committed | No exactly-once/global-order claim; later reconciliation discovers and materializes it once | 27 |
| Repeated reconciliation | Run identical anti-join concurrently and repeatedly over the retained horizon | Unique `(subscriber_id,event_id)` yields one canonical delivery and stable counts | 27 |
| Missing-delivery repair | Deliberately remove/omit a delivery while retaining its eligible source event | Reconciliation detects exact subscriber/event/city gap, restores delivery and records repair evidence | 27 |
| Ordering/gap | Sequence `n+1` before `n`, duplicate sequence/hash conflict | Park/reconcile; no out-of-order effect; conflict fail closed | 28–31 where sequence exists |
| Unknown version | Known event type with unsupported/invalid payload | No handler side effect; contract DLQ/error; no default parse | 27–31 |
| DLQ | Retryable and non-retryable poison events | Bounded attempts, sanitized error, subscriber-only DLQ | 27 |
| Manual retry | Authorized and unauthorized retry; stale expected version | Only authorized city-scoped action succeeds; append-only audit | 27 |
| Replay | Dry-run, bounded replay, cancellation, already-applied event, rebuild generation | Live traffic not starved; ordinary replay no duplicate effect; rebuild isolated | 27–31 |
| Materializer crash/gap | Crash before/after candidate checkpoint or delivery commit | Cursor is not treated as proof; anti-join reconciliation restores every retained eligible missing delivery; source remains unmodified | 27 |
| PII minimization | Payload/event/delivery/attempt scan for forbidden fields | No contact/content/location/secret/provider body; allowlist/ceiling enforced | 27–31 |
| Exact-major allowlist | Add overlapping/range subscription, new major, pause, revoke and historical replay | Range rejected; one exact-major row per executable key; pause/revoke/replay semantics enforced | 27 |
| Retention/purge/FK | Exercise non-terminal source, unmaterialized/non-terminal Enterprise delivery, missing/non-terminal platform delivery, DLQ, replay, hold and FK dependency | Every blocker prevents source purge; cleanup order and `RESTRICT/NO ACTION` hold; audit never cascades | Later approved ops gate |
| Provider truthfulness | SMS/Push/WeChat/Email absent; configured/unconfigured paths | Only `not_configured`/`unavailable`; no fake delivered state or call | 27 |
| Review single writer | Existing create plus duplicate/concurrent request | One `order_reviews` row; no second writer/table | 28 |
| Review composite-city compatibility | Audit `order_reviews` parent unique keys/FKs and cross-city negative fixtures | Migration `030` unchanged; service guard retained; any needed hardening is append-only and rejects cross-city reference | 28 |
| Marketing money boundary | Discount decision mismatch/expiry; malicious direct write attempt | Quote rejects; Pricing/Order/Payment protected | 29 |
| Campaign compatibility-field isolation | Attempt to use `Campaign.discountRuleId` as rule, eligibility or amount input | Fail closed; no Marketing/Quote path reads it; human-approved deprecation/replacement recorded before Phase 29 | 29 |
| Risk zero action | Rule/case attempts freeze/cancel/deduct/dispatch/penalty | No such command/schema/import/write exists | 30 |
| BI privacy/cardinality | High-cardinality dimension/label and low-cell query | Rejected/suppressed; Prometheus labels unchanged | 31 |
| Freshness truth | delayed/failed projection and disconnected transport | stale/no-data/disconnected shown; no fabricated realtime | 31 |
| Protected-domain zero-write | DB write capture/allowlist across Order, Payment, Pricing, Worker, Dispatch, Fulfillment, Support, Ledger, Settlement | Only phase-owned tables and platform delivery acknowledgement are written | 27–31 |
| Migration replay | Empty, existing, partial-DDL and double-run cases | Deterministic accepted schema/marker, no historical migration change | each phase |
| Rollback/read compatibility | Pause subscriber, revert read pointer/version, resume | Source and old consumers remain functional; audit retained | each phase |

## 9. Serial Phase 27–31 dependency

```text
Phase 26 accepted — design only
  -> Phase 27 read-only discovery and entry design
  -> separately authorized Phase 27 Notification implementation + Lock
  -> Phase 28 Review/Reputation implementation + Lock
  -> Phase 29 Marketing implementation + Lock
  -> Phase 30 Risk-Control implementation + Lock
  -> Phase 31 Analytics/BI implementation + Lock
```

- After independent submission of the Phase26 design documents, only Phase27 read-only discovery and entry design may begin without a new runtime authorization.
- Runtime work, migrations, merge and Lock remain serial in the one approved worktree.
- Each phase branches from the predecessor's locked `main`, uses contract-first order, appends migrations only, and stops for explicit acceptance.
- A later phase cannot assume an unaccepted event/version, table, Provider, product rule or UI source.

## 10. Approved deferred decisions and blocking rules

The following are explicit human-approved deferrals. They pass Phase26 design review but remain hard blockers at the named implementation entry Gate:

| Deferred decision | Responsible owners | Mandatory recheck / blocking point |
| --- | --- | --- |
| Exact source/delivery/attempt/audit retention, purge, unresolved-DLQ disposition, legal hold, PII redaction/tombstone and physical deletion | Producer, Privacy, Legal, Audit, Operations; Finance where R2 applies | Every affected Phase 27–31 entry and before any subscription, purge job or Provider activation |
| Initial subscriber/event/exact-major-version/PII allowlist, live start boundary and historical scope | Producer, Privacy and receiving subscriber domain | Corresponding Phase 27–31 entry; no registration, activation, backfill or replay before confirmation |
| Notification recipients, templates, mandatory/optional classes, read/archive/content access and external-channel rules | Notification, Product, Privacy, Security/Compliance | Phase 27 entry; all subscriptions and Providers remain inactive until accepted |
| Marketing naming, `Campaign.discountRuleId` deprecation/replacement, eligibility, stacking, inventory, reservation, cancel/refund, abuse and money rules | Marketing, Product, Finance, Privacy | Phase 29 entry; no campaign, coupon, eligibility or amount execution before accepted |
| Risk rules/signals, case grouping, analyst permissions, explainability, appeal, retention and zero-action boundary | Risk, Security, Legal, Privacy | Phase 30 entry; no automatic protected-domain action is authorized |
| BI metric owners/formulas/cohorts/windows/timezone/freshness/access/minimum-cell/correction rules and Dashboard product/data/transport prerequisites | Analytics, Product, Data Governance, Privacy, Finance | Phase 31 entry; no BI API/Dashboard/realtime claim before accepted |

Review/Reputation moderation, reply, appeal and formula candidates are not silently covered by these deferrals. They remain outside the accepted Phase26 implementation scope and require an explicit Phase28 entry decision before any such feature is authorized. Phase28 must also execute the migration-030 composite-city compatibility audit while preserving the existing service-layer city guard.

Deferral is not implementation authority and does not establish a real Provider, production readiness, runtime module or executable contract. Phase 27–31 entry must re-evaluate the rows relevant to that Phase. Any material ADR, event-catalog or migration-ledger change reopens affected G2/G5 review and impacted test-matrix rows.

Production enablement remains independently blocked by the historical Phase14 readiness gap until its owner approves backup/restore, secrets, monitoring/alerting, rollback and external prerequisites. That standing production blocker is not waived by Phase26 design acceptance.

## 11. Final acceptance record

| Record | Final Phase26 value |
| --- | --- |
| Phase26 design status | **ACCEPTED — DESIGN ONLY** |
| D2/E2/F2 focused review | **PASS / PASS / PASS** |
| G0–G6 | **PASS at design level**, with G2/G3/G4 carrying the explicit §10 deferrals |
| Runtime status | **NOT AUTHORIZED** |
| Migration `054+` | **NOT AUTHORIZED** |
| Existing Outbox/Dispatch/Ledger/Enterprise Webhook | **UNCHANGED** |
| Next step | Independently submit these design documents; afterward only Phase27 read-only discovery and entry design may start |

No runtime, migration, API, page, realtime transport, data backfill, replay, mock business data, subscription, production capability, or Provider has been implemented or authorized. Direct Phase27 implementation is forbidden until a separate human implementation authorization is issued after its entry-Gate checks.
