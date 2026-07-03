-- Phase 4: Order + Payment + Event Outbox foundation
-- Depends on: 005_official_pricing_display_fields.sql

CREATE TABLE IF NOT EXISTS orders (
  order_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  sku_id VARCHAR(128) NOT NULL,
  sku_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  unit VARCHAR(64) NOT NULL,
  price_rule_id VARCHAR(128) NOT NULL,
  price_text VARCHAR(255) NOT NULL,
  price_type VARCHAR(32) NOT NULL,
  base_price DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (order_id),
  CONSTRAINT fk_orders_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  INDEX idx_orders_city_code (city_code),
  INDEX idx_orders_customer_id (customer_id),
  INDEX idx_orders_sku_id (sku_id),
  INDEX idx_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_orders (
  payment_order_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  status VARCHAR(32) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_trade_no VARCHAR(128) NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_order_id),
  CONSTRAINT fk_payment_orders_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  INDEX idx_payment_orders_order_id (order_id),
  INDEX idx_payment_orders_city_code (city_code),
  INDEX idx_payment_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_outbox (
  event_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  payload_json JSON NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP NULL,
  PRIMARY KEY (event_id),
  CONSTRAINT fk_event_outbox_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  INDEX idx_event_outbox_city_code (city_code),
  INDEX idx_event_outbox_event_type (event_type),
  INDEX idx_event_outbox_aggregate_id (aggregate_id),
  INDEX idx_event_outbox_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('006_order_payment_outbox_foundation')
ON DUPLICATE KEY UPDATE version = version;
