# XLB Phase 16-22 Competitive Gap Closure Plan

Date: 2026-07-10
Status: active; Phase 16 complete, Phase 17 in progress
Basis: `docs/CURRENT_STATE.md`, `docs/reports/PHASE15_*`, `docs/reports/PHASE16_V18_PROJECT_HEALTHCHECK.md`, third-party benchmark report `FRESH_BENCHMARK_XLB_2026-07-10.md`, and public competitor capability scan.

## 0. Planning Position

This document is a local execution plan, not a lock report and not a production approval.

The current repository already contains Phase 15 materials focused on UI foundations, route shells, customer real-business loop, worker/admin UAT scans, and productization reports.

Phase 15 is treated as an independent completed/in-progress frontend productization engineering phase. This competitive gap closure plan starts cleanly at Phase 16. No Phase 15 renaming is required.

Phase labels:

- Phase 16: SKU / pricing / fee items / installation standards
- Phase 17: order reverse flow + aftersale complaints
- Phase 18: fulfillment evidence + OSS mock/provider envelope
- Phase 19: B-side enterprise + OpenAPI/webhook
- Phase 20: LBS-lite dispatch without real Amap integration
- Phase 21: A/W/C operations UI closure
- Phase 22: E2E, observability, security, and performance gates

Execution state on 2026-07-10:

- Phase 16: COMPLETE after `scripts/check-phase16-migration-verification.ps1` passed.
- Phase 17: IN PROGRESS; implementation and migration verification gate complete locally, pending formal phase closure.
- Phase 18-22: planned.

## 1. Non-Negotiable Boundaries

Allowed:

- Build production-shaped local capabilities.
- Use mock/provider envelopes where external providers are unavailable.
- Preserve `city_code`, RequestContext, contract-first, validators, migrations, and CI guard discipline.
- Reuse existing modules before creating new ones.

Forbidden:

- No real WeChat Pay, Alipay, bank, payout, or refund provider integration in this plan.
- No real Amap or other paid map API integration in this plan.
- No global/national unscoped queue, table, or API.
- No fake "success" pages that bypass backend state.
- No migration edits to locked migrations; append only.
- No `sdj99` naming.

Provider-envelope rule:

- Payment remains mock-provider capable but must be shaped as `PaymentProviderEnvelope`.
- Geo remains mock-provider capable but must be shaped as `GeoProviderEnvelope`.
- OSS remains local/mock-provider capable but must be shaped as `ObjectStorageProviderEnvelope`.

## 2. Competitor Deconstruction

### 2.1 Wanshifu Capability Model

Public signals:

- B+C platform: merchant service and family service.
- Large worker network and national coverage.
- Multiple order modes: worker quote, fixed price, total-package assignment.
- Guaranteed transaction, advance compensation, insurance/service protection.
- Enterprise settlement modes, including single payment and monthly billing.
- Open platform: auth, merchant authorization, service order sync, service node notifications, close/refund, fee additions, logistics arrival updates.

XLB gap:

- Current XLB has strong ledger/settlement foundations but lacks merchant onboarding, open API, quote competition, guarantee transaction, compensation, and enterprise billing.

### 2.2 Luban Daojia Capability Model

Public signals:

- B-side enterprise focus plus C-side home user app.
- Installation, repair, measurement, delivery, moving, dismantling, and project work.
- Batch order creation, automatic hiring, order warranty custody, business analytics, and API integration.
- Worker real-name verification, skill assessment, category-based matching, and fast nearby dispatch.

XLB gap:

- Current XLB has catalog/pricing/order foundations, but SKU is not model/brand/standard aware, enterprise order batch flows do not exist, and dispatch is not real worker assignment.

### 2.3 Zhuomuniao Capability Model

Public signals:

- C-side high-conversion repair flow: quick repair request, diagnosis/search, transparent price, online customer service.
- Home and enterprise service categories.
- After-sale, timeliness, price, material, service, and safety guarantees.
- Engineer real-name verification, standardized quotation, service-node program monitoring.
- Enterprise asset/order/fee/annual repair data management.

XLB gap:

- Current XLB has customer pages and order flow, but lacks diagnosis, service guarantee UX, media evidence, complaint work orders, service-node monitoring, coupon/marketing, and customer-service console.

## 3. Existing Local Foundations To Reuse

Backend and DB foundations:

- `catalog`, `pricing`, and official catalog seed: 16 categories / hundreds of SKU rows already exist.
- `order`, `payment`, and `event_outbox`: basic customer order and mock payment flow exists.
- `dispatch`: dispatch tasks/offers/events and city stream naming exist, but assignment/matching remains incomplete.
- `worker`: task pool, accept, finance, certifications, bank accounts, and withdrawals exist.
- `fulfillment`: start/complete state exists, but lacks arrival/evidence/customer confirmation/SLA nodes.
- `aftersale`: refund request/approve exists, but no complaint/repair/liability/compensation workflow.
- `ledger` and `settlement`: strongest existing foundation; should be reused, not rewritten.
- `city_code` coverage and admin city scopes exist and must remain enforced.

Frontend foundations:

- Phase 15 UI primitives and route shells exist.
- Customer app has real catalog/pricing/order/payment-order slices.
- Worker app has task pool/accept/fulfillment/certification slices in progress, with wallet/profile gaps.
- Admin app has settlement, statement detail, export review, withdrawal review, order trace, and partial governance pages.

Quality foundations:

- Unit/contract/integration/security tests exist.
- Current hard gaps remain E2E, performance, coverage reporting, provider-signature tests, rate limit tests, and frontend real-flow tests.

## 4. Phase Plan

### Phase 16: SKU / Pricing / Fee Items / Installation Standards

Goal:

- Turn catalog/pricing from "basic service list" into a service-product model that can support Wanshifu/Luban-style installation, repair, delivery, measurement, dismantling, and enterprise fee rules.

Existing pieces:

- `service_categories`, `service_items`, `service_skus`
- `price_rules`
- catalog/pricing routes and customer browsing UI

Missing pieces:

- brand/model fields
- installation standards
- fee item model
- material fee, floor fee, distance fee placeholder, urgent fee, night fee, dismantle fee
- enterprise price override hooks
- admin SKU/pricing management UI

Target deliverables:

- New contracts/types/validators for `ServiceStandard`, `SkuModelProfile`, `FeeItem`, `PriceQuoteBreakdown`.
- Append-only migrations for standard/fee tables.
- Pricing service returns itemized quote breakdown, not only total price.
- Customer order create stores quote snapshot.
- Admin read/write pages for SKU standard and pricing config.

Acceptance gates:

- Contract tests for quote breakdown.
- City-scoped DB tests.
- Backward compatibility for existing catalog/pricing APIs or explicit versioned replacement.

### Phase 17: Order Reverse Flow + Aftersale Complaints

Goal:

- Build order reverse and aftersale workflows that can support cancellation, reschedule, reassignment, complaint, repair, liability decision, and compensation request without real provider refund execution.

Existing pieces:

- order state machine
- fulfillment state machine
- `aftersale_refund_requests`
- ledger reversal foundation

Missing pieces:

- cancel request / cancel approval
- reschedule
- reassign
- partial refund intent
- complaint work order
- repair order
- liability decision
- compensation request
- customer service intervention timeline

Target deliverables:

- New order reverse tables and aftersale complaint tables.
- Explicit state machines for `order_reverse`, `complaint`, `repair`, and `liability`.
- Admin complaint/review console.
- Customer order detail supports cancel/reschedule/complaint actions.
- Worker task detail supports complaint/repair visibility and cooperation actions.

Acceptance gates:

- No direct payment execution.
- Refund remains provider-envelope/mock only.
- Ledger reversal only through approved contract path.
- E2E-like integration test: customer creates complaint -> admin decides -> repair/reassign/refund-intent path is auditable.

### Phase 18: Fulfillment Evidence + OSS Mock/Provider Envelope

Goal:

- Make field service auditable: arrival, before photo, after photo, material photo, completion evidence, customer confirmation.

Existing pieces:

- fulfillment start/complete
- worker task pages
- admin order trace

Missing pieces:

- `media_assets`
- object storage abstraction
- evidence binding to fulfillment/order/complaint
- upload API
- file metadata audit
- customer confirmation node

Target deliverables:

- `ObjectStorageProviderEnvelope` with local/mock provider.
- `media_assets` and `fulfillment_evidence` tables.
- Worker upload/attach evidence API.
- Admin evidence viewer in order trace.
- Customer evidence and confirmation view.

Acceptance gates:

- No binary blobs in business tables.
- Evidence must be city-scoped through parent entity and/or direct city_code.
- Upload type/size constraints and security tests.

### Phase 19: B-Side Enterprise + OpenAPI/Webhook

Goal:

- Add the minimum B-side platform layer required to resemble Wanshifu/Luban enterprise service: merchant onboarding, enterprise order API, agreement pricing, callback notifications, and monthly bill foundation.

Existing pieces:

- admin users and city scopes
- catalog/pricing/order
- settlement foundations, but currently worker-oriented

Missing pieces:

- `business_clients`
- enterprise contacts/users
- API keys / app credentials
- enterprise order external reference
- webhook subscriptions and delivery logs
- enterprise agreement price rules
- enterprise bill snapshots

Target deliverables:

- B-side contracts and API client surface.
- API key auth guard separate from admin/customer/worker bearer flow.
- Enterprise order create/read API with idempotency key and external order id.
- Webhook delivery engine for order status, fulfillment nodes, aftersale nodes, and fee additions.
- Admin enterprise client management page.

Acceptance gates:

- API key scope must be city/client constrained.
- Webhook delivery must be idempotent and retryable.
- No provider payment/payout execution.
- OpenAPI document generated or manually checked into docs.

### Phase 20: LBS-Lite Dispatch Without Real Amap

Goal:

- Build real dispatch architecture without external map dependency: worker location, service radius, candidate ranking, ETA placeholder, assignment, reassign, timeout, and dispatch audit.

Existing pieces:

- dispatch tasks/offers/events
- city stream naming
- worker eligibility/compliance
- worker accept

Missing pieces:

- `worker_locations`
- service radius
- geo provider envelope
- geocode/ETA provider interface
- candidate ranking
- assignment result persistence
- dispatch intervention API
- worker location freshness and privacy rules

Target deliverables:

- `GeoProviderEnvelope` with mock distance/ETA provider.
- Worker location upsert API.
- Dispatch matcher uses location, radius, certification, category, worker status, rating/penalty hooks.
- Reassign and timeout paths persist full audit trail.
- Admin dispatch intervention page.
- Worker map-like list can run without real map tiles.

Acceptance gates:

- No real Amap key or paid API call.
- All calculations deterministic in tests.
- City-scoped candidate search and no cross-city offers.
- Concurrency/idempotency tests for offer accept and timeout.

### Phase 21: A/W/C Operations UI Closure

Goal:

- Move from partial route shells to operational screens that a real local-service business can use daily.

Existing pieces:

- Customer home/services/order create/orders partial
- Worker hall/tasks/certification partial
- Admin settlement/export/withdrawal/order-trace partial
- `@xlb/ui` component foundation

Missing pieces:

- Customer profile/address book/order reverse/complaint/evidence confirmation
- Worker wallet/profile/settings/location/evidence upload/arrival/repair cooperation
- Admin order pool/SKU pricing/worker review/dispatch intervention/complaint console/enterprise clients/reporting

Target deliverables:

- Customer app: address book, order detail timeline, reverse actions, complaint, evidence confirmation.
- Worker app: availability/settings, location upsert, arrival, evidence upload, task detail, earnings and withdrawal details.
- Admin app: order pool, dispatch board, worker certification/level/penalty, SKU/pricing admin, complaint/repair console, enterprise management.

Acceptance gates:

- No UI-only business success.
- Every action route backed by contract/API/client tests.
- Playwright smoke for customer -> worker -> admin core flows.

### Phase 22: E2E / Observability / Security / Performance Gates

Goal:

- Turn local platform closure into a controlled staging-ready quality gate.

Existing pieces:

- unit/contract/integration/security tests
- health checks
- deploy and rollback scripts

Missing pieces:

- Playwright/Cypress E2E
- coverage reporting
- performance/load tests
- structured logs
- metrics endpoint
- trace propagation into logs
- alert rules
- dependency vulnerability scanning
- rate limiting
- XSS/CSRF/security scans for frontend/API edges

Target deliverables:

- E2E suites:
  - C creates order -> mock payment envelope -> dispatch -> W accept -> evidence -> completion -> ledger/settlement read path.
  - C complaint -> A decision -> W repair/reassign -> C confirmation.
  - Enterprise order -> webhook delivery -> status trace.
- Observability:
  - structured JSON logs
  - `/metrics`
  - traceId propagation and log correlation
  - dashboard-ready log/metric docs
- Security:
  - rate limit middleware
  - API key rotation tests
  - webhook signature tests
  - upload safety tests
  - dependency audit CI
- Performance:
  - dispatch candidate ranking benchmark
  - order list/admin query pagination benchmark
  - webhook delivery retry benchmark

Acceptance gates:

- CI must fail on E2E smoke failure, critical security failure, or coverage threshold miss.
- Staging readiness report must be regenerated after these gates pass.

## 5. Optimized Execution Order

Recommended build order inside the plan:

1. Phase 16 first, because SKU/fee/standard data becomes the shared contract for C orders, B orders, pricing, admin operations, and complaint liability.
2. Phase 18 second if upload/evidence blocks W/A/C UI work; otherwise keep Phase 17 second.
3. Phase 17 after quote snapshots exist, because disputes and partial refund decisions need fee breakdowns.
4. Phase 20 before full Phase 21 worker/admin UI closure, because dispatch pages need real assignment state.
5. Phase 19 can run in parallel after Phase 16 contracts stabilize, but webhook/status events must reuse Phase 17/18/20 state nodes.
6. Phase 21 only after backend actions exist; no page should fake business completion.
7. Phase 22 runs continuously but becomes the lock gate after Phase 21.

Practical sequence:

```text
16A standards/fees contracts
16B pricing quote breakdown
17A reverse/complaint contracts
18A object storage envelope + media assets
20A geo envelope + worker location
20B dispatch matcher/assignment
19A enterprise clients/API keys
19B webhooks/OpenAPI
21A customer operations UI
21B worker operations UI
21C admin operations UI
22A E2E
22B observability/security/performance
```

## 6. Cross-Phase Architecture Rules

Data:

- Add `city_code` to every business table.
- Use external ids only under scoped unique constraints, for example `(city_code, business_client_id, external_order_id)`.
- Store snapshots at workflow boundaries: quote snapshot, fee snapshot, worker assignment snapshot, evidence snapshot, liability decision snapshot.

Backend:

- Types -> validators -> backend -> api-client -> frontend.
- New modules must live under `backend/src/<domain>`.
- Provider envelopes live under backend provider-facing modules, but mock/local providers must be default for local development.
- Events must use outbox, not direct cross-module mutation.

Frontend:

- Use `@xlb/api-client` only.
- Use shared `@xlb/ui` where possible.
- Operational pages may show "not configured" for unavailable external providers, but must not show fake paid/geocoded/provider-success states.

Tests:

- Each phase needs unit + contract + integration tests.
- Any customer/worker/admin action needs at least one E2E or browser smoke by Phase 21.
- Provider envelopes need signature/idempotency/failure tests even when provider is mock/local.

## 7. Strategic Shortboard Summary

The current XLB shortboard is not ledger or settlement. Those are comparatively strong.

The shortboard is:

- service-product model
- reverse/aftersale workflow
- evidence and media
- enterprise platform layer
- real-shaped dispatch
- operations UI
- production-grade quality gates

Closing these gaps, while keeping payment and map providers behind envelopes, is feasible and does not require throwing away the current architecture.
