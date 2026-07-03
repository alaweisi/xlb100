-- Phase 1 city seed — real cities only (no __global__ marker)
INSERT INTO cities (city_code, city_name, is_open) VALUES
  ('hangzhou', '杭州', 1),
  ('shanghai', '上海', 1),
  ('beijing', '北京', 1)
ON DUPLICATE KEY UPDATE city_name = VALUES(city_name), is_open = VALUES(is_open);
