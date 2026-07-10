# TABLES.md — 喜乐帮 / XLB

## Phase 1 tables

| Table | Purpose |
|-------|---------|
| `schema_migrations` | Migration tracking (000_init) |
| `cities` | City registry SSOT (`is_open` flag) |
| `admin_city_scopes` | Admin city scope (RLS foundation) |

## Phase 3 tables (city-scoped config)

| Table | Purpose | city_code |
|-------|---------|-----------|
| `city_configs` | City-level config snapshot | required PK |
| `service_categories` | Service category per city | required |
| `service_items` | Service item per city | required |
| `service_skus` | SKU per city | required |
| `service_sku_profiles` | Phase 16 service-product profile per SKU | required |
| `service_standards` | Phase 16 SKU service standards / warranty rules | required |
| `price_rules` | Price rule per city + sku | required |
| `price_fee_items` | Phase 16 transparent fee breakdown per price rule | required |

**Rules:** all Phase 3 config tables require `city_code`. No `__global__`. No nationwide fallback.

**Official catalog:** Phase 3A-1 — 16 categories / 492 SKUs imported from `docs/catalog/服务类目完整清单.tsv`. Demo seed (`demo_cleaning_*`) disabled by `006_disable_demo_catalog.seed.sql`.

## Phase 4 tables (order / payment / outbox)

| Table | Purpose | city_code |
|-------|---------|-----------|
| `orders` | Customer order with price snapshot | required |
| `order_price_snapshots` | Phase 16 immutable quote breakdown snapshot per order | required |
| `order_reverse_requests` | Phase 17 cancel, reschedule, and reassign request audit | required |
| `aftersale_complaints` | Phase 17 complaint work orders and resolution state | required |
| `aftersale_repair_orders` | Phase 17 complaint-linked repair/rework tasks | required |
| `aftersale_liability_decisions` | Phase 17 immutable complaint liability decision | required |
| `aftersale_compensation_intents` | Phase 17 non-executing compensation/refund intent | required |
| `aftersale_timeline_events` | Phase 17 unified customer-service audit timeline | required |
| `payment_orders` | Mock payment order | required |
| `event_outbox` | Transactional domain events | required |

**Rules:** orders bind official SKU + price_rules snapshot. Payment success writes outbox only — no dispatch in Phase 4.

## Phase 5A tables (dispatch / city stream)

| Table | Purpose | city_code |
|-------|---------|-----------|
| `dispatch_tasks` | City-scoped dispatch task from `order.created` outbox | required |
| `dispatch_offers` | Simulated worker offers for dispatch candidate fan-out | required |
| `dispatch_events` | Dispatch timeline for queued/offered/rejected/timeout/accepted states | required |

**Rules:** dispatch_tasks created only by consuming `event_outbox.order.created`. One task per order. Redis stream per city: `xlb:dispatch:{cityCode}:orders`. No worker assignment in Phase 5A historical baseline.

## P1 Investor Simulation dispatch readiness

`dispatch_tasks` now carries simulation status metadata (`attempt_count`,
`max_attempts`, `last_reason`). Worker matching remains simulated: city,
eligibility, online/available/certified state, and `distance_km` are used only
to produce operationally traceable offers before real map/location/SMS systems
exist.

## Phase 5B tables (worker pool / task pool readiness)

| Table | Purpose | city_code |
|-------|---------|-----------|
| `worker_profiles` | Worker profile (global registry) | N/A (PK worker_id) |
| `worker_city_bindings` | Worker ↔ city binding | required PK part |
| `worker_online_status` | Online status per city | required PK part |

**Rules:** Phase 5B task pool reads `dispatch_tasks` (status=queued) read-only. No accept, no worker assignment on dispatch_tasks.

## Phase 6 tables (certification / eligibility)

| Table | Purpose | city_code |
|-------|---------|-----------|
| `worker_certifications` | Worker certification applications | required |
| `service_qualification_rules` | SKU required cert types per city | required |
| `worker_qualifications` | Worker eligibility snapshot per sku | required PK part |

**Rules:** Phase 6 computes eligibility only. No accept, no dispatch_tasks mutation, no fulfillment.

## Phase 7A tables (accept / fulfillment skeleton)

| Table | Purpose | city_code |
|-------|---------|-----------|
| `worker_task_acceptances` | Worker accept record per dispatch_task | required |
| `fulfillments` | Fulfillment skeleton (status=accepted in 7A) | required |

**Rules:** Accept requires eligibility. One acceptance per dispatch_task. dispatch_tasks.status updated to accepted only (no worker_id column). No start/complete in Phase 7A.

## Phase 7B fulfillment lifecycle

`fulfillments` advances only through `accepted → in_progress → completed` for the
owning worker and city. `completion_note` is optional text only. Completion does
not mutate orders or payment orders and does not create ledger, settlement,
payout, refund, or aftersale records.

## Phase 8A ledger accrual foundation

| Table | Purpose | city_code |
|-------|---------|-----------|
| `ledger_accounts` | Platform, worker, and customer accrual accounts | required |
| `ledger_entries` | Immutable entries sourced only from `fulfillment.completed` | required |
| `ledger_accruals` | One gross/fee/receivable snapshot per completed fulfillment | required |

**Rules:** Phase 8A records accruals only. It does not settle, pay out, withdraw,
refund, reverse, or mutate order/payment/fulfillment state.

## Phase 8B settlement preparation foundation

| Table | Purpose | city_code |
|-------|---------|-----------|
| `settlement_batches` | Totals for one city-scoped preparation run | required |
| `settlement_items` | One immutable preparation snapshot per ledger accrual | required |

**Rules:** items originate only from `ledger_accruals`; one accrual can appear in
only one item. Prepared means ready for later review, not that money moved.

## Phase 8C settlement confirmation foundation

`settlement_batches` and their items transition atomically from `prepared` to
`confirmed`. The batch records `confirmed_at` and `confirmed_by` and emits one
`settlement.confirmed` event. Confirmation is an administrative audit state and
does not change amounts, upstream states, or ledger entries.

## Phase 8D settlement payable readiness foundation

| Table | Purpose | city_code |
|-------|---------|-----------|
| `settlement_payables` | One payable readiness snapshot per confirmed batch | required |

**Rules:** payable readiness is not payout, paid settlement, or funds movement.
Items must originate from a `confirmed` batch with matching item snapshots.
One batch maps to one payable row. Emits `settlement.payable` outbox only.
Does not mutate ledger entries, orders, payments, fulfillments, or accruals.

## Phase 8E settlement payable queue foundation

| Table | Purpose | city_code |
|-------|---------|-----------|
| `settlement_payable_queue` | One internal queue snapshot per payable readiness row | required |

**Rules:** queue is not payout, paid settlement, or funds movement. Input must be
`settlement_payables.status = payable`. One payable maps to one queue row.
Emits `settlement.payable.queued` outbox only. Does not mutate payables, batches,
items, ledger entries, or upstream domain state.

## Phase 8F worker receivable statement foundation

| Table | Purpose | city_code |
|-------|---------|-----------|
| `worker_receivable_statements` | One worker receivable snapshot per queued payable per worker | required |
| `worker_receivable_statement_lines` | Immutable settlement item snapshot per statement line | required |

**Rules:** worker receivable statements are not payout, paid settlement, or funds
movement. Input must be `settlement_payable_queue.status = queued`. One statement
per `(queue_id, worker_id)`. Emits `worker.receivable.statement.created` outbox only.
Does not mutate queue, payables, batches, items, ledger entries, or upstream domain state.
