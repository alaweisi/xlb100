-- Phase 24C Phase 3: SLA breach idempotency markers and workbench scan indexes.
-- Append-only. Migrations 000-049, historical SLA snapshots, and migration 024 remain unchanged.

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='support_tickets'
    AND column_name='sla_first_response_breached_at')=0,
  'ALTER TABLE support_tickets ADD COLUMN sla_first_response_breached_at TIMESTAMP(3) NULL AFTER first_responded_at',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='support_tickets'
    AND column_name='sla_resolution_breached_at')=0,
  'ALTER TABLE support_tickets ADD COLUMN sla_resolution_breached_at TIMESTAMP(3) NULL AFTER sla_first_response_breached_at',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='support_tickets'
    AND index_name='idx_support_ticket_first_response_sla_scan')=0,
  'ALTER TABLE support_tickets ADD INDEX idx_support_ticket_first_response_sla_scan (city_code,status,first_responded_at,sla_first_response_breached_at,sla_first_response_due_at,ticket_id)',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='support_tickets'
    AND index_name='idx_support_ticket_resolution_sla_scan')=0,
  'ALTER TABLE support_tickets ADD INDEX idx_support_ticket_resolution_sla_scan (city_code,status,sla_resolution_breached_at,sla_resolution_due_at,ticket_id)',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema=DATABASE() AND table_name='support_ticket_events'
    AND constraint_name='chk_support_ticket_event_type' AND constraint_type='CHECK')>0,
  'ALTER TABLE support_ticket_events DROP CHECK chk_support_ticket_event_type',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

ALTER TABLE support_ticket_events ADD CONSTRAINT chk_support_ticket_event_type CHECK (event_type IN (
  'created','commented','assigned','claimed','status_changed','escalated','resolved',
  'reopened','closed','sla_breached'
));

INSERT INTO schema_migrations(version) VALUES ('050_phase24c_support_sla_breach_workbench')
ON DUPLICATE KEY UPDATE version=version;
