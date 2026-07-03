-- Phase 7B: Fulfillment start / complete foundation
-- Depends on: 010_worker_accept_fulfillment_skeleton_foundation.sql

ALTER TABLE fulfillments
  ADD COLUMN completion_note VARCHAR(255) NULL AFTER completed_at,
  ADD CONSTRAINT chk_fulfillments_city_not_global CHECK (city_code <> '__global__');

INSERT INTO schema_migrations (version)
VALUES ('011_fulfillment_start_complete_foundation')
ON DUPLICATE KEY UPDATE version = version;
