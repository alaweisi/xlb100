# Fulfillment

The worker-owned lifecycle remains city-scoped: `accepted -> in_progress -> completed`.

Phase 18 adds auditable fulfillment evidence under `evidence/`:

- Workers upload JPEG, PNG, or WebP evidence through a 5 MiB binary endpoint.
- Media is private and stored only through the local filesystem or in-memory mock provider.
- Evidence binds to city, order, fulfillment, and optionally a Phase 17 complaint.
- Completion creates a pending customer-confirmation record with an evidence checksum snapshot.
- Customers can confirm or dispute; a dispute requires a same-order complaint.

The module does not execute payment, refund, ledger, settlement, payout, dispatch assignment, or a real cloud storage provider.
