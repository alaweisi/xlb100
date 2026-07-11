-- Phase 23C: three-app frontend engineering boundary marker.
-- This phase changes frontend composition only and intentionally owns no schema DDL.
INSERT INTO schema_migrations (version)
VALUES ('045_phase23c_frontend_engineering')
ON DUPLICATE KEY UPDATE version = version;
