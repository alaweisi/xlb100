-- Phase 8A: city-scoped ledger accrual foundation only
CREATE TABLE ledger_accounts (
  account_id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  account_type VARCHAR(32) NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ledger_account_owner (city_code, account_type, owner_id, currency),
  CONSTRAINT fk_ledger_accounts_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_ledger_accounts_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_ledger_accounts_currency CHECK (currency = 'CNY'),
  INDEX idx_ledger_accounts_city (city_code), INDEX idx_ledger_accounts_type (account_type),
  INDEX idx_ledger_accounts_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ledger_entries (
  entry_id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL, account_id VARCHAR(64) NOT NULL,
  account_type VARCHAR(32) NOT NULL, owner_id VARCHAR(64) NOT NULL,
  source_type VARCHAR(64) NOT NULL, source_id VARCHAR(64) NOT NULL,
  direction VARCHAR(16) NOT NULL, amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY', description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ledger_entries_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_ledger_entries_account FOREIGN KEY (account_id) REFERENCES ledger_accounts(account_id),
  CONSTRAINT chk_ledger_entries_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_ledger_entries_amount CHECK (amount >= 0),
  CONSTRAINT chk_ledger_entries_currency CHECK (currency = 'CNY'),
  UNIQUE KEY uk_ledger_entry_source_account (account_id, source_type, source_id, direction),
  INDEX idx_ledger_entries_city (city_code), INDEX idx_ledger_entries_account (account_id),
  INDEX idx_ledger_entries_source (source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ledger_accruals (
  accrual_id VARCHAR(64) NOT NULL PRIMARY KEY, city_code VARCHAR(64) NOT NULL,
  fulfillment_id VARCHAR(64) NOT NULL, order_id VARCHAR(64) NOT NULL,
  payment_order_id VARCHAR(64) NOT NULL, worker_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL, sku_id VARCHAR(128) NOT NULL,
  gross_amount DECIMAL(10,2) NOT NULL, platform_fee DECIMAL(10,2) NOT NULL,
  worker_receivable DECIMAL(10,2) NOT NULL, currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  source_event_id VARCHAR(64) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'accrued',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ledger_accrual_fulfillment (fulfillment_id),
  UNIQUE KEY uk_ledger_accrual_event (source_event_id),
  CONSTRAINT fk_ledger_accruals_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_ledger_accruals_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_ledger_accruals_amounts CHECK (gross_amount >= 0 AND platform_fee >= 0 AND worker_receivable >= 0),
  CONSTRAINT chk_ledger_accruals_currency CHECK (currency = 'CNY'),
  INDEX idx_ledger_accruals_city (city_code), INDEX idx_ledger_accruals_worker (worker_id),
  INDEX idx_ledger_accruals_order (order_id), INDEX idx_ledger_accruals_payment (payment_order_id),
  INDEX idx_ledger_accruals_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('012_ledger_accrual_foundation')
ON DUPLICATE KEY UPDATE version=version;
