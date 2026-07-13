# XLB100 Platform Capability Construction Plan

## Purpose and decision status

This is a read-only baseline reconciliation and construction plan based on the
locked Phase 25 `main` tree (`be9f569`) and the supplied missing-module prompt
collection. It does **not** enter Phase 26, authorize implementation, alter
the Phase registry, or create a business module.

The verified next formal phase is Phase 26. Its recommended scope is a
design-only platform-foundation phase; each later implementation phase still
requires its own entry authorization and human acceptance.

## Verified baseline

| Capability | Actual repository state | Decision |
| --- | --- | --- |
| Notification | No `backend/src/notification`, contract, API client, migration, or app inbox. `backend/src/providers` contains only truthful local/mock object storage. | Missing. Build after a platform event-subscriber design is accepted. |
| Rating / reputation | `backend/src/review` is a real customer order-review MVP: city-scoped, one review per paid/completed order, 1–5 rating and comment. | Partially implemented. Evolve the existing review contract; do not create a parallel rating writer before ownership/migration design. |
| Marketing | Phase 25 supplies visual Campaign/theme contracts only. There is no marketing backend, persistence, API, coupon, promotion, redemption, or discount calculation. `pricing` remains city/SKU base-price lookup. | Missing business domain. UI Campaign must not be treated as a marketing engine. |
| Risk control | `security` provides route rate limits; auth/context/city guards and settlement-only governance `riskFlags` exist. No general rules, events, cases, dispositions, or operations console exist. | Missing. Keep it separate from security, audit, compliance, and settlement governance. |
| Analytics / BI | Observability exposes bounded HTTP metrics. Support quality and settlement provide domain-specific summaries. `apps/dashboard` has no `src` or runtime. | Missing cross-domain BI. Existing summaries are sources, not a BI platform. |
| CMS | Support knowledge base and catalog service-standard content exist, but no general content/CMS domain exists. | Deferred; do not reuse Support KB as a public CMS without an explicit boundary. |
| Insurance, training, dedicated geo | No `insurance`, `training`, or `geo` module exists. Compliance/certification and LBS-lite dispatch already own their respective current concerns. | Deferred discovery only after the five core domains. |

## Architecture facts that govern every later phase

1. Contracts remain single-source: `@xlb/types` → `@xlb/validators` → backend
   module → `@xlb/api-client` → application. No app-local business types.
2. Every business table and API is city-scoped; new migrations append after
   locked `053` and must not modify historical migrations.
3. The existing `event_outbox` is a transactional, leased **work-claim**
   mechanism. Dispatch and ledger claim a typed event and acknowledge it as
   published. It is not yet a fan-out event bus: notification, risk, and BI
   cannot independently consume the same published row without an approved
   subscriber/delivery/checkpoint model.
4. Existing providers are only local/mock object storage. SMS, push, WeChat,
   email, map, payment, and other external-provider success states must not be
   inferred or fabricated.
5. Phase 25 makes OA and Dashboard explicitly readiness-blocked. Dashboard
   implementation requires an approved metric dictionary, read API, privacy
   scope, freshness semantics, and product source; it cannot begin with mock
   real-time numbers.

## Recommended delivery sequence

| Formal phase | Scope and exit | Dependencies / hard boundary |
| --- | --- | --- |
| **Phase 26** | Design-only platform foundation: five-domain ownership map, event fan-out decision, shared privacy/retention/idempotency rules, migration and contract plan, and gate index. | No runtime module, migration, route, app page, provider integration, or dashboard construction. |
| **Phase 27** | Notification MVP: approved subscriber/delivery model, in-app notification record/read state, order/support event integration, retry/audit tests. | No real SMS/push provider unless separately approved and truthfully enveloped. |
| **Phase 28** | Review-to-reputation evolution: preserve existing `order_reviews` behaviour, add approved dimensions/aggregation/moderation boundaries and worker display read model. | No duplicate `review`/`rating` writers; worker aggregate updates must use an event/read-model boundary. |
| **Phase 29** | Marketing coupon MVP: coupon eligibility, grant, quote-time discount result, reservation/redemption idempotency, Customer/Admin surfaces. | `pricing` stays base-price owner; marketing never mutates order totals directly or bypasses quote snapshots. |
| **Phase 30** | Risk-control MVP: configurable rules consuming approved event deliveries, immutable risk events/cases, Admin review queue and support handoff. | Observe/record/manual-review first; no autonomous fund, account, order, or worker punishment. |
| **Phase 31** | Analytics / BI MVP: governed metric dictionary and city/role-scoped read models, then a real read-only Dashboard for orders and worker activity. | No warehouse/ETL until justified; no mock or unbounded-cardinality metrics. |
| **Post-31 discovery** | Insurance, training, CMS, and geo specialization each receive independent Phase 0 discovery only. | No shared “miscellaneous platform” phase and no provider commitment without product approval. |

## Phase 26 design gates

Phase 26 should produce only the following reviewed artifacts before any Phase
27+ implementation branch is authorized:

1. A module ownership matrix covering Notification, Review/Reputation,
   Marketing, Risk Control, Analytics, Support, Pricing, Worker, Security,
   Audit, and Observability.
2. An event delivery design that explicitly chooses either durable per-subscriber
   deliveries/checkpoints or a different approved fan-out mechanism, including
   replay, ordering, lease, retry, dead-letter, and idempotency guarantees.
3. Five domain design documents defining city scope, actor/permission model,
   state transitions, ownership of data writes, public contracts, retention and
   privacy constraints, and rollback plans.
4. A field-level migration ledger beginning at `054` only after design approval;
   it must name indexes, city composite keys, foreign keys, backfill policy, and
   rollback/read compatibility. No migration is created in Phase 26.
5. A metric dictionary that distinguishes operational Prometheus metrics from
   business BI read models and forbids city/user/order identifiers as metric
   labels.
6. A cross-domain boundary test matrix: consumer isolation, city/role denial,
   duplicate delivery, provider truthfulness, idempotency, and protected-domain
   non-mutation.

## Domain construction constraints

### Notification

Start with the existing Outbox as the producer source, but do not let a
notification consumer acknowledge the producer row on behalf of Dispatch or
Ledger. The design must define template, preference, delivery, and read-state
ownership before channels. Customer/Worker notification-centre pages are a
later Phase 27 contract/API task; OA notification surfaces remain readiness
blocked until their own identity/workflow contract exists.

### Review and reputation

The current review service already enforces customer identity, matching city,
paid order, completed fulfillment, and one review per order. Phase 28 must
retain that invariant. It should first decide whether the existing public
`review` contract is extended compatibly or formally migrated; a second writer
or a direct write from review to worker tables is prohibited.

### Marketing

`Campaign` currently means Phase 25 visual presentation scope and permitted
theme/banner overlay. Business campaigns, coupons, eligibility, stock and
redemption require a separate, explicitly named domain model. The authoritative
order quote snapshot remains the money record; marketing supplies a validated
discount decision to the quote flow, not a direct order update.

### Risk control

Security remains responsible for technical controls such as rate limiting;
audit remains the audit trail; compliance remains qualification; support owns
ticket state. Risk Control owns business-risk detection and case lifecycle.
The first executable rule set may create an auditable manual-review case only;
automatic freeze/punishment requires a later explicit safety phase.

### Analytics and Dashboard

Phase 31 begins with read-only, city/role-scoped aggregates from authoritative
business tables and approved read models. It must show source, unit, window,
last-updated time, stale/disconnected state, and access scope. `apps/dashboard`
cannot receive a runtime until those contracts and an approved screen source
exist.

## Standard implementation gate for each later phase

For every approved implementation phase: establish its branch from locked
`main`; add contracts before backend code; append migrations only; register
city/role guards; emit/consume only approved events; add unit, integration,
contract, security, migration replay, and boundary tests; update module docs
and a Phase report; run the phase gate, typecheck, build, full regression,
preflight, and browser evidence where an app surface is authorized. Lock only
after a clean worktree, explicit human acceptance, merge to `main`, and tag.

## Entry recommendation

Authorize **Phase 26 design only** next. Do not authorize Phase 27 runtime
work, provider integration, or any Dashboard/OA construction until the Phase
26 design gates above are accepted.
