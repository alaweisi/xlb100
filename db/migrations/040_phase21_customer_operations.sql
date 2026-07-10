-- Phase 21: customer profile/address operations closure
-- Append-only. No payment, map, OSS, dispatch, ledger, or settlement behavior.

CREATE TABLE customer_addresses (
  address_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  contact_name VARCHAR(64) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  province VARCHAR(64) NOT NULL,
  city VARCHAR(64) NOT NULL,
  district VARCHAR(64) NOT NULL,
  detail_address VARCHAR(255) NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (address_id),
  UNIQUE KEY uq_customer_address_city_id (city_code, address_id),
  INDEX idx_customer_addresses_owner (customer_id, city_code, is_default, updated_at),
  CONSTRAINT fk_customer_addresses_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_customer_addresses_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_customer_addresses_city CHECK (city_code <> '__global__')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('040_phase21_customer_operations');
