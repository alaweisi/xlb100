# Ledger Entry Contract (Phase 8A)

Each completed fulfillment creates three city-scoped CNY entries with
`source_type = fulfillment.completed` and `source_id = fulfillment_id`:

| Account | Direction | Amount | Meaning |
|---------|-----------|--------|---------|
| customer | debit | gross amount | Service consumption accrued |
| platform | credit | platform fee | Platform fee accrued |
| worker | credit | worker receivable | Worker receivable accrued |

Directions describe this Phase 8A accrual model only. Entries do not represent
settlement, payout, withdrawal, refund, aftersale, reversal, or provider split.
