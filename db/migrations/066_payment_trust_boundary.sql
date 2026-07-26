-- Payment trust-boundary hardening.
-- Do not rewrite legacy payment facts if historic Mock test data reused a trade
-- number. Instead, establish an append-only receipt registry that makes every
-- newly accepted provider callback unique from this migration forward.

CREATE TABLE IF NOT EXISTS payment_provider_receipts (
  provider VARCHAR(32) NOT NULL,
  provider_trade_no VARCHAR(128) NOT NULL,
  payment_order_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  verified_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (provider, provider_trade_no),
  CONSTRAINT uq_payment_provider_receipt_payment UNIQUE (payment_order_id),
  CONSTRAINT fk_payment_provider_receipt_payment
    FOREIGN KEY (payment_order_id) REFERENCES payment_orders (payment_order_id),
  CONSTRAINT fk_payment_provider_receipt_city
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  INDEX idx_payment_provider_receipt_city_verified (city_code, verified_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version)
VALUES ('066_payment_trust_boundary')
ON DUPLICATE KEY UPDATE version = version;
