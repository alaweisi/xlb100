-- Phase 5B: Worker pool + task pool readiness foundation
-- Depends on: 007_dispatch_outbox_city_stream_foundation.sql

CREATE TABLE IF NOT EXISTS worker_profiles (
  worker_id VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  phone_masked VARCHAR(64) NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (worker_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS worker_city_bindings (
  worker_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  is_enabled TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (worker_id, city_code),
  CONSTRAINT fk_worker_city_bindings_worker
    FOREIGN KEY (worker_id) REFERENCES worker_profiles (worker_id),
  CONSTRAINT fk_worker_city_bindings_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  INDEX idx_worker_city_bindings_city_code (city_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS worker_online_status (
  worker_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  is_online TINYINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (worker_id, city_code),
  CONSTRAINT fk_worker_online_status_worker
    FOREIGN KEY (worker_id) REFERENCES worker_profiles (worker_id),
  CONSTRAINT fk_worker_online_status_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  INDEX idx_worker_online_status_city_code (city_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('008_worker_pool_taskpool_readiness_foundation')
ON DUPLICATE KEY UPDATE version = version;
