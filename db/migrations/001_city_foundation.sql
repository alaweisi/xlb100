-- Phase 1: city foundation
-- Depends on: 000_init.sql

CREATE TABLE IF NOT EXISTS cities (
  city_code VARCHAR(64) NOT NULL,
  city_name VARCHAR(128) NOT NULL,
  is_open TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (city_code),
  CONSTRAINT chk_cities_city_code_format CHECK (city_code REGEXP '^[a-z0-9_-]+$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_city_scopes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_user_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_admin_city (admin_user_id, city_code),
  CONSTRAINT fk_admin_city_scopes_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('001_city_foundation')
ON DUPLICATE KEY UPDATE version = version;
