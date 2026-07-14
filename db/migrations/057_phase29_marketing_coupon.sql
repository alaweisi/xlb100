-- Phase 29: city-scoped Marketing/Coupon foundation.
-- Depends on: 056_phase28_review_reputation.sql
-- Schema only: no subscriber, subscription, activation, replay, backfill, or business seed.

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  marketing_campaign_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  active_rule_revision_id VARCHAR(64) NULL,
  start_at TIMESTAMP(3) NOT NULL,
  end_at TIMESTAMP(3) NOT NULL,
  reviewed_by VARCHAR(64) NULL,
  reviewed_at TIMESTAMP(3) NULL,
  create_idempotency_key_hash CHAR(64) NOT NULL,
  create_request_fingerprint CHAR(64) NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (marketing_campaign_id),
  UNIQUE KEY uq_mkt_campaign_city_id (city_code, marketing_campaign_id),
  UNIQUE KEY uq_mkt_campaign_create_idem (city_code, created_by, create_idempotency_key_hash),
  CONSTRAINT fk_mkt_campaign_city
    FOREIGN KEY (city_code) REFERENCES cities (city_code)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_mkt_campaign_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_mkt_campaign_status CHECK (
    status IN ('draft','reviewed','scheduled','active','paused','ended','revoked')
  ),
  CONSTRAINT chk_mkt_campaign_window CHECK (end_at > start_at),
  CONSTRAINT chk_mkt_campaign_review CHECK (
    (reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT chk_mkt_campaign_hashes CHECK (
    create_idempotency_key_hash REGEXP '^[0-9a-f]{64}$'
    AND create_request_fingerprint REGEXP '^[0-9a-f]{64}$'
  ),
  CONSTRAINT chk_mkt_campaign_version CHECK (version >= 1),
  INDEX idx_mkt_campaign_city_status_window (city_code, status, start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketing_rule_revisions (
  rule_revision_id VARCHAR(64) NOT NULL,
  marketing_campaign_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  revision BIGINT UNSIGNED NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  allowed_sku_ids_json JSON NOT NULL,
  content_hash CHAR(64) NOT NULL,
  reviewed_by VARCHAR(64) NULL,
  reviewed_at TIMESTAMP(3) NULL,
  published_by VARCHAR(64) NULL,
  published_at TIMESTAMP(3) NULL,
  create_idempotency_key_hash CHAR(64) NOT NULL,
  create_request_fingerprint CHAR(64) NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (rule_revision_id),
  UNIQUE KEY uq_mkt_rule_city_id (city_code, rule_revision_id),
  UNIQUE KEY uq_mkt_rule_campaign_revision (city_code, marketing_campaign_id, revision),
  UNIQUE KEY uq_mkt_rule_campaign_id (city_code, marketing_campaign_id, rule_revision_id),
  UNIQUE KEY uq_mkt_rule_hash_evidence (city_code, rule_revision_id, content_hash),
  UNIQUE KEY uq_mkt_rule_create_idem (city_code, marketing_campaign_id, create_idempotency_key_hash),
  CONSTRAINT fk_mkt_rule_campaign
    FOREIGN KEY (city_code, marketing_campaign_id)
    REFERENCES marketing_campaigns (city_code, marketing_campaign_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_mkt_rule_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_mkt_rule_revision CHECK (revision >= 1),
  CONSTRAINT chk_mkt_rule_status CHECK (status IN ('draft','reviewed','published','retired')),
  CONSTRAINT chk_mkt_rule_skus CHECK (
    JSON_TYPE(allowed_sku_ids_json) = 'ARRAY'
    AND JSON_LENGTH(allowed_sku_ids_json) BETWEEN 1 AND 500
  ),
  CONSTRAINT chk_mkt_rule_hash CHECK (
    content_hash REGEXP '^[0-9a-f]{64}$'
    AND create_idempotency_key_hash REGEXP '^[0-9a-f]{64}$'
    AND create_request_fingerprint REGEXP '^[0-9a-f]{64}$'
  ),
  CONSTRAINT chk_mkt_rule_review CHECK (
    (reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by <> created_by)
  ),
  CONSTRAINT chk_mkt_rule_publish CHECK (
    (published_by IS NULL AND published_at IS NULL)
    OR (published_by IS NOT NULL AND published_at IS NOT NULL
      AND published_by <> reviewed_by)
  ),
  CONSTRAINT chk_mkt_rule_version CHECK (version >= 1),
  INDEX idx_mkt_rule_city_campaign_status (city_code, marketing_campaign_id, status, revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupon_definitions (
  coupon_definition_id VARCHAR(64) NOT NULL,
  marketing_campaign_id VARCHAR(64) NOT NULL,
  rule_revision_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  face_value_minor BIGINT UNSIGNED NOT NULL,
  min_spend_minor BIGINT UNSIGNED NOT NULL,
  issuance_cap BIGINT UNSIGNED NOT NULL,
  issued_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  compensation_cap BIGINT UNSIGNED NOT NULL,
  compensation_issued_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  valid_from TIMESTAMP(3) NOT NULL,
  valid_until TIMESTAMP(3) NOT NULL,
  create_idempotency_key_hash CHAR(64) NOT NULL,
  create_request_fingerprint CHAR(64) NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (coupon_definition_id),
  UNIQUE KEY uq_coupon_def_city_id (city_code, coupon_definition_id),
  UNIQUE KEY uq_coupon_def_scope_id (city_code, marketing_campaign_id, rule_revision_id, coupon_definition_id),
  UNIQUE KEY uq_coupon_def_create_idem (city_code, created_by, create_idempotency_key_hash),
  CONSTRAINT fk_coupon_def_rule
    FOREIGN KEY (city_code, marketing_campaign_id, rule_revision_id)
    REFERENCES marketing_rule_revisions (city_code, marketing_campaign_id, rule_revision_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_coupon_def_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_coupon_def_status CHECK (status IN ('draft','active','suspended','expired','retired')),
  CONSTRAINT chk_coupon_def_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_coupon_def_money CHECK (
    face_value_minor > 0 AND min_spend_minor > face_value_minor
  ),
  CONSTRAINT chk_coupon_def_inventory CHECK (
    issuance_cap > 0 AND issued_count <= issuance_cap
    AND compensation_cap > 0 AND compensation_issued_count <= compensation_cap
  ),
  CONSTRAINT chk_coupon_def_window CHECK (valid_until > valid_from),
  CONSTRAINT chk_coupon_def_hashes CHECK (
    create_idempotency_key_hash REGEXP '^[0-9a-f]{64}$'
    AND create_request_fingerprint REGEXP '^[0-9a-f]{64}$'
  ),
  CONSTRAINT chk_coupon_def_version CHECK (version >= 1),
  INDEX idx_coupon_def_city_status_window (city_code, status, valid_from, valid_until),
  INDEX idx_coupon_def_city_campaign (city_code, marketing_campaign_id, rule_revision_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupon_grants (
  coupon_grant_id VARCHAR(64) NOT NULL,
  coupon_definition_id VARCHAR(64) NOT NULL,
  marketing_campaign_id VARCHAR(64) NOT NULL,
  rule_revision_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'granted',
  issuance_reason VARCHAR(32) NOT NULL,
  issuance_ref VARCHAR(128) NOT NULL,
  available_at TIMESTAMP(3) NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  idempotency_key_hash CHAR(64) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (coupon_grant_id),
  UNIQUE KEY uq_coupon_grant_city_id (city_code, coupon_grant_id),
  UNIQUE KEY uq_coupon_grant_scope_id (
    city_code, customer_id, coupon_definition_id, marketing_campaign_id, rule_revision_id, coupon_grant_id
  ),
  UNIQUE KEY uq_coupon_grant_decision_ref (
    city_code, customer_id, coupon_definition_id, coupon_grant_id
  ),
  UNIQUE KEY uq_coupon_grant_rule_evidence (
    city_code, customer_id, coupon_definition_id, rule_revision_id, coupon_grant_id
  ),
  UNIQUE KEY uq_coupon_grant_issuance (
    city_code, coupon_definition_id, customer_id, issuance_reason, issuance_ref
  ),
  UNIQUE KEY uq_coupon_grant_idem (city_code, created_by, idempotency_key_hash),
  CONSTRAINT fk_coupon_grant_definition
    FOREIGN KEY (city_code, marketing_campaign_id, rule_revision_id, coupon_definition_id)
    REFERENCES coupon_definitions (city_code, marketing_campaign_id, rule_revision_id, coupon_definition_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_coupon_grant_rule_evidence
    FOREIGN KEY (city_code, marketing_campaign_id, rule_revision_id)
    REFERENCES marketing_rule_revisions (city_code, marketing_campaign_id, rule_revision_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_coupon_grant_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_coupon_grant_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_coupon_grant_status CHECK (
    status IN ('granted','available','reserved','redeemed','released','expired','revoked')
  ),
  CONSTRAINT chk_coupon_grant_reason CHECK (
    issuance_reason IN ('campaign_targeted','admin_manual','order_cancellation','full_refund','approved_compensation')
  ),
  CONSTRAINT chk_coupon_grant_available CHECK (
    (status = 'granted' AND available_at IS NULL)
    OR (status IN ('available','reserved','redeemed','released') AND available_at IS NOT NULL)
    OR status IN ('expired','revoked')
  ),
  CONSTRAINT chk_coupon_grant_hashes CHECK (
    idempotency_key_hash REGEXP '^[0-9a-f]{64}$'
    AND request_fingerprint REGEXP '^[0-9a-f]{64}$'
  ),
  CONSTRAINT chk_coupon_grant_version CHECK (version >= 1),
  INDEX idx_coupon_grant_customer_state (city_code, customer_id, status, expires_at),
  INDEX idx_coupon_grant_definition_state (city_code, coupon_definition_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketing_discount_decisions (
  discount_decision_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  sku_id VARCHAR(64) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  price_rule_id VARCHAR(64) NOT NULL,
  price_rule_version BIGINT UNSIGNED NOT NULL,
  rule_revision_id VARCHAR(64) NOT NULL,
  rule_content_hash CHAR(64) NOT NULL,
  coupon_definition_id VARCHAR(64) NOT NULL,
  coupon_grant_id VARCHAR(64) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  gross_amount_minor BIGINT UNSIGNED NOT NULL,
  discount_amount_minor BIGINT UNSIGNED NOT NULL,
  net_amount_minor BIGINT UNSIGNED NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  issue_idempotency_key_hash CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'issued',
  expires_at TIMESTAMP(3) NOT NULL,
  accepted_order_id VARCHAR(64) NULL,
  accepted_order_command_key_hash CHAR(64) NULL,
  accepted_at TIMESTAMP(3) NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (discount_decision_id),
  UNIQUE KEY uq_mkt_decision_city_id (city_code, discount_decision_id),
  UNIQUE KEY uq_mkt_decision_issue_idem (city_code, customer_id, issue_idempotency_key_hash),
  UNIQUE KEY uq_mkt_decision_accepted_order (city_code, accepted_order_id),
  UNIQUE KEY uq_mkt_decision_order_command (city_code, customer_id, accepted_order_command_key_hash),
  UNIQUE KEY uq_mkt_decision_scope_id (
    city_code, customer_id, coupon_grant_id, discount_decision_id
  ),
  UNIQUE KEY uq_mkt_decision_amount_evidence (
    city_code, customer_id, coupon_grant_id, discount_decision_id, currency, discount_amount_minor
  ),
  INDEX idx_mkt_decision_grant_rule_evidence (
    city_code, customer_id, coupon_definition_id, rule_revision_id, coupon_grant_id
  ),
  CONSTRAINT fk_mkt_decision_grant
    FOREIGN KEY (
      city_code, customer_id, coupon_definition_id, rule_revision_id, coupon_grant_id
    ) REFERENCES coupon_grants (
      city_code, customer_id, coupon_definition_id, rule_revision_id, coupon_grant_id
    )
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mkt_decision_rule_evidence
    FOREIGN KEY (city_code, rule_revision_id, rule_content_hash)
    REFERENCES marketing_rule_revisions (city_code, rule_revision_id, content_hash)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mkt_decision_sku
    FOREIGN KEY (sku_id, city_code) REFERENCES service_skus (sku_id, city_code)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mkt_decision_price_rule
    FOREIGN KEY (price_rule_id, city_code) REFERENCES price_rules (price_rule_id, city_code)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_mkt_decision_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_mkt_decision_quantity CHECK (quantity BETWEEN 1 AND 1000),
  CONSTRAINT chk_mkt_decision_versions CHECK (price_rule_version >= 1 AND version >= 1),
  CONSTRAINT chk_mkt_decision_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_mkt_decision_money CHECK (
    gross_amount_minor > 0
    AND discount_amount_minor > 0
    AND discount_amount_minor < gross_amount_minor
    AND net_amount_minor = gross_amount_minor - discount_amount_minor
    AND net_amount_minor >= 1
  ),
  CONSTRAINT chk_mkt_decision_hashes CHECK (
    request_fingerprint REGEXP '^[0-9a-f]{64}$'
    AND rule_content_hash REGEXP '^[0-9a-f]{64}$'
    AND issue_idempotency_key_hash REGEXP '^[0-9a-f]{64}$'
    AND (accepted_order_command_key_hash IS NULL
      OR accepted_order_command_key_hash REGEXP '^[0-9a-f]{64}$')
  ),
  CONSTRAINT chk_mkt_decision_status CHECK (status IN ('issued','accepted','expired','rejected')),
  CONSTRAINT chk_mkt_decision_acceptance CHECK (
    (status = 'accepted' AND accepted_order_id IS NOT NULL
      AND accepted_order_command_key_hash IS NOT NULL AND accepted_at IS NOT NULL)
    OR (status <> 'accepted' AND accepted_order_id IS NULL
      AND accepted_order_command_key_hash IS NULL AND accepted_at IS NULL)
  ),
  CONSTRAINT chk_mkt_decision_expiry CHECK (expires_at > created_at),
  INDEX idx_mkt_decision_customer_state (city_code, customer_id, status, expires_at),
  INDEX idx_mkt_decision_grant_state (city_code, coupon_grant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupon_reservations (
  coupon_reservation_id VARCHAR(64) NOT NULL,
  coupon_grant_id VARCHAR(64) NOT NULL,
  discount_decision_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  discount_amount_minor BIGINT UNSIGNED NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  released_reason VARCHAR(500) NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  blocking_grant_id VARCHAR(64) GENERATED ALWAYS AS (
    CASE WHEN status IN ('active','redeemed') THEN coupon_grant_id ELSE NULL END
  ) STORED,
  PRIMARY KEY (coupon_reservation_id),
  UNIQUE KEY uq_coupon_reservation_city_id (city_code, coupon_reservation_id),
  UNIQUE KEY uq_coupon_reservation_decision (city_code, discount_decision_id),
  UNIQUE KEY uq_coupon_reservation_order (city_code, order_id),
  UNIQUE KEY uq_coupon_reservation_blocking_grant (city_code, blocking_grant_id),
  UNIQUE KEY uq_coupon_reservation_scope_id (
    city_code, customer_id, coupon_grant_id, discount_decision_id, coupon_reservation_id
  ),
  UNIQUE KEY uq_coupon_reservation_amount_evidence (
    city_code, customer_id, coupon_grant_id, discount_decision_id, currency,
    discount_amount_minor, coupon_reservation_id, order_id
  ),
  CONSTRAINT fk_coupon_reservation_decision
    FOREIGN KEY (
      city_code, customer_id, coupon_grant_id, discount_decision_id, currency, discount_amount_minor
    ) REFERENCES marketing_discount_decisions (
      city_code, customer_id, coupon_grant_id, discount_decision_id, currency, discount_amount_minor
    )
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_coupon_reservation_order
    FOREIGN KEY (city_code, order_id) REFERENCES orders (city_code, order_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_coupon_reservation_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_coupon_reservation_status CHECK (status IN ('active','redeemed','released','expired')),
  CONSTRAINT chk_coupon_reservation_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_coupon_reservation_amount CHECK (discount_amount_minor > 0),
  CONSTRAINT chk_coupon_reservation_release CHECK (
    (status = 'released' AND released_reason IS NOT NULL)
    OR (status <> 'released' AND released_reason IS NULL)
  ),
  CONSTRAINT chk_coupon_reservation_expiry CHECK (expires_at > created_at),
  CONSTRAINT chk_coupon_reservation_version CHECK (version >= 1),
  INDEX idx_coupon_reservation_expiry (city_code, status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  coupon_redemption_id VARCHAR(64) NOT NULL,
  coupon_reservation_id VARCHAR(64) NOT NULL,
  coupon_grant_id VARCHAR(64) NOT NULL,
  discount_decision_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  discount_amount_minor BIGINT UNSIGNED NOT NULL,
  redeemed_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (coupon_redemption_id),
  UNIQUE KEY uq_coupon_redemption_city_id (city_code, coupon_redemption_id),
  UNIQUE KEY uq_coupon_redemption_reservation (city_code, coupon_reservation_id),
  UNIQUE KEY uq_coupon_redemption_grant (city_code, coupon_grant_id),
  UNIQUE KEY uq_coupon_redemption_decision (city_code, discount_decision_id),
  UNIQUE KEY uq_coupon_redemption_order (city_code, order_id),
  UNIQUE KEY uq_coupon_redemption_scope_id (
    city_code, customer_id, coupon_grant_id, coupon_redemption_id
  ),
  UNIQUE KEY uq_coupon_redemption_customer_ref (
    city_code, customer_id, coupon_redemption_id
  ),
  UNIQUE KEY uq_coupon_redemption_amount_evidence (
    city_code, customer_id, coupon_redemption_id, currency, discount_amount_minor
  ),
  INDEX idx_coupon_redemption_reservation_amount (
    city_code, customer_id, coupon_grant_id, discount_decision_id, currency,
    discount_amount_minor, coupon_reservation_id, order_id
  ),
  CONSTRAINT fk_coupon_redemption_reservation
    FOREIGN KEY (
      city_code, customer_id, coupon_grant_id, discount_decision_id, currency,
      discount_amount_minor, coupon_reservation_id, order_id
    ) REFERENCES coupon_reservations (
      city_code, customer_id, coupon_grant_id, discount_decision_id, currency,
      discount_amount_minor, coupon_reservation_id, order_id
    )
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_coupon_redemption_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_coupon_redemption_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_coupon_redemption_amount CHECK (discount_amount_minor > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketing_compensations (
  compensation_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  source_coupon_redemption_id VARCHAR(64) NOT NULL,
  trigger_type VARCHAR(24) NOT NULL,
  trigger_id VARCHAR(64) NOT NULL,
  source_delivery_id VARCHAR(64) NOT NULL,
  source_event_id VARCHAR(64) NOT NULL,
  source_payload_hash CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  amount_minor BIGINT UNSIGNED NOT NULL,
  resulting_coupon_grant_id VARCHAR(64) NULL,
  decision_reason VARCHAR(500) NULL,
  expires_at TIMESTAMP(3) NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (compensation_id),
  UNIQUE KEY uq_mkt_compensation_city_id (city_code, compensation_id),
  UNIQUE KEY uq_mkt_compensation_trigger (
    city_code, source_coupon_redemption_id, trigger_type, trigger_id
  ),
  UNIQUE KEY uq_mkt_compensation_delivery (city_code, source_delivery_id),
  UNIQUE KEY uq_mkt_compensation_result_grant (city_code, resulting_coupon_grant_id),
  INDEX idx_mkt_compensation_redemption_amount (
    city_code, customer_id, source_coupon_redemption_id, currency, amount_minor
  ),
  CONSTRAINT fk_mkt_compensation_redemption
    FOREIGN KEY (city_code, customer_id, source_coupon_redemption_id, currency, amount_minor)
    REFERENCES coupon_redemptions (
      city_code, customer_id, coupon_redemption_id, currency, discount_amount_minor
    )
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mkt_compensation_delivery
    FOREIGN KEY (city_code, source_delivery_id)
    REFERENCES platform_event_deliveries (city_code, delivery_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mkt_compensation_source_event
    FOREIGN KEY (city_code, source_event_id) REFERENCES event_outbox (city_code, event_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_mkt_compensation_result_grant
    FOREIGN KEY (city_code, resulting_coupon_grant_id)
    REFERENCES coupon_grants (city_code, coupon_grant_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_mkt_compensation_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_mkt_compensation_trigger CHECK (trigger_type IN ('order_cancellation','full_refund')),
  CONSTRAINT chk_mkt_compensation_status CHECK (status IN ('pending','granted','denied')),
  CONSTRAINT chk_mkt_compensation_currency CHECK (currency = 'CNY'),
  CONSTRAINT chk_mkt_compensation_amount CHECK (amount_minor > 0),
  CONSTRAINT chk_mkt_compensation_hash CHECK (source_payload_hash REGEXP '^[0-9a-f]{64}$'),
  CONSTRAINT chk_mkt_compensation_result CHECK (
    (status = 'pending' AND resulting_coupon_grant_id IS NULL
      AND decision_reason IS NULL AND expires_at IS NULL)
    OR (status = 'granted' AND resulting_coupon_grant_id IS NOT NULL
      AND decision_reason IS NULL AND expires_at IS NOT NULL)
    OR (status = 'denied' AND resulting_coupon_grant_id IS NULL
      AND decision_reason IS NOT NULL AND expires_at IS NULL)
  ),
  CONSTRAINT chk_mkt_compensation_version CHECK (version >= 1),
  INDEX idx_mkt_compensation_customer (city_code, customer_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketing_audit_records (
  marketing_audit_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  aggregate_type VARCHAR(32) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  action VARCHAR(128) NOT NULL,
  actor_id VARCHAR(64) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  expected_version BIGINT UNSIGNED NULL,
  actual_version BIGINT UNSIGNED NOT NULL,
  trace_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (marketing_audit_id),
  UNIQUE KEY uq_mkt_audit_city_id (city_code, marketing_audit_id),
  CONSTRAINT fk_mkt_audit_city
    FOREIGN KEY (city_code) REFERENCES cities (city_code)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_mkt_audit_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_mkt_audit_aggregate CHECK (
    aggregate_type IN (
      'marketing_campaign','marketing_rule_revision','coupon_definition',
      'coupon_grant','coupon_reservation','discount_decision','marketing_compensation'
    )
  ),
  CONSTRAINT chk_mkt_audit_versions CHECK (
    (expected_version IS NULL OR expected_version >= 1) AND actual_version >= 1
  ),
  INDEX idx_mkt_audit_aggregate (city_code, aggregate_type, aggregate_id, created_at),
  INDEX idx_mkt_audit_actor (city_code, actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phase 29 was exercised locally before Lock. These idempotent ALTERs upgrade an
-- already-created 057 schema as well as recovering safely after partial DDL.
SET @mkt_rule_hash_index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'marketing_rule_revisions'
    AND index_name = 'uq_mkt_rule_hash_evidence'
);
SET @mkt_rule_hash_index_sql := IF(
  @mkt_rule_hash_index_exists = 0,
  'ALTER TABLE marketing_rule_revisions ADD UNIQUE KEY uq_mkt_rule_hash_evidence (city_code, rule_revision_id, content_hash)',
  'SELECT 1'
);
PREPARE mkt_rule_hash_index_stmt FROM @mkt_rule_hash_index_sql;
EXECUTE mkt_rule_hash_index_stmt;
DEALLOCATE PREPARE mkt_rule_hash_index_stmt;

SET @coupon_grant_rule_index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'coupon_grants'
    AND index_name = 'uq_coupon_grant_rule_evidence'
);
SET @coupon_grant_rule_index_sql := IF(
  @coupon_grant_rule_index_exists = 0,
  'ALTER TABLE coupon_grants ADD UNIQUE KEY uq_coupon_grant_rule_evidence (city_code, customer_id, coupon_definition_id, rule_revision_id, coupon_grant_id)',
  'SELECT 1'
);
PREPARE coupon_grant_rule_index_stmt FROM @coupon_grant_rule_index_sql;
EXECUTE coupon_grant_rule_index_stmt;
DEALLOCATE PREPARE coupon_grant_rule_index_stmt;

SET @mkt_decision_amount_index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'marketing_discount_decisions'
    AND index_name = 'uq_mkt_decision_amount_evidence'
);
SET @mkt_decision_amount_index_sql := IF(
  @mkt_decision_amount_index_exists = 0,
  'ALTER TABLE marketing_discount_decisions ADD UNIQUE KEY uq_mkt_decision_amount_evidence (city_code, customer_id, coupon_grant_id, discount_decision_id, currency, discount_amount_minor)',
  'SELECT 1'
);
PREPARE mkt_decision_amount_index_stmt FROM @mkt_decision_amount_index_sql;
EXECUTE mkt_decision_amount_index_stmt;
DEALLOCATE PREPARE mkt_decision_amount_index_stmt;

SET @coupon_reservation_amount_index_columns := (
  SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'coupon_reservations'
    AND index_name = 'uq_coupon_reservation_amount_evidence'
);
SET @coupon_reservation_amount_index_sql := IF(
  @coupon_reservation_amount_index_columns = 'city_code,customer_id,coupon_grant_id,discount_decision_id,currency,discount_amount_minor,coupon_reservation_id,order_id',
  'SELECT 1',
  IF(
    @coupon_reservation_amount_index_columns IS NULL,
    'ALTER TABLE coupon_reservations ADD UNIQUE KEY uq_coupon_reservation_amount_evidence (city_code, customer_id, coupon_grant_id, discount_decision_id, currency, discount_amount_minor, coupon_reservation_id, order_id)',
    'ALTER TABLE coupon_reservations DROP INDEX uq_coupon_reservation_amount_evidence, ADD UNIQUE KEY uq_coupon_reservation_amount_evidence (city_code, customer_id, coupon_grant_id, discount_decision_id, currency, discount_amount_minor, coupon_reservation_id, order_id)'
  )
);
PREPARE coupon_reservation_amount_index_stmt FROM @coupon_reservation_amount_index_sql;
EXECUTE coupon_reservation_amount_index_stmt;
DEALLOCATE PREPARE coupon_reservation_amount_index_stmt;

SET @coupon_redemption_amount_index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'coupon_redemptions'
    AND index_name = 'uq_coupon_redemption_amount_evidence'
);
SET @coupon_redemption_amount_index_sql := IF(
  @coupon_redemption_amount_index_exists = 0,
  'ALTER TABLE coupon_redemptions ADD UNIQUE KEY uq_coupon_redemption_amount_evidence (city_code, customer_id, coupon_redemption_id, currency, discount_amount_minor)',
  'SELECT 1'
);
PREPARE coupon_redemption_amount_index_stmt FROM @coupon_redemption_amount_index_sql;
EXECUTE coupon_redemption_amount_index_stmt;
DEALLOCATE PREPARE coupon_redemption_amount_index_stmt;

SET @mkt_decision_grant_index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'marketing_discount_decisions'
    AND index_name = 'idx_mkt_decision_grant_rule_evidence'
);
SET @mkt_decision_grant_index_sql := IF(
  @mkt_decision_grant_index_exists = 0,
  'ALTER TABLE marketing_discount_decisions ADD INDEX idx_mkt_decision_grant_rule_evidence (city_code, customer_id, coupon_definition_id, rule_revision_id, coupon_grant_id)',
  'SELECT 1'
);
PREPARE mkt_decision_grant_index_stmt FROM @mkt_decision_grant_index_sql;
EXECUTE mkt_decision_grant_index_stmt;
DEALLOCATE PREPARE mkt_decision_grant_index_stmt;

SET @coupon_redemption_reservation_index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'coupon_redemptions'
    AND index_name = 'idx_coupon_redemption_reservation_amount'
);
SET @coupon_redemption_reservation_index_sql := IF(
  @coupon_redemption_reservation_index_exists = 0,
  'ALTER TABLE coupon_redemptions ADD INDEX idx_coupon_redemption_reservation_amount (city_code, customer_id, coupon_grant_id, discount_decision_id, currency, discount_amount_minor, coupon_reservation_id, order_id)',
  'SELECT 1'
);
PREPARE coupon_redemption_reservation_index_stmt FROM @coupon_redemption_reservation_index_sql;
EXECUTE coupon_redemption_reservation_index_stmt;
DEALLOCATE PREPARE coupon_redemption_reservation_index_stmt;

SET @mkt_compensation_redemption_index_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'marketing_compensations'
    AND index_name = 'idx_mkt_compensation_redemption_amount'
);
SET @mkt_compensation_redemption_index_sql := IF(
  @mkt_compensation_redemption_index_exists = 0,
  'ALTER TABLE marketing_compensations ADD INDEX idx_mkt_compensation_redemption_amount (city_code, customer_id, source_coupon_redemption_id, currency, amount_minor)',
  'SELECT 1'
);
PREPARE mkt_compensation_redemption_index_stmt FROM @mkt_compensation_redemption_index_sql;
EXECUTE mkt_compensation_redemption_index_stmt;
DEALLOCATE PREPARE mkt_compensation_redemption_index_stmt;

SET @coupon_grant_rule_fk_exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE() AND table_name = 'coupon_grants'
    AND constraint_name = 'fk_coupon_grant_rule_evidence' AND constraint_type = 'FOREIGN KEY'
);
SET @coupon_grant_rule_fk_sql := IF(
  @coupon_grant_rule_fk_exists = 0,
  'ALTER TABLE coupon_grants ADD CONSTRAINT fk_coupon_grant_rule_evidence FOREIGN KEY (city_code, marketing_campaign_id, rule_revision_id) REFERENCES marketing_rule_revisions (city_code, marketing_campaign_id, rule_revision_id) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1'
);
PREPARE coupon_grant_rule_fk_stmt FROM @coupon_grant_rule_fk_sql;
EXECUTE coupon_grant_rule_fk_stmt;
DEALLOCATE PREPARE coupon_grant_rule_fk_stmt;

SET @mkt_decision_rule_fk_exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE() AND table_name = 'marketing_discount_decisions'
    AND constraint_name = 'fk_mkt_decision_rule_evidence' AND constraint_type = 'FOREIGN KEY'
);
SET @mkt_decision_rule_fk_sql := IF(
  @mkt_decision_rule_fk_exists = 0,
  'ALTER TABLE marketing_discount_decisions ADD CONSTRAINT fk_mkt_decision_rule_evidence FOREIGN KEY (city_code, rule_revision_id, rule_content_hash) REFERENCES marketing_rule_revisions (city_code, rule_revision_id, content_hash) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1'
);
PREPARE mkt_decision_rule_fk_stmt FROM @mkt_decision_rule_fk_sql;
EXECUTE mkt_decision_rule_fk_stmt;
DEALLOCATE PREPARE mkt_decision_rule_fk_stmt;

SET @mkt_decision_grant_fk_columns := (
  SELECT GROUP_CONCAT(column_name ORDER BY ordinal_position SEPARATOR ',')
  FROM information_schema.key_column_usage
  WHERE constraint_schema = DATABASE() AND table_name = 'marketing_discount_decisions'
    AND constraint_name = 'fk_mkt_decision_grant' AND referenced_table_name IS NOT NULL
);
SET @mkt_decision_grant_fk_drop_sql := IF(
  @mkt_decision_grant_fk_columns IS NULL
    OR @mkt_decision_grant_fk_columns = 'city_code,customer_id,coupon_definition_id,rule_revision_id,coupon_grant_id',
  'SELECT 1', 'ALTER TABLE marketing_discount_decisions DROP FOREIGN KEY fk_mkt_decision_grant'
);
PREPARE mkt_decision_grant_fk_drop_stmt FROM @mkt_decision_grant_fk_drop_sql;
EXECUTE mkt_decision_grant_fk_drop_stmt;
DEALLOCATE PREPARE mkt_decision_grant_fk_drop_stmt;
SET @mkt_decision_grant_fk_exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE() AND table_name = 'marketing_discount_decisions'
    AND constraint_name = 'fk_mkt_decision_grant' AND constraint_type = 'FOREIGN KEY'
);
SET @mkt_decision_grant_fk_add_sql := IF(
  @mkt_decision_grant_fk_exists = 0,
  'ALTER TABLE marketing_discount_decisions ADD CONSTRAINT fk_mkt_decision_grant FOREIGN KEY (city_code, customer_id, coupon_definition_id, rule_revision_id, coupon_grant_id) REFERENCES coupon_grants (city_code, customer_id, coupon_definition_id, rule_revision_id, coupon_grant_id) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1'
);
PREPARE mkt_decision_grant_fk_add_stmt FROM @mkt_decision_grant_fk_add_sql;
EXECUTE mkt_decision_grant_fk_add_stmt;
DEALLOCATE PREPARE mkt_decision_grant_fk_add_stmt;

SET @coupon_reservation_decision_fk_columns := (
  SELECT GROUP_CONCAT(column_name ORDER BY ordinal_position SEPARATOR ',')
  FROM information_schema.key_column_usage
  WHERE constraint_schema = DATABASE() AND table_name = 'coupon_reservations'
    AND constraint_name = 'fk_coupon_reservation_decision' AND referenced_table_name IS NOT NULL
);
SET @coupon_reservation_decision_fk_drop_sql := IF(
  @coupon_reservation_decision_fk_columns IS NULL
    OR @coupon_reservation_decision_fk_columns = 'city_code,customer_id,coupon_grant_id,discount_decision_id,currency,discount_amount_minor',
  'SELECT 1', 'ALTER TABLE coupon_reservations DROP FOREIGN KEY fk_coupon_reservation_decision'
);
PREPARE coupon_reservation_decision_fk_drop_stmt FROM @coupon_reservation_decision_fk_drop_sql;
EXECUTE coupon_reservation_decision_fk_drop_stmt;
DEALLOCATE PREPARE coupon_reservation_decision_fk_drop_stmt;
SET @coupon_reservation_decision_fk_exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE() AND table_name = 'coupon_reservations'
    AND constraint_name = 'fk_coupon_reservation_decision' AND constraint_type = 'FOREIGN KEY'
);
SET @coupon_reservation_decision_fk_add_sql := IF(
  @coupon_reservation_decision_fk_exists = 0,
  'ALTER TABLE coupon_reservations ADD CONSTRAINT fk_coupon_reservation_decision FOREIGN KEY (city_code, customer_id, coupon_grant_id, discount_decision_id, currency, discount_amount_minor) REFERENCES marketing_discount_decisions (city_code, customer_id, coupon_grant_id, discount_decision_id, currency, discount_amount_minor) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1'
);
PREPARE coupon_reservation_decision_fk_add_stmt FROM @coupon_reservation_decision_fk_add_sql;
EXECUTE coupon_reservation_decision_fk_add_stmt;
DEALLOCATE PREPARE coupon_reservation_decision_fk_add_stmt;

SET @coupon_redemption_reservation_fk_columns := (
  SELECT GROUP_CONCAT(column_name ORDER BY ordinal_position SEPARATOR ',')
  FROM information_schema.key_column_usage
  WHERE constraint_schema = DATABASE() AND table_name = 'coupon_redemptions'
    AND constraint_name = 'fk_coupon_redemption_reservation' AND referenced_table_name IS NOT NULL
);
SET @coupon_redemption_reservation_fk_drop_sql := IF(
  @coupon_redemption_reservation_fk_columns IS NULL
    OR @coupon_redemption_reservation_fk_columns = 'city_code,customer_id,coupon_grant_id,discount_decision_id,currency,discount_amount_minor,coupon_reservation_id,order_id',
  'SELECT 1', 'ALTER TABLE coupon_redemptions DROP FOREIGN KEY fk_coupon_redemption_reservation'
);
PREPARE coupon_redemption_reservation_fk_drop_stmt FROM @coupon_redemption_reservation_fk_drop_sql;
EXECUTE coupon_redemption_reservation_fk_drop_stmt;
DEALLOCATE PREPARE coupon_redemption_reservation_fk_drop_stmt;
SET @coupon_redemption_reservation_fk_exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE() AND table_name = 'coupon_redemptions'
    AND constraint_name = 'fk_coupon_redemption_reservation' AND constraint_type = 'FOREIGN KEY'
);
SET @coupon_redemption_reservation_fk_add_sql := IF(
  @coupon_redemption_reservation_fk_exists = 0,
  'ALTER TABLE coupon_redemptions ADD CONSTRAINT fk_coupon_redemption_reservation FOREIGN KEY (city_code, customer_id, coupon_grant_id, discount_decision_id, currency, discount_amount_minor, coupon_reservation_id, order_id) REFERENCES coupon_reservations (city_code, customer_id, coupon_grant_id, discount_decision_id, currency, discount_amount_minor, coupon_reservation_id, order_id) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1'
);
PREPARE coupon_redemption_reservation_fk_add_stmt FROM @coupon_redemption_reservation_fk_add_sql;
EXECUTE coupon_redemption_reservation_fk_add_stmt;
DEALLOCATE PREPARE coupon_redemption_reservation_fk_add_stmt;

SET @mkt_compensation_redemption_fk_columns := (
  SELECT GROUP_CONCAT(column_name ORDER BY ordinal_position SEPARATOR ',')
  FROM information_schema.key_column_usage
  WHERE constraint_schema = DATABASE() AND table_name = 'marketing_compensations'
    AND constraint_name = 'fk_mkt_compensation_redemption' AND referenced_table_name IS NOT NULL
);
SET @mkt_compensation_redemption_fk_drop_sql := IF(
  @mkt_compensation_redemption_fk_columns IS NULL
    OR @mkt_compensation_redemption_fk_columns = 'city_code,customer_id,source_coupon_redemption_id,currency,amount_minor',
  'SELECT 1', 'ALTER TABLE marketing_compensations DROP FOREIGN KEY fk_mkt_compensation_redemption'
);
PREPARE mkt_compensation_redemption_fk_drop_stmt FROM @mkt_compensation_redemption_fk_drop_sql;
EXECUTE mkt_compensation_redemption_fk_drop_stmt;
DEALLOCATE PREPARE mkt_compensation_redemption_fk_drop_stmt;
SET @mkt_compensation_redemption_fk_exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE() AND table_name = 'marketing_compensations'
    AND constraint_name = 'fk_mkt_compensation_redemption' AND constraint_type = 'FOREIGN KEY'
);
SET @mkt_compensation_redemption_fk_add_sql := IF(
  @mkt_compensation_redemption_fk_exists = 0,
  'ALTER TABLE marketing_compensations ADD CONSTRAINT fk_mkt_compensation_redemption FOREIGN KEY (city_code, customer_id, source_coupon_redemption_id, currency, amount_minor) REFERENCES coupon_redemptions (city_code, customer_id, coupon_redemption_id, currency, discount_amount_minor) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1'
);
PREPARE mkt_compensation_redemption_fk_add_stmt FROM @mkt_compensation_redemption_fk_add_sql;
EXECUTE mkt_compensation_redemption_fk_add_stmt;
DEALLOCATE PREPARE mkt_compensation_redemption_fk_add_stmt;

-- Add the campaign active-revision composite FK only after both new tables exist.
SET @mkt_active_rule_fk_exists := (
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'marketing_campaigns'
    AND constraint_name = 'fk_mkt_campaign_active_rule'
    AND constraint_type = 'FOREIGN KEY'
);
SET @mkt_active_rule_fk_sql := IF(
  @mkt_active_rule_fk_exists = 0,
  'ALTER TABLE marketing_campaigns ADD CONSTRAINT fk_mkt_campaign_active_rule FOREIGN KEY (city_code, marketing_campaign_id, active_rule_revision_id) REFERENCES marketing_rule_revisions (city_code, marketing_campaign_id, rule_revision_id) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1'
);
PREPARE mkt_active_rule_fk_stmt FROM @mkt_active_rule_fk_sql;
EXECUTE mkt_active_rule_fk_stmt;
DEALLOCATE PREPARE mkt_active_rule_fk_stmt;

INSERT INTO schema_migrations (version)
VALUES ('057_phase29_marketing_coupon')
ON DUPLICATE KEY UPDATE version = version;
