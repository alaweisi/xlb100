-- Phase 3 demo pricing seed — CNY only for demo_cleaning_sku

INSERT INTO price_rules (price_rule_id, city_code, sku_id, base_price, currency, version, is_enabled) VALUES
  ('demo_price_hangzhou', 'hangzhou', 'demo_cleaning_sku', 99.00, 'CNY', 1, 1),
  ('demo_price_shanghai', 'shanghai', 'demo_cleaning_sku', 109.00, 'CNY', 1, 1),
  ('demo_price_beijing', 'beijing', 'demo_cleaning_sku', 119.00, 'CNY', 1, 1)
ON DUPLICATE KEY UPDATE
  base_price = VALUES(base_price),
  currency = VALUES(currency),
  version = VALUES(version),
  is_enabled = VALUES(is_enabled);
