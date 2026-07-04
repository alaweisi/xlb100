-- Phase 8B settlement preparation schema reference.
-- See migrations 013_settlement_preparation_foundation.sql,
-- 014_settlement_confirmation.sql, and 015_settlement_payable_readiness.sql.

-- settlement_batches / settlement_items: preparation + confirmation (8B/8C)
-- settlement_payables: payable readiness snapshot only (8D) — not payout/paid
-- settlement_payable_queue: internal queue snapshot only (8E) — not payout/paid
-- worker_receivable_statements / worker_receivable_statement_lines: worker statement snapshot only (8F) — not payout/paid
-- worker_receivable_statement_reviews: internal review record only (8G) — not payout/paid
-- worker_receivable_statement_exports: internal export/archive snapshot only (8H) — not payout/paid
