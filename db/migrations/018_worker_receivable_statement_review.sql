-- Phase 8G: worker receivable statement review record only — no funds movement.
CREATE TABLE worker_receivable_statement_reviews (
  review_id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  statement_id VARCHAR(64) NOT NULL,
  queue_id VARCHAR(64) NOT NULL,
  settlement_payable_id VARCHAR(64) NOT NULL,
  settlement_batch_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  decision VARCHAR(32) NOT NULL,
  review_note VARCHAR(512) NULL,
  reviewed_at TIMESTAMP NOT NULL,
  reviewed_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_worker_receivable_statement_review_statement (statement_id),
  CONSTRAINT fk_worker_receivable_statement_review_statement
    FOREIGN KEY (statement_id) REFERENCES worker_receivable_statements(statement_id),
  CONSTRAINT fk_worker_receivable_statement_review_queue
    FOREIGN KEY (queue_id) REFERENCES settlement_payable_queue(queue_id),
  CONSTRAINT fk_worker_receivable_statement_review_payable
    FOREIGN KEY (settlement_payable_id) REFERENCES settlement_payables(settlement_payable_id),
  CONSTRAINT fk_worker_receivable_statement_review_batch_city
    FOREIGN KEY (settlement_batch_id, city_code)
    REFERENCES settlement_batches(settlement_batch_id, city_code),
  CONSTRAINT fk_worker_receivable_statement_review_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_worker_receivable_statement_review_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_worker_receivable_statement_review_decision CHECK (decision IN ('approved', 'rejected')),
  INDEX idx_worker_receivable_statement_review_city (city_code),
  INDEX idx_worker_receivable_statement_review_worker (worker_id),
  INDEX idx_worker_receivable_statement_review_reviewed_at (reviewed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('018_worker_receivable_statement_review')
ON DUPLICATE KEY UPDATE version=version;
