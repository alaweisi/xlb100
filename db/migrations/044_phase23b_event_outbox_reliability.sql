-- Phase 23B: at-least-once event delivery with atomic claims and expiring leases.
-- Every DDL is independently guarded because MySQL DDL auto-commits.

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='processing_started_at')=0,
  'ALTER TABLE event_outbox ADD COLUMN processing_started_at TIMESTAMP(3) NULL AFTER published_at', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='lease_owner')=0,
  'ALTER TABLE event_outbox ADD COLUMN lease_owner VARCHAR(128) NULL AFTER processing_started_at', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='lease_token')=0,
  'ALTER TABLE event_outbox ADD COLUMN lease_token CHAR(36) NULL AFTER lease_owner', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='lease_expires_at')=0,
  'ALTER TABLE event_outbox ADD COLUMN lease_expires_at TIMESTAMP(3) NULL AFTER lease_token', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='attempt_count')=0,
  'ALTER TABLE event_outbox ADD COLUMN attempt_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER lease_expires_at', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='max_attempts')=0,
  'ALTER TABLE event_outbox ADD COLUMN max_attempts INT UNSIGNED NOT NULL DEFAULT 5 AFTER attempt_count', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='available_at')=0,
  'ALTER TABLE event_outbox ADD COLUMN available_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER max_attempts', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='last_error_code')=0,
  'ALTER TABLE event_outbox ADD COLUMN last_error_code VARCHAR(64) NULL AFTER available_at', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='last_error_message')=0,
  'ALTER TABLE event_outbox ADD COLUMN last_error_message VARCHAR(512) NULL AFTER last_error_code', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='last_failed_at')=0,
  'ALTER TABLE event_outbox ADD COLUMN last_failed_at TIMESTAMP(3) NULL AFTER last_error_message', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='dead_lettered_at')=0,
  'ALTER TABLE event_outbox ADD COLUMN dead_lettered_at TIMESTAMP(3) NULL AFTER last_failed_at', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='updated_at')=0,
  'ALTER TABLE event_outbox ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER dead_lettered_at', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='event_outbox' AND index_name='idx_event_outbox_claim')=0,
  'ALTER TABLE event_outbox ADD INDEX idx_event_outbox_claim (city_code, status, available_at, created_at)', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='event_outbox' AND index_name='idx_event_outbox_typed_claim')=0,
  'ALTER TABLE event_outbox ADD INDEX idx_event_outbox_typed_claim (city_code, event_type, status, available_at, created_at)', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='event_outbox' AND index_name='idx_event_outbox_lease_reaper')=0,
  'ALTER TABLE event_outbox ADD INDEX idx_event_outbox_lease_reaper (city_code, status, lease_expires_at)', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE event_outbox
   SET status='dead_letter',
       attempt_count=GREATEST(attempt_count, max_attempts),
       last_error_code=COALESCE(last_error_code, 'LEGACY_FAILED'),
       last_error_message=COALESCE(last_error_message, 'Migrated from legacy failed status'),
       last_failed_at=COALESCE(last_failed_at, created_at),
       dead_lettered_at=COALESCE(dead_lettered_at, created_at)
 WHERE status='failed';

INSERT INTO schema_migrations (version) VALUES ('044_phase23b_event_outbox_reliability')
ON DUPLICATE KEY UPDATE version=version;
