-- P1 Investor Simulation Stage 1: dispatch operational simulation.
-- Adds offer/event tracking and minimal worker availability metadata.

ALTER TABLE dispatch_tasks
  ADD COLUMN attempt_count INT NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN max_attempts INT NOT NULL DEFAULT 3 AFTER attempt_count,
  ADD COLUMN last_reason VARCHAR(255) NULL AFTER max_attempts,
  ADD INDEX idx_dispatch_tasks_city_status_created (city_code, status, created_at),
  ADD INDEX idx_dispatch_tasks_city_status_attempts (city_code, status, attempt_count);

ALTER TABLE worker_profiles
  ADD COLUMN dispatch_status VARCHAR(32) NOT NULL DEFAULT 'available' AFTER status,
  ADD COLUMN is_certified TINYINT NOT NULL DEFAULT 1 AFTER dispatch_status,
  ADD COLUMN distance_km DECIMAL(8, 2) NULL AFTER is_certified,
  ADD INDEX idx_worker_profiles_dispatch_status (dispatch_status),
  ADD INDEX idx_worker_profiles_certified (is_certified);

CREATE TABLE IF NOT EXISTS dispatch_offers (
  offer_id VARCHAR(64) NOT NULL,
  dispatch_task_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'offering',
  distance_km DECIMAL(8, 2) NULL,
  offered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP NULL,
  PRIMARY KEY (offer_id),
  UNIQUE KEY uk_dispatch_offers_task_worker (city_code, dispatch_task_id, worker_id),
  CONSTRAINT fk_dispatch_offers_task
    FOREIGN KEY (dispatch_task_id) REFERENCES dispatch_tasks (dispatch_task_id),
  CONSTRAINT fk_dispatch_offers_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  CONSTRAINT fk_dispatch_offers_worker
    FOREIGN KEY (worker_id) REFERENCES worker_profiles (worker_id),
  CONSTRAINT chk_dispatch_offers_status
    CHECK (status IN ('offering', 'accepted', 'rejected', 'timeout', 'cancelled')),
  INDEX idx_dispatch_offers_city_task_status (city_code, dispatch_task_id, status),
  INDEX idx_dispatch_offers_city_worker_status (city_code, worker_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dispatch_events (
  dispatch_event_id VARCHAR(64) NOT NULL,
  dispatch_task_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (dispatch_event_id),
  CONSTRAINT fk_dispatch_events_task
    FOREIGN KEY (dispatch_task_id) REFERENCES dispatch_tasks (dispatch_task_id),
  CONSTRAINT fk_dispatch_events_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  CONSTRAINT fk_dispatch_events_worker
    FOREIGN KEY (worker_id) REFERENCES worker_profiles (worker_id),
  INDEX idx_dispatch_events_city_task_created (city_code, dispatch_task_id, created_at),
  INDEX idx_dispatch_events_city_type_created (city_code, event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('031_dispatch_simulation_mvp')
ON DUPLICATE KEY UPDATE version = version;
