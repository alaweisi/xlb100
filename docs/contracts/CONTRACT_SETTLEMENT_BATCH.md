# Settlement Batch Contract (Phase 8B)

A batch belongs to exactly one non-global city and has currency `CNY`. Its
status is `prepared`, `confirmed`, or `cancelled`. Phase 8C permits only
`prepared → confirmed`; confirmed requires `confirmed_at` and `confirmed_by`.
Totals equal the sums of its items:

- `total_gross_amount = sum(gross_amount)`
- `total_platform_fee = sum(platform_fee)`
- `total_worker_receivable = sum(worker_receivable)`
- `item_count = count(items)`

`prepared` means the accounting snapshot exists; it does not mean any worker
has received money.

`GET /api/internal/settlement/batches` lists only the request city.
