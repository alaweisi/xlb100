-- Phase 5B demo workers — task pool visibility only, NOT certified workers

INSERT INTO worker_profiles (worker_id, display_name, phone_masked, status) VALUES
  ('worker-demo-hangzhou', '杭州演示师傅', '138****0001', 'active'),
  ('worker-demo-shanghai', '上海演示师傅', '139****0002', 'active'),
  ('worker-demo-beijing', '北京演示师傅', '137****0003', 'active')
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  phone_masked = VALUES(phone_masked),
  status = VALUES(status);

INSERT INTO worker_city_bindings (worker_id, city_code, is_enabled) VALUES
  ('worker-demo-hangzhou', 'hangzhou', 1),
  ('worker-demo-shanghai', 'shanghai', 1),
  ('worker-demo-beijing', 'beijing', 1)
ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled);

INSERT INTO worker_online_status (worker_id, city_code, is_online) VALUES
  ('worker-demo-hangzhou', 'hangzhou', 0),
  ('worker-demo-shanghai', 'shanghai', 0),
  ('worker-demo-beijing', 'beijing', 0)
ON DUPLICATE KEY UPDATE is_online = VALUES(is_online);
