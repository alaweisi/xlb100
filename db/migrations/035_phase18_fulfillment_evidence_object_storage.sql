-- Phase 18: local/mock object storage envelope, fulfillment evidence, and customer confirmation.

CREATE TABLE IF NOT EXISTS media_assets (
  media_asset_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  fulfillment_id VARCHAR(64) NOT NULL,
  complaint_id VARCHAR(64) NULL,
  uploaded_by_type VARCHAR(32) NOT NULL,
  uploaded_by_id VARCHAR(64) NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  content_type VARCHAR(64) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  signature_validated TINYINT(1) NOT NULL DEFAULT 1,
  security_scan_status VARCHAR(64) NOT NULL DEFAULT 'not_malware_scanned_local',
  storage_provider VARCHAR(32) NOT NULL,
  storage_provider_name VARCHAR(64) NOT NULL,
  storage_provider_status VARCHAR(32) NOT NULL,
  external_provider_executed TINYINT(1) NOT NULL DEFAULT 0,
  object_key VARCHAR(255) NOT NULL,
  storage_uri VARCHAR(512) NOT NULL,
  public_url VARCHAR(1024) NULL,
  stored_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (media_asset_id),
  CONSTRAINT fk_media_asset_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_media_asset_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
  CONSTRAINT fk_media_asset_fulfillment FOREIGN KEY (fulfillment_id) REFERENCES fulfillments(fulfillment_id),
  CONSTRAINT fk_media_asset_complaint FOREIGN KEY (complaint_id) REFERENCES aftersale_complaints(complaint_id),
  CONSTRAINT chk_media_asset_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_media_asset_actor CHECK (uploaded_by_type = 'worker'),
  CONSTRAINT chk_media_asset_content_type CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  CONSTRAINT chk_media_asset_size CHECK (size_bytes BETWEEN 1 AND 5242880),
  CONSTRAINT chk_media_asset_checksum CHECK (checksum_sha256 REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_media_asset_signature CHECK (signature_validated = 1),
  CONSTRAINT chk_media_asset_scan CHECK (security_scan_status = 'not_malware_scanned_local'),
  CONSTRAINT chk_media_asset_provider CHECK (storage_provider IN ('local','mock')),
  CONSTRAINT chk_media_asset_provider_name CHECK (storage_provider_name IN ('xlb-local-filesystem','xlb-memory-mock')),
  CONSTRAINT chk_media_asset_provider_status CHECK (
    (storage_provider = 'local' AND storage_provider_status = 'stored_local' AND storage_provider_name = 'xlb-local-filesystem')
    OR (storage_provider = 'mock' AND storage_provider_status = 'stored_mock' AND storage_provider_name = 'xlb-memory-mock')
  ),
  CONSTRAINT chk_media_asset_no_external_provider CHECK (external_provider_executed = 0),
  CONSTRAINT chk_media_asset_no_public_url CHECK (public_url IS NULL),
  CONSTRAINT chk_media_asset_storage_uri CHECK (
    (storage_provider = 'local' AND storage_uri LIKE 'xlb-local://%')
    OR (storage_provider = 'mock' AND storage_uri LIKE 'xlb-mock://%')
  ),
  UNIQUE KEY uq_media_asset_object_key (storage_provider, object_key),
  INDEX idx_media_asset_city_order (city_code, order_id, created_at),
  INDEX idx_media_asset_city_complaint (city_code, complaint_id, created_at),
  INDEX idx_media_asset_city_fulfillment (city_code, fulfillment_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fulfillment_evidence (
  evidence_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  fulfillment_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  complaint_id VARCHAR(64) NULL,
  media_asset_id VARCHAR(64) NOT NULL,
  evidence_type VARCHAR(32) NOT NULL,
  note VARCHAR(500) NULL,
  captured_at TIMESTAMP NOT NULL,
  created_by_worker_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (evidence_id),
  CONSTRAINT fk_fulfillment_evidence_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_fulfillment_evidence_fulfillment FOREIGN KEY (fulfillment_id) REFERENCES fulfillments(fulfillment_id),
  CONSTRAINT fk_fulfillment_evidence_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
  CONSTRAINT fk_fulfillment_evidence_complaint FOREIGN KEY (complaint_id) REFERENCES aftersale_complaints(complaint_id),
  CONSTRAINT fk_fulfillment_evidence_media FOREIGN KEY (media_asset_id) REFERENCES media_assets(media_asset_id),
  CONSTRAINT fk_fulfillment_evidence_worker FOREIGN KEY (created_by_worker_id) REFERENCES worker_profiles(worker_id),
  CONSTRAINT chk_fulfillment_evidence_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_fulfillment_evidence_type CHECK (evidence_type IN (
    'arrival','before_service','diagnosis','material','after_service','completion'
  )),
  UNIQUE KEY uq_fulfillment_evidence_media (city_code, media_asset_id),
  INDEX idx_fulfillment_evidence_city_fulfillment (city_code, fulfillment_id, captured_at),
  INDEX idx_fulfillment_evidence_city_order (city_code, order_id, captured_at),
  INDEX idx_fulfillment_evidence_city_complaint (city_code, complaint_id, captured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fulfillment_customer_confirmations (
  confirmation_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  fulfillment_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  complaint_id VARCHAR(64) NULL,
  customer_note VARCHAR(500) NULL,
  evidence_snapshot_json JSON NOT NULL,
  confirmed_at TIMESTAMP NULL,
  disputed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (confirmation_id),
  CONSTRAINT fk_fulfillment_confirmation_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_fulfillment_confirmation_fulfillment FOREIGN KEY (fulfillment_id) REFERENCES fulfillments(fulfillment_id),
  CONSTRAINT fk_fulfillment_confirmation_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
  CONSTRAINT fk_fulfillment_confirmation_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_fulfillment_confirmation_complaint FOREIGN KEY (complaint_id) REFERENCES aftersale_complaints(complaint_id),
  CONSTRAINT chk_fulfillment_confirmation_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_fulfillment_confirmation_status CHECK (status IN ('pending','confirmed','disputed')),
  CONSTRAINT chk_fulfillment_confirmation_state CHECK (
    (status = 'pending' AND confirmed_at IS NULL AND disputed_at IS NULL AND complaint_id IS NULL)
    OR (status = 'confirmed' AND confirmed_at IS NOT NULL AND disputed_at IS NULL AND complaint_id IS NULL)
    OR (status = 'disputed' AND confirmed_at IS NULL AND disputed_at IS NOT NULL AND complaint_id IS NOT NULL AND customer_note IS NOT NULL)
  ),
  UNIQUE KEY uq_fulfillment_confirmation (city_code, fulfillment_id),
  INDEX idx_fulfillment_confirmation_city_order (city_code, order_id, created_at),
  INDEX idx_fulfillment_confirmation_city_customer (city_code, customer_id, status, created_at),
  INDEX idx_fulfillment_confirmation_city_complaint (city_code, complaint_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('035_phase18_fulfillment_evidence_object_storage')
ON DUPLICATE KEY UPDATE version=version;
