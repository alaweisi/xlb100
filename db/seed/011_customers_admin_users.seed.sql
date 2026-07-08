-- Phase 14 seed: demo customer + admin users for local dev / tests

INSERT INTO customers (id, phone, name, avatar_url, default_city_code) VALUES
  ('customer-demo-001', '13800000001', '演示用户', NULL, 'hangzhou')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  default_city_code = VALUES(default_city_code);

INSERT INTO admin_users (id, username, role, city_scopes_json) VALUES
  ('admin-hangzhou', 'admin_hz', 'admin', '["hangzhou"]'),
  ('admin-shanghai', 'admin_sh', 'admin', '["shanghai"]'),
  ('admin-global', 'admin_global', 'operator', '["hangzhou","shanghai","beijing"]')
ON DUPLICATE KEY UPDATE
  username = VALUES(username),
  role = VALUES(role),
  city_scopes_json = VALUES(city_scopes_json);
