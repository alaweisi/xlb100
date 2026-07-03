-- Phase 3: CityConfig + Catalog + Pricing foundation
-- Depends on: 003_admin_scope_global_marker.sql

CREATE TABLE IF NOT EXISTS city_configs (
  city_code VARCHAR(64) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  is_open TINYINT(1) NOT NULL DEFAULT 1,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai',
  service_enabled TINYINT(1) NOT NULL DEFAULT 1,
  pricing_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (city_code),
  CONSTRAINT fk_city_configs_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  CONSTRAINT chk_city_configs_city_code_format CHECK (city_code REGEXP '^[a-z0-9_-]+$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_categories (
  category_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (category_id, city_code),
  CONSTRAINT fk_service_categories_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  INDEX idx_service_categories_city_code (city_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_items (
  item_id VARCHAR(64) NOT NULL,
  category_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id, city_code),
  CONSTRAINT fk_service_items_category
    FOREIGN KEY (category_id, city_code) REFERENCES service_categories (category_id, city_code),
  INDEX idx_service_items_city_code (city_code),
  INDEX idx_service_items_category (category_id, city_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_skus (
  sku_id VARCHAR(64) NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  unit VARCHAR(32) NOT NULL DEFAULT 'session',
  sort_order INT NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (sku_id, city_code),
  CONSTRAINT fk_service_skus_item
    FOREIGN KEY (item_id, city_code) REFERENCES service_items (item_id, city_code),
  INDEX idx_service_skus_city_code (city_code),
  INDEX idx_service_skus_item (item_id, city_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS price_rules (
  price_rule_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  sku_id VARCHAR(64) NOT NULL,
  base_price DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
  version INT NOT NULL DEFAULT 1,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (price_rule_id, city_code),
  CONSTRAINT fk_price_rules_sku
    FOREIGN KEY (sku_id, city_code) REFERENCES service_skus (sku_id, city_code),
  INDEX idx_price_rules_city_code (city_code),
  INDEX idx_price_rules_sku (sku_id, city_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('004_cityconfig_catalog_pricing_foundation')
ON DUPLICATE KEY UPDATE version = version;
