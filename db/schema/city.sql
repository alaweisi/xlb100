-- Phase 1 city tables (SSOT reference — applied via migrations/001_city_foundation.sql)

CREATE TABLE IF NOT EXISTS cities (
  city_code VARCHAR(64) NOT NULL PRIMARY KEY,
  city_name VARCHAR(128) NOT NULL,
  is_open TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_city_scopes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_user_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  UNIQUE KEY uk_admin_city (admin_user_id, city_code)
);
