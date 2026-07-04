-- Phase 8D: settlement payable readiness snapshot only — no funds movement.
CREATE TABLE settlement_payables (
  settlement_payable_id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  settlement_batch_id VARCHAR(64) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  gross_amount DECIMAL(10,2) NOT NULL,
  platform_fee_amount DECIMAL(10,2) NOT NULL,
  worker_receivable_amount DECIMAL(10,2) NOT NULL,
  item_count INT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'payable',
  marked_at TIMESTAMP NOT NULL,
  marked_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_settlement_payable_batch (settlement_batch_id),
  CONSTRAINT fk_settlement_payables_batch_city
    FOREIGN KEY (settlement_batch_id, city_code)
    REFERENCES settlement_batches(settlement_batch_id, city_code),
  CONSTRAINT fk_settlement_payables_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_settlement_payables_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_settlement_payables_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_settlement_payables_amounts CHECK (
    gross_amount >= 0 AND platform_fee_amount >= 0 AND worker_receivable_amount >= 0
  ),
  CONSTRAINT chk_settlement_payables_item_count CHECK (item_count >= 1),
  CONSTRAINT chk_settlement_payables_status CHECK (status = 'payable'),
  INDEX idx_settlement_payables_city (city_code),
  INDEX idx_settlement_payables_batch (settlement_batch_id),
  INDEX idx_settlement_payables_marked_at (marked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('015_settlement_payable_readiness')
ON DUPLICATE KEY UPDATE version=version;
