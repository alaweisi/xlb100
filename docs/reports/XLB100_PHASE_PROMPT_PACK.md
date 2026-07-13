# XLB100 Phase Prompt Pack and Parallel-Work Policy

## Non-negotiable concurrency rule

`AGENTS.md` currently makes `G:\xlb100` the only valid repository root. Multiple
Codex/Claude windows therefore share one Git worktree and must **not** write in
parallel. They may run the prompts below concurrently only in `READ_ONLY`
mode and return findings in chat.

One designated integration window may use `WRITE_PHASE0` mode to write the
approved design documents, one task at a time. Real parallel code construction
requires an explicit future amendment to the repository policy that authorizes
isolated worktrees, merge ownership, migration-number reservation, and a
serial Lock order. Do not infer that authorization from this document.

## Shared preamble for every prompt

```text
Project: G:\xlb100
Mode: READ_ONLY by default. Do not change files, migrations, Git state, or
CURRENT_STATE unless the human explicitly changes Mode to WRITE_PHASE0.

Read AGENTS.md and run xlb-session-sync, xlb-context-map,
xlb-current-vs-target, and xlb-phase-boundary. Treat git + CURRENT_STATE +
actual source as facts. Never use old SDJ99 naming or copy types into apps.

For READ_ONLY: inspect only the listed domains and return findings in chat.
For WRITE_PHASE0: write design/report artifacts only; do not create runtime
code, migrations, routes, provider integrations, app pages, mock data, commit,
or update Phase status. Stop after Phase 0 and request human acceptance.

Every future implementation must use @xlb/types -> @xlb/validators -> backend
-> @xlb/api-client -> app, enforce RequestContext/city/role guards, append
migrations only, and use approved Outbox delivery semantics.
```

## Immediate remediation prompts

### R25 — Phase 25 Lock metadata correction

```text
Use the shared preamble. Task: reconcile only Phase 25 Lock metadata.

Inspect docs/CURRENT_STATE.md, docs/reports/PHASE25_GATE8_UNIFIED_ACCEPTANCE_REPORT.md,
docs/governance/phase-registry.json, and tag xlb-phase25-ui-standardization-v1.0.
Find every statement that contradicts the locked Phase 25 truth (for example,
old Gate 1C wording that says acceptance is pending or preflight is blocked).

READ_ONLY output: exact conflicting file/line, correct fact, and whether it is
historical evidence or current-state metadata.
WRITE_PHASE0 output: make the smallest documentation-only correction, preserve
the immutable tag/history, add an explicit correction note rather than rewrite
evidence, run git diff --check, and stop. Do not alter UI/business code.
```

### R14 — production-readiness reassessment

```text
Use the shared preamble. Task: reassess the historical Phase 14 64/100 staging
readiness finding against the locked Phase 25 main tree.

Inspect docs/release/PHASE14_READINESS_REPORT.md, deployment/CI configuration,
observability, security, backup/restore and provider configuration boundaries.
Separate verified present evidence, missing evidence, and external prerequisites.

Do not implement a provider, deployment change, or readiness fix. Produce a
fresh readiness-gap matrix with owner, proof command, and release blocker.
This is independent of Phase 26 design, but real SMS/push or any external
provider may not be enabled until its blockers are resolved.
```

## Phase 26–31 prompts

### Phase 26 — platform foundation design (must run first)

```text
Use the shared preamble. Task: Phase 26 design only; no runtime code.

Inspect backend/src/events, backend/src/events/eventOutbox.ts, dispatch and
ledger consumers, packages/types/src/eventOutbox.ts, support events, auth,
security, observability, pricing, review, and Phase 25 readiness contracts.

Produce a platform-foundation design that fixes the current architectural gap:
event_outbox is a leased work-claim queue, not a multi-subscriber fan-out bus.
Define the approved option for independent Notification, Risk, and Analytics
consumers, including subscriber/delivery ownership, city scope, replay,
ordering, idempotency, retry, dead letter, and migration/backfill plan.

Also produce a five-domain ownership matrix for Notification, Review/Reputation,
Marketing, Risk-Control, and Analytics. State which existing domain owns each
write and which integrations are event-only. Include a Phase 27–31 gate index.
Stop for human acceptance. No migration 054 or module may be created yet.
```

### Phase 27 — Notification

```text
Use the shared preamble. This prompt may begin only after Phase 26's event
delivery decision is accepted.

Inspect backend/src/providers, events, order, support, auth, apps/customer,
apps/worker, packages/types, validators, api-client, and Phase 25 UI contracts.
Confirm that providers are only local/mock object storage and that no SMS/push
provider exists.

Design Notification MVP: templates, user preferences, notification records,
read state, approved event subscriptions, retry/audit, and city/actor privacy.
Define the smallest initial event set from existing Order and Support events.
Distinguish an in-app inbox from external delivery. External SMS/push/WeChat is
not authorized without a separately approved truthful provider envelope.

Do not create backend/src/notification or any app page. Stop after Phase 0
design and request approval for the implementation gate.
```

### Phase 28 — Review to Reputation

```text
Use the shared preamble. Inspect backend/src/review, migration 030,
packages/types/src/review.ts, validators, customer order pages, worker profile
surfaces, worker module, and event contracts.

First record the factual finding: review is a real customer order-review MVP,
not a qualification/content-audit module. It already enforces city, customer,
paid/completed fulfillment, and one review per order.

Design an additive evolution to reputation: dimensions, aggregate read model,
reply/moderation boundaries, visibility, appeal, event payloads, anti-duplicate
and future risk signals. Decide explicitly whether `review` remains the writer
or a compatibility migration is needed. A parallel rating writer or direct
write from review into worker-owned tables is forbidden.

Do not add a rating module, migration, or UI. Stop after Phase 0 design.
```

### Phase 29 — Marketing / coupon engine

```text
Use the shared preamble. Inspect pricing, order quote snapshots, payment,
packages/types/src/campaign.ts, Phase 25 campaign/theme documents, Customer
order-create UI, and Admin operations.

First establish that Phase 25 Campaign is a visual overlay only, not a business
promotion engine. Pricing owns city/SKU base price; order quote snapshots remain
the authoritative money record.

Design an additive marketing domain: coupon definition/grant/eligibility,
reservation/redemption idempotency, discount decision returned to quote flow,
campaign business lifecycle, admin permissions/audit, city scope, and rollback.
Marketing must not directly mutate an order total or reuse a UI theme campaign
as a discount rule.

Do not add coupon tables, pricing changes, routes, or Customer/Admin pages.
Stop after Phase 0 design.
```

### Phase 30 — Risk-Control

```text
Use the shared preamble. This prompt requires the accepted Phase 26 delivery
model; abnormal-rating signals remain optional until Phase 28 is locked.

Inspect security, audit, compliance, governance risk flags, worker finance,
order/payment events, Support ticket APIs, and Admin UI contracts.

Design a business-risk domain separate from security/audit/compliance:
configurable rules, immutable risk events, cases, evidence references, manual
review workflow, Support handoff, Admin permissions, and appeal/audit trail.
The initial actions are observe, record, and manual review only. Automatic
account/order/fund/worker punishment is expressly out of scope.

Do not add backend/src/risk-control, migrations, event consumers, or Admin UI.
Stop after Phase 0 design.
```

### Phase 31 — Analytics / BI

```text
Use the shared preamble. Inspect observability metrics, order/dispatch/worker/
support/settlement read models, city/role guards, apps/dashboard, and Phase 25
Dashboard readiness contract.

Establish that Prometheus HTTP metrics are operational-only and intentionally
forbid high-cardinality identifiers. Domain summary endpoints are sources, not
a cross-domain BI platform. apps/dashboard has no src/runtime and remains
readiness-blocked.

Design a city/role-scoped read-only BI architecture: metric dictionary,
authoritative sources, units, time windows, freshness/staleness, retention,
aggregation strategy, privacy, and a phased Dashboard entry contract. Recommend
business-DB read models before an ETL/warehouse unless evidence justifies one.

Do not add dashboard src, BI APIs, realtime transport, fake metrics, or a data
warehouse. Stop after Phase 0 design.
```

## Safe execution matrix

| Window/task | May run now | May write now | Implementation dependency |
| --- | --- | --- | --- |
| R25 Phase 25 metadata | Yes | Only as the single designated writer | None |
| R14 readiness reassessment | Yes | Only as the single designated writer | None |
| Phase 26 | Yes | Only after remediation writer is clean | Must finish before Phase 27–31 implementation |
| Phase 27–31 audits | Yes, READ_ONLY only | No shared-worktree writes | Require accepted Phase 26 design before implementation |
| Phase 27–31 code | No, not concurrently in current root | No | Needs an explicit worktree/merge policy amendment |

Formal phases can have parallel discovery, but their merge and Lock order stays
serial: 26 → 27 → 28 → 29 → 30 → 31. Later modules may start their Phase 0
analysis early; they may not assume an unaccepted predecessor contract.
