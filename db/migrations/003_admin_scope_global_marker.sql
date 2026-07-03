-- Phase 2-Lock: __global__ is an admin scope marker, not a real city
-- Depends on: 002_dal_scope_foundation.sql

ALTER TABLE admin_city_scopes DROP FOREIGN KEY fk_admin_city_scopes_city_code;

DELETE FROM cities WHERE city_code = '__global__';

INSERT INTO schema_migrations (version) VALUES ('003_admin_scope_global_marker')
ON DUPLICATE KEY UPDATE version = version;
