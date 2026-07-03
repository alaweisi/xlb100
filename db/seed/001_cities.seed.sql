-- Phase 1 city seed — run after 001_city_foundation.sql
INSERT INTO cities (city_code, city_name, is_open) VALUES
  ('hangzhou', '杭州', 1),
  ('shanghai', '上海', 1),
  ('beijing', '北京', 1),
  ('__global__', 'Global Admin Scope Marker', 0)
ON DUPLICATE KEY UPDATE city_name = VALUES(city_name), is_open = VALUES(is_open);
