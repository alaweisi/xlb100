-- Local/demo headquarters OA identity. Production must provision its own identity
-- and explicit __global__ scope through an audited administration process.
INSERT INTO admin_users (id, username, role, city_scopes_json) VALUES
  ('oa-headquarters-admin', 'oa_global', 'admin', '["__global__"]')
ON DUPLICATE KEY UPDATE
  role = VALUES(role),
  city_scopes_json = VALUES(city_scopes_json);

INSERT INTO admin_city_scopes (admin_user_id, city_code) VALUES
  ('oa-headquarters-admin', '__global__')
ON DUPLICATE KEY UPDATE city_code = VALUES(city_code);
