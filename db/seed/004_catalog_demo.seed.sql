-- Phase 3 demo catalog seed — NOT formal service categories
-- demo_cleaning_* only; formal 16 categories require user-approved import

INSERT INTO service_categories (category_id, city_code, name, sort_order, is_enabled) VALUES
  ('demo_cleaning_category', 'hangzhou', 'Demo Cleaning', 1, 1),
  ('demo_cleaning_category', 'shanghai', 'Demo Cleaning', 1, 1),
  ('demo_cleaning_category', 'beijing', 'Demo Cleaning', 1, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order), is_enabled = VALUES(is_enabled);

INSERT INTO service_items (item_id, category_id, city_code, name, sort_order, is_enabled) VALUES
  ('demo_cleaning_item', 'demo_cleaning_category', 'hangzhou', 'Demo Daily Cleaning', 1, 1),
  ('demo_cleaning_item', 'demo_cleaning_category', 'shanghai', 'Demo Daily Cleaning', 1, 1),
  ('demo_cleaning_item', 'demo_cleaning_category', 'beijing', 'Demo Daily Cleaning', 1, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order), is_enabled = VALUES(is_enabled);

INSERT INTO service_skus (sku_id, item_id, city_code, name, unit, sort_order, is_enabled) VALUES
  ('demo_cleaning_sku', 'demo_cleaning_item', 'hangzhou', 'Demo 2h Cleaning', 'session', 1, 1),
  ('demo_cleaning_sku', 'demo_cleaning_item', 'shanghai', 'Demo 2h Cleaning', 'session', 1, 1),
  ('demo_cleaning_sku', 'demo_cleaning_item', 'beijing', 'Demo 2h Cleaning', 'session', 1, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), unit = VALUES(unit), sort_order = VALUES(sort_order), is_enabled = VALUES(is_enabled);
