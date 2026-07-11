-- Phase 23D: query-path indexes proven with EXPLAIN ANALYZE.
-- Phase 23B already owns the non-duplicated Outbox typed-claim and lease-reaper
-- indexes. This append-only migration adds only missing Payment join paths.

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='payment_orders' AND index_name='idx_payment_orders_city_order_status')=0,
  'ALTER TABLE payment_orders ADD INDEX idx_payment_orders_city_order_status (city_code, order_id, status)', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='payment_orders' AND index_name='idx_payment_orders_city_order_created')=0,
  'ALTER TABLE payment_orders ADD INDEX idx_payment_orders_city_order_created (city_code, order_id, created_at DESC)', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

INSERT INTO schema_migrations (version)
VALUES ('046_phase23d_query_path_indexes')
ON DUPLICATE KEY UPDATE version=version;
