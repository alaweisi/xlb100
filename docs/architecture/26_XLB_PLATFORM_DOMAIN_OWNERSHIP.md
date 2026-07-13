# Phase 26 — Platform Domain Ownership

> Status: **ACCEPTED — DESIGN ONLY**. Human acceptance of D2/E2/F2 records PASS for this ownership design. The five domains below are not authorized runtime modules. Existing domain ownership always wins until the corresponding Phase 27–31 implementation is explicitly entered, accepted and locked.

## 1. Shared ownership law

1. A table has one canonical writer domain. Cross-domain integration is a guarded command/API or approved event, never a direct table update.
2. Every business row and delivery uses a real `city_code`; `__global__` is permission metadata only.
3. Every request follows `RequestContext → CityCode → Contract → Guard`; customer/worker are self scoped and admin/operator/auditor use explicit city scopes.
4. Platform delivery is at-least-once. Consumers commit a durable unique `(subscriber_id,event_id)` with their target effect.
5. PII is minimized. General event delivery excludes raw contact, free text, precise location, evidence bytes, secrets and Provider bodies.
6. Derived models never become source truth. Rebuild/rollback changes a projection generation or read pointer, not the producer's data.
7. Formal implementation and Lock order is serial: Phase 26 acceptance → 27 → 28 → 29 → 30 → 31. Only read-only discovery may overlap.

### 1.1 Phase26 acceptance and deferred-decision boundary

- **G0:** PASS; baseline, scope and five-file design-only boundary are accepted.
- **G1:** PASS; Option A is accepted for Phase26 design.
- **G2/G3/G4:** **PASS WITH APPROVED DEFERRED DECISIONS**. Exact retention/legal hold/PII redaction, initial subscriber allowlists, and Notification/Marketing/Risk/BI product rules remain entry-Gate values owned by the domains below.
- **G5:** PASS for design review after accepted D2/E2/F2; no migration is authorized.
- **G6:** PASS — DESIGN ONLY because G1–G5 are signed off or covered by explicit human-approved deferrals.

Producer/Privacy/Legal/Operations own lifecycle retention, hold and redaction decisions. Producer/Privacy plus the receiving domain own each initial allowlist. Notification/Product/Privacy/Security confirm Notification rules at Phase 27 entry; Marketing/Product/Finance/Privacy confirm Marketing rules at Phase 29; Risk/Security/Legal/Privacy confirm Risk rules at Phase 30; Analytics/Product/Data Governance/Privacy/Finance confirm BI rules at Phase 31. Review/Reputation candidate features not covered by those approved deferrals remain outside Phase26 implementation authority and require an explicit Phase28 scope decision before use.

Deferral is not authorization: an affected subscription or Provider remains inactive until its values are confirmed. Every Phase 27–31 entry rechecks relevant deferrals. Material changes to the ADR, event catalog or migration ledger reopen affected G2/G5 review and impacted test-matrix rows.

## 2. Notification — Phase 27 candidate

### 2.1 Actors, roles and city scope

| Actor | Allowed scope |
| --- | --- |
| Customer | Own recipient inbox/read state in the current real city; no other user's records |
| Worker | Own recipient inbox/read state in the current real city |
| Admin/operator | City-scoped template/policy operations and delivery diagnostics only after explicit permission |
| Auditor | City-scoped read-only audit evidence; no template publication or retry |
| Notification subscriber service | Registered city/event/version/PII allowlist only |
| External channel Provider | Separate future service identity and envelope; currently absent |

Cross-city recipient lookup, global business inbox rows, and OA recipient identity are forbidden. OA has no approved identity/organization contract.

### 2.2 Writer ownership and readers

| Record | Canonical writer | Readers / event relationship |
| --- | --- | --- |
| Template and immutable template revision | Notification | Admin/operator preview/management; subscriber renders only an approved revision |
| Recipient preference | Notification | Recipient and authorized policy evaluator |
| In-app notification record | Notification | Recipient; city-scoped support/admin diagnostics |
| Read/archive state | Notification | Recipient mutation; scoped analytics aggregate |
| Platform event delivery | Platform delivery | Notification subscriber claims; Notification must not edit it directly except acknowledge through delivery API |
| Channel delivery intent/attempt | Notification | Operations/auditor; separate from platform event delivery |
| Provider envelope | Future channel adapter | Notification stores truthful result only; absent Provider returns `unavailable`/`not_configured` |

Source Order, Payment, Fulfillment, Aftersale, Support, Review or Worker facts remain producer-owned. Notification receives minimal approved events and stores only what is needed to present the notification.

### 2.3 Lifecycle design

Proposed independent lifecycles; their concrete product rules are an approved deferral to the Phase 27 entry Gate and are not implemented:

- Template: `draft → reviewed → active → retired`; publication creates an immutable revision.
- Preference: `default/effective → user_override → revoked/reset`; mandatory legal/service notices require an explicit policy class and cannot be invented by templates.
- In-app record: `created → visible → read` with optional `archived/hidden`; read and archive are recipient-scoped facts, not delivery success.
- Platform delivery: defined only by ADR-26-01.
- External channel: `not_configured | unavailable | queued → attempted → delivered | retry_wait | dead_letter`; no external state exists until a Provider phase is approved.

“In-app visible” does not imply SMS/Push/WeChat/Email delivery. Channel failure does not roll back the source business transaction.

### 2.4 Minimization, retention, audit and deletion/hiding

- Template parameters are allowlisted per event/version. Arbitrary payload-to-template access is forbidden.
- Store recipient pseudonymous ID, template/revision, source event ID, render parameters, timestamps and read state; do not copy raw Support/review text, phone, address or evidence.
- Recipient lookup occurs inside Notification under city/identity guards.
- Template publication, preference override, manual retry and visibility changes record actor, city, reason, revision and trace.
- Exact notification/read/channel retention is an approved deferred Privacy/Product decision at the Phase 27 entry Gate. Derived records must not outlive canonical content deletion requirements.
- User deletion/hiding affects Notification-owned presentation only; it never deletes source Order/Support/Review audit facts.

### 2.5 Idempotency, concurrency and rollback

- Unique live record candidate: city + recipient type/ID + source event ID + template key/revision.
- Read/archive uses row version/CAS and is idempotent when target state already holds.
- Template publication uses immutable revision and one active pointer per city/policy scope.
- Event processing commits target record and `(subscriber_id,event_id)` inbox key atomically.
- Rollback pauses the subscriber, disables template revision/campaign placement, and reverts reads to the prior revision. It does not unpublish the source event or mutate source domains.
- External retry is isolated by channel/recipient and cannot recreate the in-app record.

### 2.6 Forbidden cross-domain writes

- Order/payment/pricing/quote/refund, Dispatch/Fulfillment, Worker profile/eligibility, Ledger/Settlement.
- Support ticket, assignment, SLA, conversation or message tables.
- Review/reputation, Marketing coupon, Risk case or BI projection tables.
- Source `event_outbox` status/lease/attempt fields.
- Any “delivered” success for unconfigured SMS/Push/WeChat/Email.

### 2.7 Phase 27 entry and exit gates

Entry requires Phase 26 G0–G6 human acceptance, accepted ADR/migration ledger, exact initial event allowlist, template/recipient/privacy decisions, and durable inbox design.

Exit requires:

- additive platform delivery implementation and isolated subscriber evidence;
- in-app inbox only, with customer/worker self-scope and admin city denial tests;
- duplicate delivery, lease expiry, DLQ, manual retry, replay and rollback tests;
- Provider truthfulness tests proving external channels remain unavailable/not-configured;
- zero writes to all protected domains; no OA runtime.

## 3. Review/Reputation — Phase 28 candidate

### 3.1 Actors, roles and city scope

| Actor | Allowed scope |
| --- | --- |
| Customer | Create the single review for an owned, paid order with completed fulfillment; view own review/appeal |
| Worker | View allowed feedback and submit one governed reply if product policy permits; cannot change rating |
| Admin/operator moderator | Explicit city-scoped moderation/visibility decision under separated permission |
| Auditor | City-scoped decision/audit read only |
| Reputation subscriber | Registered `review.*` versions; writes only its derived projection |

The existing Review invariants remain: customer identity, matching city, paid order, completed fulfillment, and unique `(city_code,order_id)` review.

### 3.2 Writer ownership and readers

| Record | Canonical writer | Readers / event relationship |
| --- | --- | --- |
| `order_reviews` review/rating/comment | Existing Review service only | Customer/order surfaces; future moderation reads |
| Review reply | Future Review sidecar owner | Customer/worker/admin subject to visibility policy |
| Moderation and visibility decision | Future Review moderation owner | Review presentation and Reputation projection |
| Appeal | Future Review appeal owner | Customer/worker/admin/auditor by policy |
| Reputation aggregate/read model | Reputation projection subscriber only | Worker presentation, Admin, BI; Dispatch only after a separate eligibility contract |
| Worker profile/qualification/dispatch eligibility | Worker/Compliance/Dispatch existing owners | Reputation is read-only input at most, never writer |

No second rating/review writer or table may be introduced. `review.created` must be emitted transactionally by the existing Review writer in Phase 28 only after its contract is accepted.

### 3.3 Lifecycle design

- Current review lifecycle remains exactly `created`; Phase 26 does not reinterpret it.
- Future sidecar moderation proposal: `unreviewed/visible ↔ hidden`, with immutable decisions and reason codes. Whether new reviews are visible immediately is an unresolved product decision.
- Reply proposal: `draft → published → hidden`; edit policy and one/many replies are unresolved.
- Appeal proposal: `opened → under_review → upheld | rejected | withdrawn`.
- Reputation projection: `building → current → stale | failed → rebuilt`, with source watermark, projection revision and explainable counts.

Moderation changes presentation/aggregation eligibility; it does not rewrite the original rating/comment. Corrections require a domain-approved append-only correction policy.

### 3.4 Minimization, retention, audit and deletion/hiding

- `review.created` carries rating and references, not comment text.
- Reputation stores aggregates, counts, bands, time windows and source watermark; no raw comments.
- Moderator access to comments is city/purpose scoped and audited. Risk/BI receives reason/category or aggregate facts, not content.
- Review, reply, appeal and moderation retention/deletion rules require human privacy/legal/product decisions.
- Hiding removes public/worker presentation and derived inclusion according to policy, but preserves authorized audit evidence.
- Customer deletion requests are resolved by Review; downstream projections receive a tombstone/visibility change and reconcile.

### 3.5 Idempotency, concurrency and rollback

- Existing unique city+order remains the create idempotency boundary.
- Reply/appeal commands require domain idempotency key; moderation/visibility uses expected review version/CAS.
- Reputation applies `(subscriber_id,event_id)` once and advances an aggregate revision/watermark atomically.
- Out-of-order version is parked and reconciled; implicit-v0 events cannot drive ordered reputation without source reconciliation.
- Rollback pauses projection, points reads to the last complete generation, and leaves `order_reviews` unchanged.

### 3.6 Forbidden cross-domain writes

- Worker profile, level, availability, certification, penalty or dispatch eligibility.
- Dispatch task/offer/ranking, Order/Payment/Pricing/quote, Ledger/Settlement.
- Support tickets/conversations except a guarded handoff command; Risk cases except an event.
- A second `ratings`/`reviews` source table or direct aggregate column update on Worker.
- Review comment text in general event delivery or BI.

### 3.7 Phase 28 entry and exit gates

Entry requires Phase 27 Lock, existing Review compatibility decision, accepted `review.created` v1 contract, moderation/reply/appeal/visibility product decisions, retention policy and projection-generation design.

The entry compatibility Gate must also audit the parent-key integrity behind migration `030_order_review_mvp.sql`: `orders`, `worker_profiles` and `fulfillments` must expose the composite city unique keys required for same-city references from `order_reviews`. Migration `030` remains immutable. If any composite parent key or child FK is absent, Phase 28 may harden it only through a new append-only migration that adds the required composite-city unique/FK constraints after replay and existing-data validation. The current Review service-layer `assertCityScopedContext`, customer ownership and paid/completed guards remain mandatory even after database hardening.

Exit requires:

- unchanged existing create-review behavior and uniqueness regression;
- exactly one Review writer and transactional `review.created` emission;
- derived reputation read model with duplicate/out-of-order/rebuild evidence;
- city/role/content privacy and visibility/appeal tests;
- protected Worker/Dispatch/Order/Payment/Ledger zero-write proof.

## 4. Marketing — Phase 29 candidate

### 4.1 Naming, actors and city scope

Use distinct terms:

- **Presentation Campaign**: Phase 25 visual theme/banner contract (`Campaign` in current shared types).
- **Marketing Campaign**: future business promotion container; use an explicitly different domain name such as `MarketingCampaign` in design/code review.
- **Coupon**: future discount entitlement with grant/reservation/redemption facts.

The current `Campaign.discountRuleId` is a **non-authoritative, non-executable Phase 25 visual compatibility field**. It is not a Marketing campaign ID, rule revision, coupon reference, eligibility proof, discount decision or amount source. Backend, Quote, Marketing and frontend code must not execute, resolve or infer money semantics from it. Before Phase 29 implementation, a human must approve an explicit deprecation/removal path or replace it with a separately versioned Marketing-to-Quote contract; silent reuse is forbidden.

| Actor | Allowed scope |
| --- | --- |
| Customer | Own coupon grants/reservations and quote result in current city |
| Admin/operator marketer | Explicit city-scoped definition/review/schedule/pause operations under separated permissions |
| Auditor | Read-only campaign/coupon/decision audit |
| Quote orchestration | Validates a time-bounded discount decision and creates authoritative quote snapshot |
| Marketing subscribers | Approved order/refund/reverse events only; no direct source write |

### 4.2 Writer ownership and readers

| Record | Canonical writer | Boundary |
| --- | --- | --- |
| Marketing campaign/rule revision | Marketing | Cannot alter Phase 25 tokens directly; presentation bridge receives a separately resolved visual result |
| Coupon definition and inventory policy | Marketing | Stock semantics require product decision |
| Coupon grant/eligibility | Marketing | Customer scoped; inputs read from canonical domains |
| Reservation/redemption/release | Marketing | Tied to quote/order refs with CAS/idempotency |
| Discount decision | Marketing | Output only; Quote validates decision ID, revision, amount, expiry and fingerprint |
| Base price/rules/fee items | Pricing | Marketing read-only |
| Final amount and quote snapshot | Order quote flow | Marketing cannot update it |
| Payment/refund | Payment/Aftersale | Marketing consumes approved result events only |

### 4.3 Lifecycle design

- Marketing campaign proposal: `draft → reviewed → scheduled → active → paused → ended | revoked`.
- Coupon definition: `draft → active → suspended → expired | retired`.
- Grant: `granted → available → reserved → redeemed`, with `released/expired/revoked` branches.
- Reservation: created with quote/order binding, rule revision, amount and expiry; commit to redemption only through approved Order/Payment fact.
- Discount decision: immutable, request-fingerprint bound, time-bounded and either accepted into one quote snapshot or expired/rejected.

The human-approved Phase26 deferral covers stacking/priority, inventory, customer segments, reservation timeout, payment-failure release, order cancellation, partial refund, full refund, abuse limits and compensation. Marketing/Product/Finance/Privacy must decide them at the Phase 29 entry Gate; Phase 29 may not choose them silently.

### 4.4 Minimization, retention, audit and deletion/hiding

- Eligibility inputs are purpose-limited references/attributes, not copied customer profiles.
- Marketing does not receive contact details, addresses, Support/review text or precise location.
- Definition/revision/review/publication, manual grant/revoke and stock adjustment require actor/reason audit.
- Financial discount decisions and redemptions use finance-approved retention; campaign presentation and expired grants use product/privacy-approved retention.
- Revoking a campaign prevents new decisions; it does not rewrite historical quote snapshots, orders or payments.
- Customer-facing hiding does not delete required redemption/audit evidence.

### 4.5 Idempotency, concurrency and rollback

- Definition revisions are immutable; one active revision per explicit scope/priority policy.
- Grant unique key is policy-defined (campaign/coupon/customer/issuance reason) and must be frozen before implementation.
- Reservation uses grant+order/quote uniqueness and expected grant version; redemption is one per reservation.
- Quote decision uses normalized request fingerprint and rule revision; retries return the same decision.
- Event subscriber uses `(subscriber_id,event_id)` and never directly mutates Order.
- Rollback pauses the campaign/rule revision, expires new decisions, releases eligible uncommitted reservations by audited compensation, and leaves historical quote/order/payment facts intact.

### 4.6 Forbidden cross-domain writes

- Pricing base price, rule, fee item or SKU.
- Order total/status, `order_price_snapshots`, Payment amount/status, refund/provider state.
- Worker/Dispatch/Ledger/Settlement, Support, Review/Reputation, Risk or BI tables.
- Phase 25 runtime tokens outside the presentation allowlist.
- Frontend/local discount calculation or invented promotion success.

### 4.7 Phase 29 entry and exit gates

Entry requires Phase 28 Lock, a human-approved deprecation or replacement path for visual `Campaign.discountRuleId`, naming/stacking/inventory/cancel/refund decisions, accepted quote-decision contract, money rounding/currency policy, event allowlist and finance/privacy retention approval.

Exit requires:

- deterministic eligibility/grant/reservation/redemption state-machine tests;
- concurrent reservation and duplicate redemption evidence;
- Quote rejects expired/mismatched decisions and owns final snapshot;
- cancellation/refund compensation matches accepted product policy;
- city/role/audit/privacy tests and protected Pricing/Order/Payment/Ledger zero-write proof;
- Presentation Campaign remains semantically separate.
- No eligibility, discount, price or amount path reads `Campaign.discountRuleId`.

## 5. Risk-Control — Phase 30 candidate

### 5.1 Actors, roles and city scope

| Actor | Allowed scope |
| --- | --- |
| Risk rule service | Evaluate only accepted event versions/fields in one city |
| Risk analyst admin/operator | City-scoped case queue, evidence references and manual decision |
| Auditor | Read-only rules/revisions/case decision trail |
| Support agent | Receives a guarded handoff ticket/reference; does not become risk writer |
| Customer/worker | Future appeal/status surface only after a product/privacy contract |

Initial implementation is observe, record, case and manual review only.

### 5.2 Writer ownership and handoffs

| Concern | Owner | Risk-Control relationship |
| --- | --- | --- |
| Technical rate limit/auth control | Security | Read/reference signal; no takeover |
| Generic immutable trace | Audit | Risk emits auditable decisions; Audit does not decide cases |
| Certification/qualification/eligibility | Compliance | Reference only; no direct mutation |
| Support ticket/conversation | Support | Risk requests a handoff through guarded Support command/API |
| Settlement action governance flags | Settlement governance | Remain settlement-specific; not reused as generic risk tables |
| Business risk rules/signals/cases/reviews | Risk-Control | Future canonical writer |
| Order/payment/dispatch/worker/ledger action | Existing protected domain | No action in initial Risk phase |

### 5.3 Lifecycle design

- Rule: `draft → reviewed → active → paused → retired`, immutable revisions and deterministic evaluation version.
- Observation/signal: immutable `recorded`; correction is a linked superseding signal, not update/delete.
- Case: `open → triaged → in_review → resolved | dismissed`, with optional `appeal_pending → appeal_decided` after product acceptance.
- Evidence: reference-only links with source owner, hash/version, access classification and expiry; no raw cross-domain dump.
- Handoff: `requested → accepted | rejected → closed`, owned by the receiving domain's command result.

No state authorizes automatic freeze, order cancellation, deduction, dispatch influence, worker punishment, Ledger/Payment write or Provider call.

### 5.4 Minimization, retention, audit and deletion/hiding

- Rules declare input fields, purpose, PII ceiling, output reason codes and explainability text.
- Cases store subject pseudonym/reference, rule revision, score/band if approved, evidence references and manual decisions; no unnecessary contact/content.
- P2 evidence access is just-in-time, city scoped and audited. Secrets/P3 are prohibited.
- Rule publication, case assignment, decision, handoff, appeal and manual replay record actor, reason, before/after version and trace.
- Retention, subject-access, correction, appeal and legal-hold policy are approved deferred decisions owned by Risk/Legal/Privacy at the Phase 30 entry Gate.
- Hiding a case from a user surface does not erase authorized audit evidence; canonical source deletion is handled by the source owner and propagated by tombstone/reconciliation policy.

### 5.5 Idempotency, concurrency and rollback

- Signal fingerprint includes city, subject, event, rule revision and reason; duplicate delivery is a no-op.
- Case creation uniqueness is policy-defined and must avoid merging unrelated subjects/events.
- Assignment/decision uses expected case version/CAS; two analysts cannot both decide the same version.
- Subscriber commits target signal/case and `(subscriber_id,event_id)` atomically.
- Rollback pauses rule/subscriber revision and restores previous rule pointer. It never reverses a protected-domain action because none is authorized.
- Model/rule re-evaluation is a replay generation producing explainable new signals linked to old ones, not destructive rewrite.

### 5.6 Forbidden cross-domain writes

- Account/session freeze, customer/worker ban, order cancel/reassign, dispatch ranking/eligibility, payment/refund/deduction, Ledger/Settlement entries, certification/penalty.
- Direct Support ticket/message/SLA write; only guarded handoff.
- Direct Security/Audit/Compliance/governance table reuse.
- Notification of allegations without an approved user communication policy.
- Raw event payload lake or silent automated decision.

### 5.7 Phase 30 entry and exit gates

Entry requires Phase 29 Lock, accepted event delivery model, rule/case/evidence/handoff contracts, analyst permissions, appeal/privacy/retention decisions and explicit zero-action scope. Abnormal review signals are optional until Phase 28 is locked and their contract is approved.

Exit requires:

- deterministic rule revision and immutable signal evidence;
- duplicate/out-of-order/replay/lease/DLQ tests;
- city/role/evidence-access and analyst concurrency denial tests;
- Support handoff through canonical API;
- automated-action and protected-domain zero-write gates;
- explainability and audit completeness.

## 6. Analytics/BI — Phase 31 candidate

### 6.1 Actors, roles and city scope

| Actor | Allowed scope |
| --- | --- |
| BI projection service | Approved minimal events/source queries for one city and one metric revision |
| Admin/operator | City/role-scoped aggregate reads; no raw subject drilldown unless a separate source-domain API permits it |
| Auditor | Read-only approved audit/financial aggregates by permission |
| Dashboard | Future read-only service identity and approved wallboard scope; currently absent |
| Customer/worker | No general BI access; own-domain summaries remain their domain APIs |

Dashboard cannot be created until metric/read API, city/role/privacy, freshness/transport and visual source are approved.

### 6.2 Writer ownership and readers

| Record | Canonical writer | Boundary |
| --- | --- | --- |
| Business source fact | Order/Dispatch/Worker/Fulfillment/Support/Settlement etc. | BI read/event only |
| Metric definition/revision | BI governance owner with source-domain approval | Formula cannot be changed silently |
| Aggregate bucket/read model | BI projection | Read-only to Admin/Dashboard |
| Projection watermark/freshness | BI projection | Operations and Dashboard use it to show stale/no-data |
| Prometheus metrics | Observability | Operational only; not copied as business source truth |
| Domain summary API | Source domain | Can be an approved source, not automatically a cross-domain metric |

### 6.3 Proposed metric dictionary

Every row is proposed and remains non-executable until the named source owner plus Product/Privacy completes the approved deferred Phase 31 entry decision.

| Metric ID | Owner/source | Formula | Unit | Window and timezone | Freshness / stale | PII |
| --- | --- | --- | --- | --- | --- | --- |
| `orders_created_count` | Order | distinct canonical orders with `created_at` in bucket | count | 5m, 1h, business day; store UTC, day boundary `Asia/Shanghai` | refresh ≤5m; stale >10m | P0 aggregate after minimum-cell policy |
| `order_gross_amount` | Order quote snapshot, finance-approved | sum authoritative order `total_amount` for accepted status cohort; refund treatment TBD | CNY | 1h/day; UTC storage, `Asia/Shanghai` presentation | ≤15m; stale >30m | P2-FIN aggregate |
| `dispatch_pending_count` | Dispatch | current tasks in accepted pending/queued states; exact states TBD | count snapshot | point-in-time plus 5m samples; UTC | ≤1m; stale >3m | P0/P1 aggregate |
| `dispatch_accept_latency` | Dispatch/Worker Accept | accepted time minus offer/queue start for valid accepted tasks | seconds, p50/p95 | rolling 15m/1h/day; UTC | ≤5m; stale >10m | P0 aggregate |
| `fulfillment_completion_rate` | Fulfillment | completed cohort / started eligible cohort; cohort/late-arrival rule TBD | ratio/% | day/week; `Asia/Shanghai` cohort | ≤15m; stale >30m | P0 aggregate |
| `active_worker_count` | Worker | distinct workers satisfying accepted activity definition; definition TBD | count | 5m/1h/day; UTC events, `Asia/Shanghai` day | ≤5m; stale >10m | P1 before aggregation; P0 after threshold |
| `support_open_ticket_count` | Support | tickets in accepted non-terminal statuses at watermark | count snapshot | point-in-time/5m; UTC | ≤2m; stale >5m | P0/P1 aggregate |
| `support_sla_breach_rate` | Support | distinct breached tickets / tickets with due SLA in cohort | ratio/% | hour/day; `Asia/Shanghai` | ≤5m; stale >10m | P0 aggregate |
| `settlement_confirmed_amount` | Settlement | sum confirmed batch amount for accepted currency/status | CNY | day/month; `Asia/Shanghai` | ≤30m; stale >60m | P2-FIN aggregate; auditor/finance roles |
| `event_delivery_lag` | Platform delivery/Observability | now minus oldest unmaterialized/undelivered event time by bounded subscriber class | seconds | current, 1m sample; UTC | ≤1m; stale >3m | P0 operational; no city/user/order label in Prometheus |

Minimum-cell suppression, financial access, late-arrival correction, refund/cancel cohort rules and exact stale thresholds are human-approved deferred decisions owned by Analytics/Product/Data Governance/Privacy/Finance at the Phase 31 entry Gate. Until confirmed there, these are not API contracts.

### 6.4 Read-model lifecycle and freshness

- Metric definition: `draft → reviewed → active → deprecated → retired`, immutable revisions.
- Projection generation: `building → validated → current → stale | failed → superseded`.
- Bucket: open until watermark/allowed lateness, then closed; later corrections create a revision/audit trail.
- Every response exposes metric revision, source owner, unit, window start/end, timezone, generated/observed-at, watermark, freshness status and access scope.
- UI states are truthful: loading, no-data, current, stale, disconnected, unauthorized and error. Last known values remain labeled stale; they are never presented as realtime.

### 6.5 Minimization, retention, audit and deletion

- Prefer business-DB aggregate read models first. A warehouse/ETL requires separate volume/query/retention evidence.
- Dimensions are allowlisted and bounded. Raw customer/worker/order/payment IDs are not BI dimensions or Prometheus labels.
- Low-cell suppression and pseudonymization thresholds require privacy approval.
- Metric definition and backfill/rebuild changes are audited with formula/revision, owner, reason, source watermark and result hash/count.
- Aggregate retention is metric-specific and must not preserve reconstructable PII beyond source policy.
- Source deletions/corrections trigger approved recomputation/tombstone behavior; BI never deletes source facts.

Prometheus remains for operational telemetry only. Its current bounded method/route/status labels must not be expanded with city/user/worker/order/payment/request/trace identifiers.

### 6.6 Idempotency, concurrency and rollback

- Projection applies each source event once per subscriber/projection generation.
- Aggregate bucket update uses deterministic contribution key or recompute-from-source, plus bucket revision/CAS.
- Only one writer lease per city+metric+window+generation; late events create controlled revision, not double count.
- Rebuild writes a new generation, validates counts/hash and freshness, then atomically changes the read pointer.
- Rollback points reads to the previous complete generation and pauses the failing subscriber; source domains remain unchanged.

### 6.7 Forbidden cross-domain writes

- All Order, Payment, Pricing, Worker, Dispatch, Fulfillment, Support, Review, Marketing, Risk, Ledger and Settlement source tables.
- Prometheus as BI store or high-cardinality identifiers as labels.
- Raw cross-domain export/lake, unapproved drilldown, fake metrics, fake timestamps or fake realtime transport.
- `apps/dashboard/src`, Dashboard API client, SSE/WebSocket or wallboard before readiness approval.

### 6.8 Phase 31 entry and exit gates

Entry requires Phase 30 Lock, accepted metric dictionary/owners/formulas/windows/timezone/freshness/PII, source API/event contracts, read-model migration plan, Dashboard product/visual source and transport decision.

Exit requires:

- source-to-aggregate reconciliation and duplicate/late/replay/rebuild evidence;
- metric revision, watermark, freshness/stale/no-data contract tests;
- city/role/financial/low-cell privacy denials;
- Prometheus high-cardinality gate and protected-domain zero-write proof;
- Dashboard only if its independent Gate 7B product/data/visual/transport prerequisites are accepted; otherwise Phase 31 exits with APIs/read models and Dashboard remains blocked.

## 7. Serial dependency and human acceptance

```text
Phase 26 accepted — design only
  -> Phase 27 read-only discovery and entry design
  -> separately authorized Phase 27 Notification implementation + Lock
  -> Phase 28 Review/Reputation locked
  -> Phase 29 Marketing locked
  -> Phase 30 Risk-Control locked
  -> Phase 31 Analytics/BI locked
```

Read-only discovery for later phases may run earlier. After the Phase26 design documents are independently submitted, only Phase27 read-only discovery and entry design may start; runtime implementation remains unauthorized. Migration allocation, runtime work, merge and Lock may not run in parallel in the shared `G:\xlb100` worktree and may not skip predecessor acceptance or its deferred-decision checks.
