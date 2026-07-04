-- Phase 8F: worker receivable statement snapshot only — no funds movement.
CREATE TABLE worker_receivable_statements (
  statement_id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  queue_id VARCHAR(64) NOT NULL,
  settlement_payable_id VARCHAR(64) NOT NULL,
  settlement_batch_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  gross_amount DECIMAL(10,2) NOT NULL,
  platform_fee_amount DECIMAL(10,2) NOT NULL,
  worker_receivable_amount DECIMAL(10,2) NOT NULL,
  item_count INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'created',
  generated_at TIMESTAMP NOT NULL,
  generated_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_worker_receivable_statement_queue_worker (queue_id, worker_id),
  CONSTRAINT fk_worker_receivable_statement_queue
    FOREIGN KEY (queue_id) REFERENCES settlement_payable_queue(queue_id),
  CONSTRAINT fk_worker_receivable_statement_payable
    FOREIGN KEY (settlement_payable_id) REFERENCES settlement_payables(settlement_payable_id),
  CONSTRAINT fk_worker_receivable_statement_batch_city
    FOREIGN KEY (settlement_batch_id, city_code)
    REFERENCES settlement_batches(settlement_batch_id, city_code),
  CONSTRAINT fk_worker_receivable_statement_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_worker_receivable_statement_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_worker_receivable_statement_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_worker_receivable_statement_amounts CHECK (
    gross_amount >= 0 AND platform_fee_amount >= 0 AND worker_receivable_amount >= 0
  ),
  CONSTRAINT chk_worker_receivable_statement_item_count CHECK (item_count >= 1),
  CONSTRAINT chk_worker_receivable_statement_status CHECK (status = 'created'),
  INDEX idx_worker_receivable_statement_city (city_code),
  INDEX idx_worker_receivable_statement_payable (settlement_payable_id),
  INDEX idx_worker_receivable_statement_worker (worker_id),
  INDEX idx_worker_receivable_statement_generated_at (generated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE worker_receivable_statement_lines (
  line_id VARCHAR(64) NOT NULL PRIMARY KEY,
  statement_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  settlement_item_id VARCHAR(64) NOT NULL,
  settlement_batch_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  fulfillment_id VARCHAR(64) NOT NULL,
  sku_id VARCHAR(128) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  gross_amount DECIMAL(10,2) NOT NULL,
  platform_fee_amount DECIMAL(10,2) NOT NULL,
  worker_receivable_amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_worker_receivable_statement_line_item (statement_id, settlement_item_id),
  CONSTRAINT fk_worker_receivable_statement_lines_statement
    FOREIGN KEY (statement_id) REFERENCES worker_receivable_statements(statement_id),
  CONSTRAINT fk_worker_receivable_statement_lines_item
    FOREIGN KEY (settlement_item_id) REFERENCES settlement_items(settlement_item_id),
  CONSTRAINT fk_worker_receivable_statement_lines_batch_city
    FOREIGN KEY (settlement_batch_id, city_code)
    REFERENCES settlement_batches(settlement_batch_id, city_code),
  CONSTRAINT fk_worker_receivable_statement_lines_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_worker_receivable_statement_lines_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_worker_receivable_statement_lines_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_worker_receivable_statement_lines_amounts CHECK (
    gross_amount >= 0 AND platform_fee_amount >= 0 AND worker_receivable_amount >= 0
  ),
  INDEX idx_worker_receivable_statement_lines_statement (statement_id),
  INDEX idx_worker_receivable_statement_lines_city (city_code),
  INDEX idx_worker_receivable_statement_lines_worker (worker_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('017_worker_receivable_statement')
ON DUPLICATE KEY UPDATE version=version;
