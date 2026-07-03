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
| `price_rules` | Price rule per city + sku | required |

**Rules:** all Phase 3 config tables require `city_code`. No `__global__`. No nationwide fallback.

**Official catalog:** Phase 3A-1 — 16 categories / 492 SKUs imported from `docs/catalog/服务类目完整清单.tsv`. Demo seed (`demo_cleaning_*`) disabled by `006_disable_demo_catalog.seed.sql`.

## Phase 4 tables (order / payment / outbox)

| Table | Purpose | city_code |
|-------|---------|-----------|
| `orders` | Customer order with price snapshot | required |
| `payment_orders` | Mock payment order | required |
| `event_outbox` | Transactional domain events | required |

**Rules:** orders bind official SKU + price_rules snapshot. Payment success writes outbox only — no dispatch in Phase 4.

## Phase 5A tables (dispatch / city stream)

| Table | Purpose | city_code |
|-------|---------|-----------|
| `dispatch_tasks` | City-scoped dispatch task from `order.paid` outbox | required |

**Rules:** dispatch_tasks created only by consuming `event_outbox.order.paid`. One task per order. Redis stream per city: `xlb:dispatch:{cityCode}:orders`. No worker assignment in Phase 5A.

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
