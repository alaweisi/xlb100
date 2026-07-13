-- Phase 27B B1: dormant in-app Notification projection foundation.
-- Empty-schema migration only: no city, subscriber, subscription, allowlist,
-- template, active pointer, activation, live-start, backfill, or replay data.
-- External channels and an independent retry/lease/DLQ lifecycle are absent.
-- CREATE TABLE is atomic in MySQL; IF NOT EXISTS supports partial-DDL retry.
-- The schema_migrations marker is deliberately the final statement.

CREATE TABLE IF NOT EXISTS notification_templates (
  template_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  template_key VARCHAR(128) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  recipient_type VARCHAR(16) NOT NULL,
  category_code VARCHAR(64) NOT NULL,
  owner_service_id VARCHAR(128) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (template_id),
  UNIQUE KEY uq_notification_template_city_id (city_code, template_id),
  UNIQUE KEY uq_notification_template_key (city_code, template_key),
  UNIQUE KEY uq_notification_template_scope
    (city_code, event_type, recipient_type, category_code),
  CONSTRAINT fk_notification_template_city
    FOREIGN KEY (city_code) REFERENCES cities (city_code)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_notification_template_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_notification_template_key
    CHECK (template_key REGEXP '^[a-z0-9][a-z0-9._-]{2,127}$'),
  CONSTRAINT chk_notification_template_recipient
    CHECK (recipient_type IN ('customer','worker')),
  CONSTRAINT chk_notification_template_status
    CHECK (status IN ('draft','reviewed','published','retired')),
  CONSTRAINT chk_notification_template_version CHECK (row_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_template_revisions (
  template_revision_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  template_id VARCHAR(64) NOT NULL,
  revision_number INT UNSIGNED NOT NULL,
  revision_label VARCHAR(64) NOT NULL,
  locale VARCHAR(16) NOT NULL,
  title_pattern VARCHAR(255) NOT NULL,
  body_pattern VARCHAR(2000) NOT NULL,
  parameter_names_json JSON NOT NULL,
  content_hash CHAR(64) NOT NULL,
  pii_level VARCHAR(8) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  created_by_service_id VARCHAR(128) NOT NULL,
  reviewed_by_actor_id VARCHAR(128) NULL,
  published_by_actor_id VARCHAR(128) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_at TIMESTAMP(3) NULL,
  published_at TIMESTAMP(3) NULL,
  retired_at TIMESTAMP(3) NULL,
  PRIMARY KEY (template_revision_id),
  UNIQUE KEY uq_notification_revision_city_id (city_code, template_revision_id),
  UNIQUE KEY uq_notification_revision_number
    (city_code, template_id, revision_number, locale),
  UNIQUE KEY uq_notification_revision_label
    (city_code, template_id, revision_label, locale),
  CONSTRAINT fk_notification_revision_template
    FOREIGN KEY (city_code, template_id)
    REFERENCES notification_templates (city_code, template_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_notification_revision_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_notification_revision_number CHECK (revision_number >= 1),
  CONSTRAINT chk_notification_revision_label
    CHECK (revision_label REGEXP '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  CONSTRAINT chk_notification_revision_locale CHECK (locale <> ''),
  CONSTRAINT chk_notification_revision_params
    CHECK (JSON_TYPE(parameter_names_json) = 'ARRAY'),
  CONSTRAINT chk_notification_revision_hash
    CHECK (content_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_notification_revision_pii CHECK (pii_level IN ('P0','P1')),
  CONSTRAINT chk_notification_revision_status
    CHECK (status IN ('draft','reviewed','published','retired')),
  CONSTRAINT chk_notification_revision_review
    CHECK ((reviewed_at IS NULL AND reviewed_by_actor_id IS NULL)
        OR (reviewed_at IS NOT NULL AND reviewed_by_actor_id IS NOT NULL)),
  CONSTRAINT chk_notification_revision_publish
    CHECK ((published_at IS NULL AND published_by_actor_id IS NULL)
        OR (published_at IS NOT NULL AND published_by_actor_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_recipient_preferences (
  preference_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  recipient_type VARCHAR(16) NOT NULL,
  recipient_id VARCHAR(64) NOT NULL,
  category_code VARCHAR(64) NOT NULL,
  preference_value VARCHAR(16) NOT NULL,
  updated_by_actor_type VARCHAR(32) NOT NULL,
  updated_by_actor_id VARCHAR(128) NOT NULL,
  row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (preference_id),
  UNIQUE KEY uq_notification_preference_city_id (city_code, preference_id),
  UNIQUE KEY uq_notification_preference_scope
    (city_code, recipient_type, recipient_id, category_code),
  CONSTRAINT fk_notification_preference_city
    FOREIGN KEY (city_code) REFERENCES cities (city_code)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_notification_preference_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_notification_preference_recipient
    CHECK (recipient_type IN ('customer','worker')),
  CONSTRAINT chk_notification_preference_value
    CHECK (preference_value IN ('enabled','disabled')),
  CONSTRAINT chk_notification_preference_actor
    CHECK (updated_by_actor_type IN ('recipient','notification_service')),
  CONSTRAINT chk_notification_preference_version CHECK (row_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_records (
  notification_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  recipient_type VARCHAR(16) NOT NULL,
  recipient_id VARCHAR(64) NOT NULL,
  source_event_id VARCHAR(64) NOT NULL,
  subscriber_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  event_major_version SMALLINT UNSIGNED NOT NULL,
  template_revision_id VARCHAR(64) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  target_fingerprint CHAR(64) NOT NULL,
  render_parameters_json JSON NOT NULL,
  render_parameters_hash CHAR(64) NOT NULL,
  rendered_title VARCHAR(255) NOT NULL,
  rendered_body VARCHAR(2000) NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (notification_id),
  UNIQUE KEY uq_notification_record_city_id (city_code, notification_id),
  UNIQUE KEY uq_notification_record_recipient_ref
    (city_code, notification_id, recipient_type, recipient_id),
  UNIQUE KEY uq_notification_record_business
    (city_code, recipient_type, recipient_id, source_event_id, template_revision_id),
  UNIQUE KEY uq_notification_record_receipt_ref
    (city_code, notification_id, subscriber_id, source_event_id,
     template_revision_id, payload_hash, target_fingerprint),
  KEY idx_notification_record_recipient
    (city_code, recipient_type, recipient_id, created_at, notification_id),
  CONSTRAINT fk_notification_record_source
    FOREIGN KEY (city_code, source_event_id)
    REFERENCES event_outbox (city_code, event_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_notification_record_delivery
    FOREIGN KEY (subscriber_id, source_event_id)
    REFERENCES platform_event_deliveries (subscriber_id, event_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_notification_record_revision
    FOREIGN KEY (city_code, template_revision_id)
    REFERENCES notification_template_revisions (city_code, template_revision_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_notification_record_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_notification_record_recipient
    CHECK (recipient_type IN ('customer','worker')),
  CONSTRAINT chk_notification_record_payload_hash
    CHECK (payload_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_notification_record_target_hash
    CHECK (target_fingerprint REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_notification_record_params_hash
    CHECK (render_parameters_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_notification_record_params
    CHECK (JSON_TYPE(render_parameters_json) = 'OBJECT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_delivery_receipts (
  receipt_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  subscriber_id VARCHAR(64) NOT NULL,
  event_id VARCHAR(64) NOT NULL,
  notification_id VARCHAR(64) NOT NULL,
  template_revision_id VARCHAR(64) NOT NULL,
  source_payload_hash CHAR(64) NOT NULL,
  target_fingerprint CHAR(64) NOT NULL,
  result VARCHAR(32) NOT NULL DEFAULT 'applied',
  committed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (receipt_id),
  UNIQUE KEY uq_notification_receipt_city_id (city_code, receipt_id),
  UNIQUE KEY uq_notification_receipt_subscriber_event (subscriber_id, event_id),
  UNIQUE KEY uq_notification_receipt_notification (city_code, notification_id),
  CONSTRAINT fk_notification_receipt_delivery
    FOREIGN KEY (subscriber_id, event_id)
    REFERENCES platform_event_deliveries (subscriber_id, event_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_notification_receipt_record
    FOREIGN KEY (city_code, notification_id, subscriber_id, event_id,
      template_revision_id, source_payload_hash, target_fingerprint)
    REFERENCES notification_records
      (city_code, notification_id, subscriber_id, source_event_id,
       template_revision_id, payload_hash, target_fingerprint)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_notification_receipt_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_notification_receipt_target_hash
    CHECK (target_fingerprint REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_notification_receipt_source_hash
    CHECK (source_payload_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_notification_receipt_result CHECK (result = 'applied')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_recipient_states (
  state_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  notification_id VARCHAR(64) NOT NULL,
  recipient_type VARCHAR(16) NOT NULL,
  recipient_id VARCHAR(64) NOT NULL,
  read_at TIMESTAMP(3) NULL,
  archived_at TIMESTAMP(3) NULL,
  hidden_at TIMESTAMP(3) NULL,
  row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (state_id),
  UNIQUE KEY uq_notification_state_city_id (city_code, state_id),
  UNIQUE KEY uq_notification_state_recipient
    (city_code, notification_id, recipient_type, recipient_id),
  CONSTRAINT fk_notification_state_record
    FOREIGN KEY (city_code, notification_id, recipient_type, recipient_id)
    REFERENCES notification_records
      (city_code, notification_id, recipient_type, recipient_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_notification_state_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_notification_state_recipient
    CHECK (recipient_type IN ('customer','worker')),
  CONSTRAINT chk_notification_state_version CHECK (row_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_actions (
  action_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  notification_id_copy VARCHAR(64) NULL,
  event_id_copy VARCHAR(64) NULL,
  subscriber_id_copy VARCHAR(64) NULL,
  recipient_type_copy VARCHAR(16) NOT NULL,
  recipient_id_copy VARCHAR(64) NOT NULL,
  action_kind VARCHAR(32) NOT NULL,
  actor_service_id VARCHAR(128) NOT NULL,
  reason_code VARCHAR(64) NOT NULL,
  target_fingerprint_copy CHAR(64) NULL,
  idempotency_key_hash CHAR(64) NULL,
  request_fingerprint CHAR(64) NULL,
  action_result VARCHAR(32) NULL,
  expected_row_version BIGINT UNSIGNED NULL,
  actual_row_version BIGINT UNSIGNED NULL,
  trace_id VARCHAR(128) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (action_id),
  KEY idx_notification_action_notification
    (city_code, notification_id_copy, created_at),
  KEY idx_notification_action_event
    (city_code, subscriber_id_copy, event_id_copy, created_at),
  UNIQUE KEY uq_notification_action_recipient_idempotency
    (city_code, recipient_type_copy, recipient_id_copy, idempotency_key_hash),
  CONSTRAINT fk_notification_action_city
    FOREIGN KEY (city_code) REFERENCES cities (city_code)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_notification_action_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_notification_action_recipient
    CHECK (recipient_type_copy IN ('customer','worker')),
  CONSTRAINT chk_notification_action_kind
    CHECK (action_kind IN ('projection_committed','projection_reused','state_changed','state_reused','tombstoned')),
  CONSTRAINT chk_notification_action_target_hash
    CHECK (target_fingerprint_copy IS NULL
      OR target_fingerprint_copy REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_notification_action_idempotency_hashes
    CHECK ((idempotency_key_hash IS NULL AND request_fingerprint IS NULL AND action_result IS NULL)
        OR (idempotency_key_hash REGEXP '^[a-f0-9]{64}$'
            AND request_fingerprint REGEXP '^[a-f0-9]{64}$'
            AND action_result IN ('applied','already_applied'))),
  CONSTRAINT chk_notification_action_versions
    CHECK (expected_row_version IS NULL OR expected_row_version >= 1),
  CONSTRAINT chk_notification_action_actual_version
    CHECK (actual_row_version IS NULL OR actual_row_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_tombstones (
  tombstone_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  notification_id_copy VARCHAR(64) NOT NULL,
  event_id_copy VARCHAR(64) NOT NULL,
  recipient_type VARCHAR(16) NOT NULL,
  recipient_id_hash CHAR(64) NOT NULL,
  template_revision_id_copy VARCHAR(64) NOT NULL,
  target_fingerprint_copy CHAR(64) NOT NULL,
  payload_hash_copy CHAR(64) NOT NULL,
  tombstone_hash CHAR(64) NOT NULL,
  reason_code VARCHAR(64) NOT NULL,
  row_version_copy BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (tombstone_id),
  UNIQUE KEY uq_notification_tombstone_record
    (city_code, notification_id_copy),
  KEY idx_notification_tombstone_event
    (city_code, event_id_copy, created_at),
  CONSTRAINT fk_notification_tombstone_city
    FOREIGN KEY (city_code) REFERENCES cities (city_code)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_notification_tombstone_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_notification_tombstone_recipient
    CHECK (recipient_type IN ('customer','worker')),
  CONSTRAINT chk_notification_tombstone_recipient_hash
    CHECK (recipient_id_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_notification_tombstone_target_hash
    CHECK (target_fingerprint_copy REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_notification_tombstone_payload_hash
    CHECK (payload_hash_copy REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_notification_tombstone_evidence_hash
    CHECK (tombstone_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_notification_tombstone_version CHECK (row_version_copy >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version)
VALUES ('055_phase27b_notification_projection_foundation')
ON DUPLICATE KEY UPDATE version = version;
