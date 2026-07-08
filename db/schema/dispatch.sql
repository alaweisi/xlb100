-- Phase 5A: dispatch_tasks — city-scoped dispatch task from order.paid outbox events
-- Actual DDL: db/migrations/007_dispatch_outbox_city_stream_foundation.sql

CREATE TABLE IF NOT EXISTS dispatch_tasks (
  dispatch_task_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  sku_id VARCHAR(128) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  source_event_id VARCHAR(64) NOT NULL,
  stream_name VARCHAR(255) NOT NULL,
  stream_entry_id VARCHAR(128) NULL,
  status VARCHAR(32) NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (dispatch_task_id),
  CONSTRAINT fk_dispatch_tasks_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  UNIQUE KEY uk_dispatch_tasks_source_event_id (source_event_id),
  UNIQUE KEY uk_dispatch_tasks_order_id (order_id),
  INDEX idx_dispatch_tasks_city_code (city_code),
  INDEX idx_dispatch_tasks_order_id (order_id),
  INDEX idx_dispatch_tasks_source_event_id (source_event_id),
  INDEX idx_dispatch_tasks_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  INDEX idx_dispatch_events_city_task_created (city_code, dispatch_task_id, created_at),
  INDEX idx_dispatch_events_city_type_created (city_code, event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
