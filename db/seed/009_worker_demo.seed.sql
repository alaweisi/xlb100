-- Phase 5B demo workers plus P1 dispatch simulation availability.

INSERT INTO worker_profiles (
  worker_id,
  display_name,
  phone_masked,
  status,
  dispatch_status,
  is_certified,
  distance_km
) VALUES
  ('worker-demo-hangzhou', 'Hangzhou Demo Worker', '138****0001', 'active', 'available', 1, 2.00),
  ('worker-demo-shanghai', 'Shanghai Demo Worker', '139****0002', 'active', 'available', 1, 5.00),
  ('worker-demo-beijing', 'Beijing Demo Worker', '137****0003', 'active', 'available', 1, 8.00)
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  phone_masked = VALUES(phone_masked),
  status = VALUES(status),
  dispatch_status = VALUES(dispatch_status),
  is_certified = VALUES(is_certified),
  distance_km = VALUES(distance_km);

INSERT INTO worker_city_bindings (worker_id, city_code, is_enabled) VALUES
  ('worker-demo-hangzhou', 'hangzhou', 1),
  ('worker-demo-shanghai', 'shanghai', 1),
  ('worker-demo-beijing', 'beijing', 1)
ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled);

INSERT INTO worker_online_status (worker_id, city_code, is_online) VALUES
  ('worker-demo-hangzhou', 'hangzhou', 1),
  ('worker-demo-shanghai', 'shanghai', 0),
  ('worker-demo-beijing', 'beijing', 0)
ON DUPLICATE KEY UPDATE is_online = VALUES(is_online);
