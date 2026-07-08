-- P1 Stage 6: minimal simulated customer order review.
-- Review creation is customer-facing and stops at status=created.

CREATE TABLE IF NOT EXISTS order_reviews (
  review_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  fulfillment_id VARCHAR(64) NOT NULL,
  rating TINYINT NOT NULL,
  comment VARCHAR(500) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'created',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (review_id),
  UNIQUE KEY uk_order_reviews_order (city_code, order_id),
  CONSTRAINT fk_order_reviews_city_code
    FOREIGN KEY (city_code) REFERENCES cities (city_code),
  CONSTRAINT fk_order_reviews_order
    FOREIGN KEY (order_id) REFERENCES orders (order_id),
  CONSTRAINT fk_order_reviews_worker
    FOREIGN KEY (worker_id) REFERENCES worker_profiles (worker_id),
  CONSTRAINT fk_order_reviews_fulfillment
    FOREIGN KEY (fulfillment_id) REFERENCES fulfillments (fulfillment_id),
  CONSTRAINT chk_order_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_order_reviews_status CHECK (status = 'created'),
  INDEX idx_order_reviews_city_code (city_code),
  INDEX idx_order_reviews_worker_id (worker_id),
  INDEX idx_order_reviews_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('030_order_review_mvp')
ON DUPLICATE KEY UPDATE version = version;
