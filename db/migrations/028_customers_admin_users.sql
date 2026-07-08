-- Phase 14: customers + admin_users foundation
-- Depends on: 027_aftersale_refund_reversal.sql
-- No FK from existing tables yet — added after data validation.

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(64) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(128) NULL,
  avatar_url VARCHAR(512) NULL,
  default_city_code VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_customers_phone (phone),
  INDEX idx_customers_default_city (default_city_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(64) NOT NULL,
  username VARCHAR(64) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'operator',
  city_scopes_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_admin_users_username (username),
  INDEX idx_admin_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('028_customers_admin_users')
ON DUPLICATE KEY UPDATE version=version;
