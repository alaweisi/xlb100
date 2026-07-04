-- Phase 8C: settlement confirmation management/audit state only.
ALTER TABLE settlement_batches
  DROP CHECK chk_settlement_batches_status,
  ADD COLUMN confirmed_at TIMESTAMP NULL AFTER prepared_at,
  ADD COLUMN confirmed_by VARCHAR(64) NULL AFTER confirmed_at,
  ADD CONSTRAINT chk_settlement_batches_status
    CHECK (status IN ('prepared', 'confirmed', 'cancelled')),
  ADD CONSTRAINT chk_settlement_batches_confirmation_audit
    CHECK (
      (status = 'confirmed' AND confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL)
      OR (status <> 'confirmed' AND confirmed_at IS NULL AND confirmed_by IS NULL)
    );

ALTER TABLE settlement_items
  DROP CHECK chk_settlement_items_status,
  ADD CONSTRAINT chk_settlement_items_status
    CHECK (status IN ('prepared', 'confirmed', 'cancelled'));

INSERT INTO schema_migrations(version) VALUES ('014_settlement_confirmation')
ON DUPLICATE KEY UPDATE version=version;
