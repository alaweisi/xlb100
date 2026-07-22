-- Customer Hybrid SDUI control plane.
-- Depends on: 058_stage2c2_migration_control.sql
-- Scope: versioned manifests, publication evidence, idempotency, audit, and kill switch.

CREATE TABLE IF NOT EXISTS customer_sdui_revisions (
  revision_id VARCHAR(128) NOT NULL,
  control_city_code VARCHAR(64) NOT NULL,
  page_id VARCHAR(64) NOT NULL,
  manifest_id VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  definition_json JSON NOT NULL,
  content_hash_sha256 CHAR(64) NOT NULL,
  scope_json JSON NULL,
  rollout_json JSON NULL,
  effective_at TIMESTAMP(3) NULL,
  expires_at TIMESTAMP(3) NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by VARCHAR(128) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  reviewed_by VARCHAR(128) NULL,
  reviewed_at TIMESTAMP(3) NULL,
  review_note VARCHAR(500) NULL,
  published_by VARCHAR(128) NULL,
  published_at TIMESTAMP(3) NULL,
  retired_by VARCHAR(128) NULL,
  retired_at TIMESTAMP(3) NULL,
  retirement_reason VARCHAR(500) NULL,
  PRIMARY KEY (revision_id),
  UNIQUE KEY uq_customer_sdui_city_revision (control_city_code, revision_id),
  CONSTRAINT fk_customer_sdui_revision_city FOREIGN KEY (control_city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_customer_sdui_revision_city CHECK (control_city_code <> '__global__'),
  CONSTRAINT chk_customer_sdui_revision_status CHECK (status IN ('draft','reviewed','published','retired')),
  CONSTRAINT chk_customer_sdui_revision_version CHECK (version >= 1),
  CONSTRAINT chk_customer_sdui_revision_hash CHECK (content_hash_sha256 REGEXP '^[0-9a-f]{64}$'),
  CONSTRAINT chk_customer_sdui_definition_json CHECK (JSON_TYPE(definition_json) = 'OBJECT'),
  CONSTRAINT chk_customer_sdui_publication_json CHECK (
    (scope_json IS NULL AND rollout_json IS NULL AND effective_at IS NULL AND expires_at IS NULL)
    OR (scope_json IS NOT NULL AND rollout_json IS NOT NULL AND effective_at IS NOT NULL)
  ),
  CONSTRAINT chk_customer_sdui_review_evidence CHECK (
    (reviewed_by IS NULL AND reviewed_at IS NULL AND review_note IS NULL)
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_note IS NOT NULL AND reviewed_by <> created_by)
  ),
  CONSTRAINT chk_customer_sdui_publish_evidence CHECK (
    (published_by IS NULL AND published_at IS NULL)
    OR (published_by IS NOT NULL AND published_at IS NOT NULL AND reviewed_by IS NOT NULL AND published_by <> reviewed_by)
  ),
  CONSTRAINT chk_customer_sdui_retire_evidence CHECK (
    (retired_by IS NULL AND retired_at IS NULL AND retirement_reason IS NULL)
    OR (retired_by IS NOT NULL AND retired_at IS NOT NULL AND retirement_reason IS NOT NULL AND published_at IS NOT NULL)
  ),
  CONSTRAINT chk_customer_sdui_window CHECK (expires_at IS NULL OR expires_at > effective_at),
  INDEX idx_customer_sdui_resolution (control_city_code, page_id, status, effective_at, expires_at),
  INDEX idx_customer_sdui_manifest_history (control_city_code, page_id, manifest_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_sdui_kill_switches (
  control_city_code VARCHAR(64) NOT NULL,
  page_id VARCHAR(64) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reason VARCHAR(500) NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  updated_by VARCHAR(128) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (control_city_code, page_id),
  CONSTRAINT fk_customer_sdui_kill_city FOREIGN KEY (control_city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_customer_sdui_kill_city CHECK (control_city_code <> '__global__'),
  CONSTRAINT chk_customer_sdui_kill_version CHECK (version >= 1),
  CONSTRAINT chk_customer_sdui_kill_reason CHECK (
    (enabled = FALSE AND reason IS NULL) OR (enabled = TRUE AND reason IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_sdui_mutation_records (
  mutation_id VARCHAR(128) NOT NULL,
  control_city_code VARCHAR(64) NOT NULL,
  page_id VARCHAR(64) NOT NULL,
  operation VARCHAR(32) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  idempotency_key_hash CHAR(64) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  response_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (mutation_id),
  UNIQUE KEY uq_customer_sdui_mutation_replay (
    control_city_code, page_id, operation, actor_id, idempotency_key_hash
  ),
  CONSTRAINT fk_customer_sdui_mutation_city FOREIGN KEY (control_city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_customer_sdui_mutation_city CHECK (control_city_code <> '__global__'),
  CONSTRAINT chk_customer_sdui_mutation_hashes CHECK (
    idempotency_key_hash REGEXP '^[0-9a-f]{64}$' AND request_fingerprint REGEXP '^[0-9a-f]{64}$'
  ),
  CONSTRAINT chk_customer_sdui_mutation_response CHECK (JSON_TYPE(response_json) = 'OBJECT'),
  INDEX idx_customer_sdui_mutation_created (control_city_code, page_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_sdui_audit_records (
  audit_id VARCHAR(128) NOT NULL,
  control_city_code VARCHAR(64) NOT NULL,
  page_id VARCHAR(64) NOT NULL,
  revision_id VARCHAR(128) NULL,
  action VARCHAR(32) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  expected_version BIGINT UNSIGNED NULL,
  actual_version BIGINT UNSIGNED NOT NULL,
  content_hash_sha256 CHAR(64) NULL,
  trace_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (audit_id),
  UNIQUE KEY uq_customer_sdui_audit_city_id (control_city_code, audit_id),
  CONSTRAINT fk_customer_sdui_audit_city FOREIGN KEY (control_city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_customer_sdui_audit_city CHECK (control_city_code <> '__global__'),
  CONSTRAINT chk_customer_sdui_audit_versions CHECK (
    (expected_version IS NULL OR expected_version >= 1) AND actual_version >= 1
  ),
  CONSTRAINT chk_customer_sdui_audit_hash CHECK (
    content_hash_sha256 IS NULL OR content_hash_sha256 REGEXP '^[0-9a-f]{64}$'
  ),
  INDEX idx_customer_sdui_audit_subject (control_city_code, page_id, revision_id, created_at),
  INDEX idx_customer_sdui_audit_actor (control_city_code, actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version)
VALUES ('059_customer_sdui_control_plane')
ON DUPLICATE KEY UPDATE version = version;
