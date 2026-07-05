-- Phase 14R: aftersale refund request and approval event foundation.
CREATE TABLE IF NOT EXISTS aftersale_refund_requests (
  refund_id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  fulfillment_id VARCHAR(64) NOT NULL,
  payment_order_id VARCHAR(64) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(16) NOT NULL DEFAULT 'CNY',
  reason VARCHAR(255) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'requested',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL,
  approved_by_admin_id VARCHAR(64) NULL,
  approval_event_id VARCHAR(64) NULL,
  CONSTRAINT fk_refund_requests_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_refund_requests_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
  CONSTRAINT fk_refund_requests_payment FOREIGN KEY (payment_order_id) REFERENCES payment_orders(payment_order_id),
  CONSTRAINT fk_refund_requests_fulfillment FOREIGN KEY (fulfillment_id) REFERENCES fulfillments(fulfillment_id),
  CONSTRAINT chk_refund_requests_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_refund_requests_amount CHECK (amount >= 0),
  CONSTRAINT chk_refund_requests_currency CHECK (currency = 'CNY'),
  UNIQUE KEY uk_refund_requests_order (city_code, order_id),
  UNIQUE KEY uk_refund_requests_approval_event (approval_event_id),
  INDEX idx_refund_requests_city (city_code),
  INDEX idx_refund_requests_status (status),
  INDEX idx_refund_requests_fulfillment (fulfillment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('027_aftersale_refund_reversal')
ON DUPLICATE KEY UPDATE version=version;
