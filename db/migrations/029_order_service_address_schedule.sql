-- Phase 16 demo experience: order service address + scheduled service time
-- Existing historical orders remain compatible; new order creation requires these fields at API validation.

ALTER TABLE orders
  ADD COLUMN address_province VARCHAR(64) NULL AFTER city_code,
  ADD COLUMN address_city VARCHAR(64) NULL AFTER address_province,
  ADD COLUMN address_district VARCHAR(64) NULL AFTER address_city,
  ADD COLUMN detail_address VARCHAR(255) NULL AFTER address_district,
  ADD COLUMN contact_name VARCHAR(64) NULL AFTER detail_address,
  ADD COLUMN contact_phone VARCHAR(32) NULL AFTER contact_name,
  ADD COLUMN scheduled_at TIMESTAMP NULL AFTER contact_phone,
  ADD COLUMN scheduled_time_slot VARCHAR(32) NULL AFTER scheduled_at,
  ADD INDEX idx_orders_city_scheduled_at (city_code, scheduled_at);

INSERT INTO schema_migrations (version) VALUES ('029_order_service_address_schedule')
ON DUPLICATE KEY UPDATE version = version;
