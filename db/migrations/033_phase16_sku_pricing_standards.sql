-- Phase 16: SKU productization, transparent fee items, and service standards.
-- Depends on: 032_customer_admin_fks_worker_finance.sql

CREATE TABLE IF NOT EXISTS service_sku_profiles (
  sku_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  service_mode VARCHAR(32) NOT NULL,
  brand_scope VARCHAR(128) NULL,
  model_scope VARCHAR(128) NULL,
  skill_level VARCHAR(32) NOT NULL DEFAULT 'basic',
  warranty_days INT NOT NULL DEFAULT 30,
  requires_model TINYINT(1) NOT NULL DEFAULT 0,
  requires_measurement TINYINT(1) NOT NULL DEFAULT 0,
  supports_enterprise TINYINT(1) NOT NULL DEFAULT 1,
  service_guarantee_text VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (sku_id, city_code),
  CONSTRAINT fk_service_sku_profiles_sku
    FOREIGN KEY (sku_id, city_code) REFERENCES service_skus (sku_id, city_code),
  CONSTRAINT chk_service_sku_profiles_city_code CHECK (city_code <> '__global__'),
  CONSTRAINT chk_service_sku_profiles_mode CHECK (service_mode IN (
    'installation', 'repair', 'cleaning', 'delivery',
    'measurement', 'dismantle', 'maintenance', 'inspection'
  )),
  CONSTRAINT chk_service_sku_profiles_skill CHECK (skill_level IN (
    'basic', 'advanced', 'specialist'
  )),
  CONSTRAINT chk_service_sku_profiles_warranty CHECK (warranty_days >= 0),
  INDEX idx_service_sku_profiles_city_mode (city_code, service_mode),
  INDEX idx_service_sku_profiles_city_skill (city_code, skill_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_standards (
  standard_id VARCHAR(64) NOT NULL,
  sku_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  standard_type VARCHAR(32) NOT NULL,
  title VARCHAR(128) NOT NULL,
  content TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (standard_id, city_code),
  CONSTRAINT fk_service_standards_sku
    FOREIGN KEY (sku_id, city_code) REFERENCES service_skus (sku_id, city_code),
  CONSTRAINT chk_service_standards_city_code CHECK (city_code <> '__global__'),
  CONSTRAINT chk_service_standards_type CHECK (standard_type IN (
    'installation', 'repair', 'inspection', 'material', 'safety', 'warranty'
  )),
  INDEX idx_service_standards_sku (sku_id, city_code),
  INDEX idx_service_standards_city_type (city_code, standard_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS price_fee_items (
  fee_item_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  price_rule_id VARCHAR(64) NOT NULL,
  sku_id VARCHAR(64) NOT NULL,
  fee_code VARCHAR(64) NOT NULL,
  fee_name VARCHAR(128) NOT NULL,
  fee_type VARCHAR(32) NOT NULL,
  charge_method VARCHAR(32) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  min_amount DECIMAL(12, 2) NULL,
  max_amount DECIMAL(12, 2) NULL,
  unit VARCHAR(32) NULL,
  is_optional TINYINT(1) NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (fee_item_id, city_code),
  CONSTRAINT fk_price_fee_items_rule
    FOREIGN KEY (price_rule_id, city_code) REFERENCES price_rules (price_rule_id, city_code),
  CONSTRAINT fk_price_fee_items_sku
    FOREIGN KEY (sku_id, city_code) REFERENCES service_skus (sku_id, city_code),
  CONSTRAINT chk_price_fee_items_city_code CHECK (city_code <> '__global__'),
  CONSTRAINT chk_price_fee_items_type CHECK (fee_type IN (
    'base', 'labor', 'material', 'floor', 'distance', 'urgent',
    'night', 'dismantle', 'diagnosis', 'enterprise_adjustment'
  )),
  CONSTRAINT chk_price_fee_items_charge CHECK (charge_method IN (
    'fixed', 'per_unit', 'range', 'onsite_quote', 'included'
  )),
  CONSTRAINT chk_price_fee_items_amounts CHECK (
    amount >= 0
    AND (min_amount IS NULL OR min_amount >= 0)
    AND (max_amount IS NULL OR max_amount >= 0)
    AND (min_amount IS NULL OR max_amount IS NULL OR max_amount >= min_amount)
  ),
  UNIQUE KEY uq_price_fee_items_code (price_rule_id, city_code, fee_code),
  INDEX idx_price_fee_items_sku (sku_id, city_code),
  INDEX idx_price_fee_items_rule_sort (price_rule_id, city_code, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_price_snapshots (
  order_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  quote_snapshot JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (order_id, city_code),
  CONSTRAINT fk_order_price_snapshots_order
    FOREIGN KEY (order_id) REFERENCES orders (order_id),
  CONSTRAINT fk_order_price_snapshots_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  CONSTRAINT chk_order_price_snapshots_city_code CHECK (city_code <> '__global__'),
  INDEX idx_order_price_snapshots_city_created (city_code, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO service_sku_profiles (
  sku_id, city_code, service_mode, brand_scope, model_scope, skill_level,
  warranty_days, requires_model, requires_measurement, supports_enterprise,
  service_guarantee_text
)
SELECT
  s.sku_id,
  s.city_code,
  CASE
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '安装|挂装|组装|装配' THEN 'installation'
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '维修|修补|疏通|补漏|更换|换|翻新' THEN 'repair'
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '清洗|保洁|清洁|养护' THEN 'cleaning'
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '配送|搬运|搬家|上楼|运输' THEN 'delivery'
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '量尺|测量|勘测' THEN 'measurement'
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '拆旧|拆卸|拆除' THEN 'dismantle'
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '维保|保养|巡检' THEN 'maintenance'
    ELSE 'inspection'
  END AS service_mode,
  CASE
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '家电|空调|冰箱|洗衣机|电视|热水器|燃气灶|油烟机|智能锁|净水器'
      THEN 'appliance_or_device_brand'
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '家具|卫浴|灯具|门窗|窗帘'
      THEN 'home_product_brand'
    ELSE NULL
  END AS brand_scope,
  CASE
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '家电|空调|冰箱|洗衣机|电视|热水器|燃气灶|油烟机|智能锁|净水器|家具|卫浴|灯具'
      THEN 'brand_model_or_size_required_when_available'
    ELSE NULL
  END AS model_scope,
  CASE
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '燃气|电路|水电|高空|防水|补漏|中央空调' THEN 'specialist'
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '安装|维修|更换|拆卸|翻新|疏通' THEN 'advanced'
    ELSE 'basic'
  END AS skill_level,
  CASE
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '维修|修补|防水|补漏|安装|更换' THEN 90
    ELSE 30
  END AS warranty_days,
  CASE
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '家电|空调|冰箱|洗衣机|电视|热水器|燃气灶|油烟机|智能锁|净水器|家具|卫浴|灯具'
      THEN 1
    ELSE 0
  END AS requires_model,
  CASE
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '定制|门窗|窗帘|地板|墙面|防水|面积|量尺|测量'
      THEN 1
    ELSE 0
  END AS requires_measurement,
  1 AS supports_enterprise,
  CASE
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '维修|修补|防水|补漏' THEN '标准报价、故障说明、服务节点留痕，质保期内按责任规则处理'
    WHEN CONCAT_WS(' ', c.name, i.name, i.item_path, s.name) REGEXP '安装|组装|挂装' THEN '安装前核验型号与现场条件，完工后交付验收标准'
    ELSE '明码标价、服务节点留痕、异常可进入售后处理'
  END AS service_guarantee_text
FROM service_skus s
JOIN service_items i ON i.item_id = s.item_id AND i.city_code = s.city_code
JOIN service_categories c ON c.category_id = i.category_id AND c.city_code = i.city_code
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
  CONCAT('std_', SUBSTRING(MD5(CONCAT(s.city_code, ':', s.sku_id, ':precheck')), 1, 24)),
  s.sku_id,
  s.city_code,
  'inspection',
  '服务前核验',
  '师傅接单后需核验服务地址、预约时间、服务SKU、现场条件；涉及品牌/型号/尺寸的服务需记录客户提供的信息。',
  10,
  1,
  1
FROM service_skus s
WHERE s.is_enabled = 1
ON DUPLICATE KEY UPDATE content = VALUES(content), is_enabled = 1;

INSERT INTO service_standards (
  standard_id, sku_id, city_code, standard_type, title, content,
  sort_order, is_required, is_enabled
)
SELECT
  CONCAT('std_', SUBSTRING(MD5(CONCAT(p.city_code, ':', p.sku_id, ':operation')), 1, 24)),
  p.sku_id,
  p.city_code,
  CASE
    WHEN p.service_mode = 'installation' THEN 'installation'
    WHEN p.service_mode IN ('repair', 'dismantle', 'maintenance') THEN 'repair'
    ELSE 'inspection'
  END,
  '作业标准',
  CASE
    WHEN p.service_mode = 'installation' THEN '按产品安装要求完成固定、调试、清洁和安全检查，完工后向客户说明使用注意事项。'
    WHEN p.service_mode = 'repair' THEN '先检测并说明故障原因和费用构成，经客户确认后维修，替换材料需留痕。'
    WHEN p.service_mode = 'cleaning' THEN '按服务范围完成拆洗/清洁/复位，保护客户现场并清理作业残留。'
    WHEN p.service_mode = 'delivery' THEN '核对货物、地址和搬运路径，异常破损或无法入户需及时回传。'
    WHEN p.service_mode = 'measurement' THEN '按约定测量点位记录尺寸，照片/备注需可追溯。'
    WHEN p.service_mode = 'dismantle' THEN '拆卸前确认风险和保留件，拆后清理现场并交接旧件。'
    ELSE '按平台服务节点完成确认、作业、交付和异常回传。'
  END,
  20,
  1,
  1
FROM service_sku_profiles p
ON DUPLICATE KEY UPDATE content = VALUES(content), is_enabled = 1;

INSERT INTO service_standards (
  standard_id, sku_id, city_code, standard_type, title, content,
  sort_order, is_required, is_enabled
)
SELECT
  CONCAT('std_', SUBSTRING(MD5(CONCAT(p.city_code, ':', p.sku_id, ':warranty')), 1, 24)),
  p.sku_id,
  p.city_code,
  'warranty',
  '质保与售后',
  CONCAT('该SKU默认质保 ', p.warranty_days, ' 天；服务争议需依据费用明细、服务节点和后续履约证据处理。'),
  30,
  1,
  1
FROM service_sku_profiles p
ON DUPLICATE KEY UPDATE content = VALUES(content), is_enabled = 1;

INSERT INTO price_fee_items (
  fee_item_id, city_code, price_rule_id, sku_id, fee_code, fee_name,
  fee_type, charge_method, amount, min_amount, max_amount, unit,
  is_optional, is_enabled, sort_order
)
SELECT
  CONCAT('fee_', SUBSTRING(MD5(CONCAT(pr.city_code, ':', pr.price_rule_id, ':base')), 1, 24)),
  pr.city_code,
  pr.price_rule_id,
  pr.sku_id,
  'base_service_fee',
  '基础服务费',
  'base',
  'fixed',
  pr.base_price,
  pr.min_price,
  pr.max_price,
  ss.unit,
  0,
  1,
  10
FROM price_rules pr
JOIN service_skus ss ON ss.sku_id = pr.sku_id AND ss.city_code = pr.city_code
WHERE pr.is_enabled = 1
ON DUPLICATE KEY UPDATE
  fee_name = VALUES(fee_name),
  amount = VALUES(amount),
  min_amount = VALUES(min_amount),
  max_amount = VALUES(max_amount),
  unit = VALUES(unit),
  is_enabled = 1;

INSERT INTO price_fee_items (
  fee_item_id, city_code, price_rule_id, sku_id, fee_code, fee_name,
  fee_type, charge_method, amount, min_amount, max_amount, unit,
  is_optional, is_enabled, sort_order
)
SELECT
  CONCAT('fee_', SUBSTRING(MD5(CONCAT(pr.city_code, ':', pr.price_rule_id, ':material')), 1, 24)),
  pr.city_code,
  pr.price_rule_id,
  pr.sku_id,
  'material_fee',
  '材料费',
  'material',
  'onsite_quote',
  0,
  NULL,
  NULL,
  NULL,
  1,
  1,
  20
FROM price_rules pr
WHERE pr.is_enabled = 1
ON DUPLICATE KEY UPDATE is_enabled = 1;

INSERT INTO price_fee_items (
  fee_item_id, city_code, price_rule_id, sku_id, fee_code, fee_name,
  fee_type, charge_method, amount, min_amount, max_amount, unit,
  is_optional, is_enabled, sort_order
)
SELECT
  CONCAT('fee_', SUBSTRING(MD5(CONCAT(pr.city_code, ':', pr.price_rule_id, ':floor')), 1, 24)),
  pr.city_code,
  pr.price_rule_id,
  pr.sku_id,
  'floor_or_carry_fee',
  '楼层/搬运附加费',
  'floor',
  'onsite_quote',
  0,
  NULL,
  NULL,
  NULL,
  1,
  1,
  30
FROM price_rules pr
WHERE pr.is_enabled = 1
ON DUPLICATE KEY UPDATE is_enabled = 1;

INSERT INTO price_fee_items (
  fee_item_id, city_code, price_rule_id, sku_id, fee_code, fee_name,
  fee_type, charge_method, amount, min_amount, max_amount, unit,
  is_optional, is_enabled, sort_order
)
SELECT
  CONCAT('fee_', SUBSTRING(MD5(CONCAT(pr.city_code, ':', pr.price_rule_id, ':distance')), 1, 24)),
  pr.city_code,
  pr.price_rule_id,
  pr.sku_id,
  'remote_distance_fee',
  '远程/超服务半径费',
  'distance',
  'onsite_quote',
  0,
  NULL,
  NULL,
  NULL,
  1,
  1,
  40
FROM price_rules pr
WHERE pr.is_enabled = 1
ON DUPLICATE KEY UPDATE is_enabled = 1;

INSERT INTO price_fee_items (
  fee_item_id, city_code, price_rule_id, sku_id, fee_code, fee_name,
  fee_type, charge_method, amount, min_amount, max_amount, unit,
  is_optional, is_enabled, sort_order
)
SELECT
  CONCAT('fee_', SUBSTRING(MD5(CONCAT(pr.city_code, ':', pr.price_rule_id, ':urgent')), 1, 24)),
  pr.city_code,
  pr.price_rule_id,
  pr.sku_id,
  'urgent_fee',
  '加急服务费',
  'urgent',
  'onsite_quote',
  0,
  NULL,
  NULL,
  NULL,
  1,
  1,
  50
FROM price_rules pr
WHERE pr.is_enabled = 1
ON DUPLICATE KEY UPDATE is_enabled = 1;

INSERT INTO price_fee_items (
  fee_item_id, city_code, price_rule_id, sku_id, fee_code, fee_name,
  fee_type, charge_method, amount, min_amount, max_amount, unit,
  is_optional, is_enabled, sort_order
)
SELECT
  CONCAT('fee_', SUBSTRING(MD5(CONCAT(pr.city_code, ':', pr.price_rule_id, ':diagnosis')), 1, 24)),
  pr.city_code,
  pr.price_rule_id,
  pr.sku_id,
  'diagnosis_fee',
  '检测/诊断费',
  'diagnosis',
  'included',
  0,
  NULL,
  NULL,
  NULL,
  0,
  1,
  60
FROM price_rules pr
JOIN service_sku_profiles p ON p.sku_id = pr.sku_id AND p.city_code = pr.city_code
WHERE pr.is_enabled = 1 AND p.service_mode IN ('repair', 'maintenance', 'inspection')
ON DUPLICATE KEY UPDATE is_enabled = 1;

INSERT INTO schema_migrations (version) VALUES ('033_phase16_sku_pricing_standards')
ON DUPLICATE KEY UPDATE version = version;
