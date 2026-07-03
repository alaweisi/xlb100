-- Phase 5A: Dispatch outbox → city Redis stream foundation
-- Depends on: 006_order_payment_outbox_foundation.sql

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

INSERT INTO schema_migrations (version) VALUES ('007_dispatch_outbox_city_stream_foundation')
ON DUPLICATE KEY UPDATE version = version;
