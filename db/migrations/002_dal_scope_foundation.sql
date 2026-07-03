-- Phase 2: DAL scope foundation indexes
-- Depends on: 001_city_foundation.sql

CREATE INDEX idx_admin_city_scopes_user ON admin_city_scopes (admin_user_id);
CREATE INDEX idx_admin_city_scopes_city ON admin_city_scopes (city_code);
CREATE INDEX idx_cities_is_open ON cities (is_open);

INSERT INTO schema_migrations (version) VALUES ('002_dal_scope_foundation')
ON DUPLICATE KEY UPDATE version = version;
