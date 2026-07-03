-- Phase 6: Certification + worker eligibility foundation
-- Depends on: 008_worker_pool_taskpool_readiness_foundation.sql

CREATE TABLE IF NOT EXISTS worker_certifications (
  certification_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  cert_type VARCHAR(64) NOT NULL,
  cert_name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  reviewer_id VARCHAR(64) NULL,
  reject_reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (certification_id),
  CONSTRAINT fk_worker_certifications_worker
    FOREIGN KEY (worker_id) REFERENCES worker_profiles (worker_id),
  CONSTRAINT fk_worker_certifications_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  INDEX idx_worker_certifications_worker_id (worker_id),
  INDEX idx_worker_certifications_city_code (city_code),
  INDEX idx_worker_certifications_status (status),
  INDEX idx_worker_certifications_cert_type (cert_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_qualification_rules (
  rule_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  sku_id VARCHAR(128) NOT NULL,
  required_cert_type VARCHAR(64) NOT NULL,
  is_required TINYINT NOT NULL DEFAULT 1,
  is_enabled TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (rule_id),
  CONSTRAINT fk_service_qualification_rules_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  UNIQUE KEY uk_service_qualification_rules_city_sku_cert (city_code, sku_id, required_cert_type),
  INDEX idx_service_qualification_rules_city_code (city_code),
  INDEX idx_service_qualification_rules_sku_id (sku_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS worker_qualifications (
  worker_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  sku_id VARCHAR(128) NOT NULL,
  is_eligible TINYINT NOT NULL DEFAULT 0,
  source_certification_id VARCHAR(64) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (worker_id, city_code, sku_id),
  CONSTRAINT fk_worker_qualifications_worker
    FOREIGN KEY (worker_id) REFERENCES worker_profiles (worker_id),
  CONSTRAINT fk_worker_qualifications_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  INDEX idx_worker_qualifications_city_code (city_code),
  INDEX idx_worker_qualifications_sku_id (sku_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('009_certification_worker_eligibility_foundation')
ON DUPLICATE KEY UPDATE version = version;
