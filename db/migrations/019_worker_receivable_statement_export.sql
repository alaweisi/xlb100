-- Phase 8H: worker receivable statement export package snapshot only — no funds movement.
CREATE TABLE worker_receivable_statement_exports (
  export_id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  statement_id VARCHAR(64) NOT NULL,
  review_id VARCHAR(64) NOT NULL,
  queue_id VARCHAR(64) NOT NULL,
  settlement_payable_id VARCHAR(64) NOT NULL,
  settlement_batch_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  export_format VARCHAR(32) NOT NULL,
  payload_version VARCHAR(32) NOT NULL,
  content_hash VARCHAR(128) NOT NULL,
  exported_at TIMESTAMP NOT NULL,
  exported_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_worker_receivable_statement_export_statement (statement_id),
  CONSTRAINT fk_worker_receivable_statement_export_statement
    FOREIGN KEY (statement_id) REFERENCES worker_receivable_statements(statement_id),
  CONSTRAINT fk_worker_receivable_statement_export_review
    FOREIGN KEY (review_id) REFERENCES worker_receivable_statement_reviews(review_id),
  CONSTRAINT fk_worker_receivable_statement_export_queue
    FOREIGN KEY (queue_id) REFERENCES settlement_payable_queue(queue_id),
  CONSTRAINT fk_worker_receivable_statement_export_payable
    FOREIGN KEY (settlement_payable_id) REFERENCES settlement_payables(settlement_payable_id),
  CONSTRAINT fk_worker_receivable_statement_export_batch_city
    FOREIGN KEY (settlement_batch_id, city_code)
    REFERENCES settlement_batches(settlement_batch_id, city_code),
  CONSTRAINT fk_worker_receivable_statement_export_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_worker_receivable_statement_export_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_worker_receivable_statement_export_format CHECK (export_format = 'internal_v1'),
  CONSTRAINT chk_worker_receivable_statement_export_payload_version CHECK (payload_version = 'v1'),
  INDEX idx_worker_receivable_statement_export_city (city_code),
  INDEX idx_worker_receivable_statement_export_worker (worker_id),
  INDEX idx_worker_receivable_statement_export_exported_at (exported_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('019_worker_receivable_statement_export')
ON DUPLICATE KEY UPDATE version=version;
