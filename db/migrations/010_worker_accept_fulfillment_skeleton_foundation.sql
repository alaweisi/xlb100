-- Phase 7A: Worker accept + fulfillment skeleton foundation
-- Depends on: 009_certification_worker_eligibility_foundation.sql

CREATE TABLE IF NOT EXISTS worker_task_acceptances (
  acceptance_id VARCHAR(64) NOT NULL,
  dispatch_task_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  sku_id VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (acceptance_id),
  UNIQUE KEY uk_worker_task_acceptances_dispatch_task (dispatch_task_id),
  CONSTRAINT fk_worker_task_acceptances_worker
    FOREIGN KEY (worker_id) REFERENCES worker_profiles (worker_id),
  CONSTRAINT fk_worker_task_acceptances_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  INDEX idx_worker_task_acceptances_city_code (city_code),
  INDEX idx_worker_task_acceptances_worker_id (worker_id),
  INDEX idx_worker_task_acceptances_order_id (order_id),
  INDEX idx_worker_task_acceptances_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fulfillments (
  fulfillment_id VARCHAR(64) NOT NULL,
  acceptance_id VARCHAR(64) NOT NULL,
  dispatch_task_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  sku_id VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (fulfillment_id),
  UNIQUE KEY uk_fulfillments_acceptance (acceptance_id),
  UNIQUE KEY uk_fulfillments_dispatch_task (dispatch_task_id),
  CONSTRAINT fk_fulfillments_acceptance
    FOREIGN KEY (acceptance_id) REFERENCES worker_task_acceptances (acceptance_id),
  CONSTRAINT fk_fulfillments_worker
    FOREIGN KEY (worker_id) REFERENCES worker_profiles (worker_id),
  CONSTRAINT fk_fulfillments_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  INDEX idx_fulfillments_city_code (city_code),
  INDEX idx_fulfillments_worker_id (worker_id),
  INDEX idx_fulfillments_order_id (order_id),
  INDEX idx_fulfillments_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('010_worker_accept_fulfillment_skeleton_foundation')
ON DUPLICATE KEY UPDATE version = version;
