-- Reconcile Phase 16 derived records after the authoritative catalog and
-- pricing seeds. Migrations run before seeds on a fresh database, so the
-- original migration-time SELECTs cannot see the official SKU rows.

INSERT INTO service_sku_profiles (
  sku_id, city_code, service_mode, brand_scope, model_scope, skill_level,
  warranty_days, requires_model, requires_measurement, supports_enterprise,
  service_guarantee_text
)
SELECT
  s.sku_id,
  s.city_code,
  CASE
    WHEN s.sku_id REGEXP 'install|assembly|mount' THEN 'installation'
    WHEN s.sku_id REGEXP 'repair|fix|replace' THEN 'repair'
    WHEN s.sku_id REGEXP 'clean|daily|deep|mite' THEN 'cleaning'
    WHEN s.sku_id REGEXP 'delivery|moving|carry' THEN 'delivery'
    WHEN s.sku_id REGEXP 'measure|survey' THEN 'measurement'
    WHEN s.sku_id REGEXP 'dismantle|remove' THEN 'dismantle'
    WHEN s.sku_id REGEXP 'maintenance|check' THEN 'maintenance'
    ELSE 'inspection'
  END,
  CASE WHEN s.sku_id REGEXP 'ac_|washer|fridge|waterheater|hood|stove|dishwasher|tv_|lock_|furniture'
    THEN 'product_brand_when_available' ELSE NULL END,
  CASE WHEN s.sku_id REGEXP 'ac_|washer|fridge|waterheater|hood|stove|dishwasher|tv_|lock_|furniture'
    THEN 'brand_model_or_size_when_available' ELSE NULL END,
  CASE
    WHEN s.sku_id REGEXP 'gas|electrical|waterproof|highrise|central_ac' THEN 'specialist'
    WHEN s.sku_id REGEXP 'install|repair|replace|dismantle' THEN 'advanced'
    ELSE 'basic'
  END,
  CASE WHEN s.sku_id REGEXP 'install|repair|replace|waterproof' THEN 90 ELSE 30 END,
  CASE WHEN s.sku_id REGEXP 'ac_|washer|fridge|waterheater|hood|stove|dishwasher|tv_|lock_|furniture'
    THEN 1 ELSE 0 END,
  CASE WHEN s.sku_id REGEXP 'custom|window|curtain|floor|wall|waterproof|measure'
    THEN 1 ELSE 0 END,
  1,
  'Transparent quote, traceable service milestones, and after-sales handling under platform rules.'
FROM service_skus s
WHERE s.is_enabled = 1
ON DUPLICATE KEY UPDATE
  service_mode = VALUES(service_mode),
  brand_scope = VALUES(brand_scope),
  model_scope = VALUES(model_scope),
  skill_level = VALUES(skill_level),
  warranty_days = VALUES(warranty_days),
  requires_model = VALUES(requires_model),
  requires_measurement = VALUES(requires_measurement),
  supports_enterprise = VALUES(supports_enterprise),
  service_guarantee_text = VALUES(service_guarantee_text);

INSERT INTO service_standards (
  standard_id, sku_id, city_code, standard_type, title, content,
  sort_order, is_required, is_enabled
)
SELECT
  CONCAT('std_', SUBSTRING(MD5(CONCAT(s.city_code, ':', s.sku_id, ':', t.standard_key)), 1, 24)),
  s.sku_id,
  s.city_code,
  CASE WHEN t.standard_key = 'operation' THEN
    CASE WHEN p.service_mode = 'installation' THEN 'installation'
         WHEN p.service_mode IN ('repair', 'dismantle', 'maintenance') THEN 'repair'
         ELSE 'inspection' END
    ELSE t.standard_type END,
  t.title,
  CASE t.standard_key
    WHEN 'precheck' THEN 'Verify the service address, schedule, SKU, site conditions, and available brand/model information before work.'
    WHEN 'operation' THEN 'Follow the SKU workflow, retain service evidence, report exceptions, and confirm completion with the customer.'
    ELSE CONCAT('Default warranty is ', p.warranty_days, ' days; disputes use quote, milestone, and fulfillment evidence.')
  END,
  t.sort_order,
  1,
  1
FROM service_skus s
JOIN service_sku_profiles p ON p.sku_id = s.sku_id AND p.city_code = s.city_code
CROSS JOIN (
  SELECT 'precheck' AS standard_key, 'inspection' AS standard_type, 'Pre-service verification' AS title, 10 AS sort_order
  UNION ALL SELECT 'operation', 'inspection', 'Service operation standard', 20
  UNION ALL SELECT 'warranty', 'warranty', 'Warranty and after-sales', 30
) t
WHERE s.is_enabled = 1
ON DUPLICATE KEY UPDATE
  standard_type = VALUES(standard_type),
  title = VALUES(title),
  content = VALUES(content),
  sort_order = VALUES(sort_order),
  is_required = 1,
  is_enabled = 1;

INSERT INTO price_fee_items (
  fee_item_id, city_code, price_rule_id, sku_id, fee_code, fee_name,
  fee_type, charge_method, amount, min_amount, max_amount, unit,
  is_optional, is_enabled, sort_order
)
SELECT
  CONCAT('fee_', SUBSTRING(MD5(CONCAT(pr.city_code, ':', pr.price_rule_id, ':', t.fee_code)), 1, 24)),
  pr.city_code,
  pr.price_rule_id,
  pr.sku_id,
  t.fee_code,
  t.fee_name,
  t.fee_type,
  t.charge_method,
  CASE WHEN t.fee_code = 'base_service_fee' THEN pr.base_price ELSE 0 END,
  CASE WHEN t.fee_code = 'base_service_fee' THEN pr.min_price ELSE NULL END,
  CASE WHEN t.fee_code = 'base_service_fee' THEN pr.max_price ELSE NULL END,
  CASE WHEN t.fee_code = 'base_service_fee' THEN ss.unit ELSE NULL END,
  t.is_optional,
  1,
  t.sort_order
FROM price_rules pr
JOIN service_skus ss ON ss.sku_id = pr.sku_id AND ss.city_code = pr.city_code
CROSS JOIN (
  SELECT 'base_service_fee' AS fee_code, 'Base service fee' AS fee_name, 'base' AS fee_type,
         'fixed' AS charge_method, 0 AS is_optional, 10 AS sort_order
  UNION ALL SELECT 'material_fee', 'Material fee', 'material', 'onsite_quote', 1, 20
  UNION ALL SELECT 'floor_or_carry_fee', 'Floor or carrying surcharge', 'floor', 'onsite_quote', 1, 30
  UNION ALL SELECT 'remote_distance_fee', 'Remote distance surcharge', 'distance', 'onsite_quote', 1, 40
  UNION ALL SELECT 'urgent_fee', 'Urgent service surcharge', 'urgent', 'onsite_quote', 1, 50
) t
WHERE pr.is_enabled = 1 AND ss.is_enabled = 1
ON DUPLICATE KEY UPDATE
  fee_name = VALUES(fee_name),
  fee_type = VALUES(fee_type),
  charge_method = VALUES(charge_method),
  amount = VALUES(amount),
  min_amount = VALUES(min_amount),
  max_amount = VALUES(max_amount),
  unit = VALUES(unit),
  is_optional = VALUES(is_optional),
  is_enabled = 1,
  sort_order = VALUES(sort_order);
