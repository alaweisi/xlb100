-- Phase 8B: city-scoped settlement preparation only.
CREATE TABLE settlement_batches (
  settlement_batch_id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  total_gross_amount DECIMAL(10,2) NOT NULL,
  total_platform_fee DECIMAL(10,2) NOT NULL,
  total_worker_receivable DECIMAL(10,2) NOT NULL,
  item_count INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'prepared',
  prepared_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_settlement_batch_city (settlement_batch_id, city_code),
  CONSTRAINT fk_settlement_batches_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_settlement_batches_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_settlement_batches_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_settlement_batches_amounts CHECK (
    total_gross_amount >= 0 AND total_platform_fee >= 0 AND total_worker_receivable >= 0
  ),
  CONSTRAINT chk_settlement_batches_item_count CHECK (item_count >= 0),
  CONSTRAINT chk_settlement_batches_status CHECK (status IN ('prepared', 'cancelled')),
  INDEX idx_settlement_batches_city (city_code),
  INDEX idx_settlement_batches_status (status),
  INDEX idx_settlement_batches_prepared_at (prepared_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settlement_items (
  settlement_item_id VARCHAR(64) NOT NULL PRIMARY KEY,
  settlement_batch_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  accrual_id VARCHAR(64) NOT NULL,
  fulfillment_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  payment_order_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  sku_id VARCHAR(128) NOT NULL,
  gross_amount DECIMAL(10,2) NOT NULL,
  platform_fee DECIMAL(10,2) NOT NULL,
  worker_receivable DECIMAL(10,2) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  status VARCHAR(32) NOT NULL DEFAULT 'prepared',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_settlement_item_accrual (accrual_id),
  CONSTRAINT fk_settlement_items_batch_city
    FOREIGN KEY (settlement_batch_id, city_code)
    REFERENCES settlement_batches(settlement_batch_id, city_code),
  CONSTRAINT fk_settlement_items_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_settlement_items_accrual FOREIGN KEY (accrual_id) REFERENCES ledger_accruals(accrual_id),
  CONSTRAINT chk_settlement_items_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_settlement_items_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_settlement_items_amounts CHECK (
    gross_amount >= 0 AND platform_fee >= 0 AND worker_receivable >= 0
  ),
  CONSTRAINT chk_settlement_items_status CHECK (status IN ('prepared', 'cancelled')),
  INDEX idx_settlement_items_batch (settlement_batch_id),
  INDEX idx_settlement_items_city (city_code),
  INDEX idx_settlement_items_worker (worker_id),
  INDEX idx_settlement_items_fulfillment (fulfillment_id),
  INDEX idx_settlement_items_order (order_id),
  INDEX idx_settlement_items_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('013_settlement_preparation_foundation')
ON DUPLICATE KEY UPDATE version=version;
