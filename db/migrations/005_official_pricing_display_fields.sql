-- Phase 3A-1: Official pricing display fields + service item path
-- Depends on: 004_cityconfig_catalog_pricing_foundation.sql

ALTER TABLE service_items
  ADD COLUMN item_path VARCHAR(512) NULL AFTER name;

ALTER TABLE price_rules
  ADD COLUMN price_text VARCHAR(255) NOT NULL DEFAULT '' AFTER base_price,
  ADD COLUMN price_type VARCHAR(32) NOT NULL DEFAULT 'fixed' AFTER price_text,
  ADD COLUMN min_price DECIMAL(10, 2) NULL AFTER price_type,
  ADD COLUMN max_price DECIMAL(10, 2) NULL AFTER min_price,
  ADD COLUMN pricing_note VARCHAR(255) NULL AFTER max_price;

INSERT INTO schema_migrations (version) VALUES ('005_official_pricing_display_fields')
ON DUPLICATE KEY UPDATE version = version;
