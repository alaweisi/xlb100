# CITY_CODE_COLUMNS.md — 喜乐帮 / XLB

Phase 1 city foundation. All city-scoped business tables (Phase 2+) **must** include:

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `city_code` | VARCHAR(64) | Yes | Canonical lowercase; FK to `cities.city_code` |

## Phase 1 tables with city_code

| Table | city_code column | Notes |
|-------|------------------|-------|
| `cities` | PK `city_code` | Global registry; uses `is_open` (not `status`) |
| `admin_city_scopes` | FK `city_code` | Admin RLS scope |

## Phase 16-18 competitive gap tables with city_code

| Table | city_code column | Notes |
|-------|------------------|-------|
| `service_sku_profiles` | required FK part | Service-product profile per city SKU |
| `service_standards` | required FK + non-global check | SKU standards and warranty rules |
| `price_fee_items` | required FK + non-global check | Transparent fee items per price rule |
| `order_price_snapshots` | required FK + non-global check | Immutable quote breakdown snapshot |
| `order_reverse_requests` | required FK + non-global check | Customer reverse request and admin review |
| `aftersale_complaints` | required FK + non-global check | Customer ownership and admin scope required |
| `aftersale_repair_orders` | required FK + non-global check | Worker access remains worker-id scoped |
| `aftersale_liability_decisions` | required FK + non-global check | One decision per complaint |
| `aftersale_compensation_intents` | required FK + non-global check | Provider execution remains not_executed |
| `aftersale_timeline_events` | required FK + non-global check | Append-only workflow timeline |
| `media_assets` | required FK + non-global check | Private local/mock storage metadata |
| `fulfillment_evidence` | required FK + non-global check | Fulfillment/order/complaint evidence binding |
| `fulfillment_customer_confirmations` | required FK + non-global check | Customer-owned confirmation/dispute state |

## Phase 5A tables with city_code

| Table | city_code column | Notes |
|-------|------------------|-------|
| `dispatch_tasks` | required FK | One task per order; city-scoped Redis stream |
| `dispatch_offers` | required FK | Simulated offer rows per candidate worker |
| `dispatch_events` | required FK | City-scoped dispatch timeline events |

## Phase 7A tables with city_code

| Table | city_code column | Notes |
|-------|------------------|-------|
| `worker_task_acceptances` | required FK | One acceptance per dispatch_task; worker accept record |
| `fulfillments` | required FK + non-global check | One per acceptance / dispatch_task; lifecycle remains city scoped |

## Rules

## Phase 8A tables with city_code

| Table | city_code column | Notes |
|-------|------------------|-------|
| `ledger_accounts` | required FK + non-global check | Account identity is unique inside a city |
| `ledger_entries` | required FK + non-global check | Accrual entry source stays city scoped |
| `ledger_accruals` | required FK + non-global check | Completed fulfillment accrual snapshot |

## Phase 8B tables with city_code

| Table | city_code column | Notes |
|-------|------------------|-------|
| `settlement_batches` | required FK + non-global check | One preparation run inside one city |
| `settlement_items` | required FK + non-global check | Accrual and batch remain in the same city |

1. No default nationwide `city_code`
2. Admin queries must filter by scoped `city_code`
3. Canonical form: lowercase `[a-z0-9_-]+`

## Phase 19 enterprise tables with city_code

## Phase 20 dispatch tables with city_code

| Table | city_code column | Notes |
| --- | --- | --- |
| `worker_dispatch_preferences` | composite PK/FK | Worker must be bound to the same city |
| `worker_locations` | required composite FK + non-global check | Exact private location expires after ten minutes |

| Table | city_code column | Notes |
|-------|------------------|-------|
| `business_clients` | required FK + non-global check | Enterprise tenant root |
| `business_client_contacts` | required composite FK | Contact belongs to the same client and city |
| `business_api_credentials` | required composite FK | API key resolves city and client server-side |
| `business_agreement_prices` | required composite FKs | Agreement belongs to same client and official city SKU |
| `business_orders` | required composite FKs | External order maps to same-city XLB order |
| `business_webhook_subscriptions` | required composite FK | Callback belongs to one city/client |
| `business_webhook_deliveries` | required composite FKs | Subscription, client, and outbox event share city |
| `enterprise_bill_snapshots` | required composite FK | Monthly snapshot belongs to one city/client |

Migration `038` makes the client dimension part of the agreement/order and subscription/delivery foreign keys, preventing same-city cross-enterprise references.

## Phase 24B support tables with city_code

| Table | city_code column | Notes |
|-------|------------------|-------|
| `support_tickets` | required FK + non-global check | Requester ownership and all domain links are city-scoped; no nationwide fallback |
| `support_ticket_events` | required composite FK | Append-only events must reference a ticket in the same city |
