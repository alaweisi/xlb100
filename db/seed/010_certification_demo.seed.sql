-- Phase 6 demo: certification rules + approved cert for worker-demo-hangzhou
-- Eligibility for sku_home_daily_2h in hangzhou only; NOT accept/assignment.

INSERT INTO service_qualification_rules (
  rule_id, city_code, sku_id, required_cert_type, is_required, is_enabled
) VALUES (
  'rule_hangzhou_sku_home_daily_2h_basic',
  'hangzhou',
  'sku_home_daily_2h',
  'home_service_basic',
  1,
  1
)
ON DUPLICATE KEY UPDATE
  required_cert_type = VALUES(required_cert_type),
  is_required = VALUES(is_required),
  is_enabled = VALUES(is_enabled);

INSERT INTO worker_certifications (
  certification_id,
  worker_id,
  city_code,
  cert_type,
  cert_name,
  status,
  submitted_at,
  reviewed_at,
  reviewer_id,
  reject_reason
) VALUES (
  'cert-demo-hangzhou-basic',
  'worker-demo-hangzhou',
  'hangzhou',
  'home_service_basic',
  '基础上门服务资格',
  'approved',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'admin-hangzhou',
  NULL
)
ON DUPLICATE KEY UPDATE
  status = VALUES(status),
  cert_name = VALUES(cert_name),
  reviewed_at = VALUES(reviewed_at),
  reviewer_id = VALUES(reviewer_id);

INSERT INTO worker_qualifications (
  worker_id,
  city_code,
  sku_id,
  is_eligible,
  source_certification_id
) VALUES (
  'worker-demo-hangzhou',
  'hangzhou',
  'sku_home_daily_2h',
  1,
  'cert-demo-hangzhou-basic'
)
ON DUPLICATE KEY UPDATE
  is_eligible = VALUES(is_eligible),
  source_certification_id = VALUES(source_certification_id);
