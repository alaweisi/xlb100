-- OA notification inbox. Additive and isolated from customer/worker notification tables.
-- Depends on: 063_oa_collaboration_foundation.sql

CREATE TABLE IF NOT EXISTS oa_notifications (
  notification_id VARCHAR(64) NOT NULL,
  recipient_membership_id VARCHAR(64) NOT NULL,
  organization_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NULL,
  notification_type VARCHAR(64) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(500) NOT NULL,
  source_type VARCHAR(64) NOT NULL,
  source_id VARCHAR(128) NOT NULL,
  dedupe_key VARCHAR(160) NOT NULL,
  deep_link VARCHAR(255) NULL,
  read_at TIMESTAMP(3) NULL,
  archived_at TIMESTAMP(3) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (notification_id),
  UNIQUE KEY uk_oa_notification_dedupe (recipient_membership_id, dedupe_key),
  KEY idx_oa_notification_inbox (recipient_membership_id, archived_at, read_at, created_at),
  KEY idx_oa_notification_scope (organization_id, city_code, created_at),
  CONSTRAINT fk_oa_notification_recipient FOREIGN KEY (recipient_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_notification_org FOREIGN KEY (organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_notification_city FOREIGN KEY (city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_notification_city_real CHECK (city_code IS NULL OR city_code <> '__global__')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('064_oa_notifications')
ON DUPLICATE KEY UPDATE version = version;
