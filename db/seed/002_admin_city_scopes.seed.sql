-- Phase 2 admin city scope seed for local dev / tests
INSERT INTO admin_city_scopes (admin_user_id, city_code) VALUES
  ('admin-hangzhou', 'hangzhou'),
  ('admin-shanghai', 'shanghai'),
  ('admin-global', '__global__')
ON DUPLICATE KEY UPDATE city_code = VALUES(city_code);
