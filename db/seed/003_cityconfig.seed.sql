-- Phase 3 city config seed — hangzhou / shanghai / beijing only
INSERT INTO city_configs (city_code, version, is_open, timezone, service_enabled, pricing_enabled) VALUES
  ('hangzhou', 1, 1, 'Asia/Shanghai', 1, 1),
  ('shanghai', 1, 1, 'Asia/Shanghai', 1, 1),
  ('beijing', 1, 1, 'Asia/Shanghai', 1, 1)
ON DUPLICATE KEY UPDATE
  version = VALUES(version),
  is_open = VALUES(is_open),
  timezone = VALUES(timezone),
  service_enabled = VALUES(service_enabled),
  pricing_enabled = VALUES(pricing_enabled);
