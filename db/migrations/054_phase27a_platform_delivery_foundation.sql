-- Phase 27A: additive per-subscriber Platform Delivery foundation.
-- Empty-schema migration only: no city, subscriber, subscription, allowlist,
-- activation, live-start, backfill, or replay data is inserted here.
-- CREATE TABLE is atomic in MySQL; IF NOT EXISTS permits safe retry after a
-- prior run stopped between table DDL statements. The ledger marker is last.

CREATE TABLE IF NOT EXISTS platform_event_subscribers (
  subscriber_id VARCHAR(64) NOT NULL,
  stable_name VARCHAR(128) NOT NULL,
  owner_domain VARCHAR(64) NOT NULL,
  owner_contact VARCHAR(255) NULL,
  handler_revision VARCHAR(128) NOT NULL,
  purpose VARCHAR(255) NOT NULL,
  max_pii_level VARCHAR(8) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'proposed',
  created_by_service_id VARCHAR(128) NOT NULL,
  updated_by_service_id VARCHAR(128) NOT NULL,
  row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (subscriber_id),
  UNIQUE KEY uq_platform_subscriber_stable_name (stable_name),
  CONSTRAINT chk_platform_subscriber_status
    CHECK (status IN ('proposed','active','paused','revoked')),
  CONSTRAINT chk_platform_subscriber_pii
    CHECK (max_pii_level IN ('P0','P1','P2')),
  CONSTRAINT chk_platform_subscriber_version CHECK (row_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_event_subscriptions (
  subscription_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  subscriber_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  event_major_version SMALLINT UNSIGNED NOT NULL,
  compatibility_handler_revision VARCHAR(128) NOT NULL,
  live_start_created_at TIMESTAMP(3) NULL,
  live_start_event_id VARCHAR(64) NULL,
  retention_class VARCHAR(8) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'proposed',
  lease_seconds INT UNSIGNED NOT NULL,
  max_attempts INT UNSIGNED NOT NULL,
  created_by_service_id VARCHAR(128) NOT NULL,
  updated_by_service_id VARCHAR(128) NOT NULL,
  row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (subscription_id),
  UNIQUE KEY uq_platform_subscription_exact
    (city_code, subscriber_id, event_type, event_major_version),
  UNIQUE KEY uq_platform_subscription_city_id
    (city_code, subscription_id),
  UNIQUE KEY uq_platform_subscription_exact_ref
    (city_code, subscription_id, subscriber_id, event_type, event_major_version),
  KEY idx_platform_subscription_materialize
    (status, city_code, event_type, event_major_version),
  CONSTRAINT fk_platform_subscription_city
    FOREIGN KEY (city_code) REFERENCES cities (city_code)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_platform_subscription_subscriber
    FOREIGN KEY (subscriber_id) REFERENCES platform_event_subscribers (subscriber_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_platform_subscription_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_platform_subscription_status
    CHECK (status IN ('proposed','active','paused','revoked')),
  CONSTRAINT chk_platform_subscription_retention
    CHECK (retention_class IN ('R1','R2','R3','R4')),
  CONSTRAINT chk_platform_subscription_policy
    CHECK (lease_seconds BETWEEN 5 AND 3600 AND max_attempts BETWEEN 1 AND 100),
  CONSTRAINT chk_platform_subscription_version CHECK (row_version >= 1),
  CONSTRAINT chk_platform_subscription_live_boundary
    CHECK ((live_start_created_at IS NULL AND live_start_event_id IS NULL)
        OR (live_start_created_at IS NOT NULL AND live_start_event_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_event_materialization_checkpoints (
  checkpoint_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  subscription_id VARCHAR(64) NOT NULL,
  candidate_created_at TIMESTAMP(3) NULL,
  candidate_event_id VARCHAR(64) NULL,
  last_scan_at TIMESTAMP(3) NULL,
  last_scan_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_reconciliation_started_at TIMESTAMP(3) NULL,
  last_reconciliation_completed_at TIMESTAMP(3) NULL,
  last_reconciliation_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_reconciliation_hash CHAR(64) NULL,
  last_reconciliation_result VARCHAR(32) NULL,
  row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (checkpoint_id),
  UNIQUE KEY uq_platform_checkpoint_subscription (city_code, subscription_id),
  KEY idx_platform_checkpoint_candidate (city_code, candidate_created_at, candidate_event_id),
  CONSTRAINT fk_platform_checkpoint_subscription
    FOREIGN KEY (city_code, subscription_id)
    REFERENCES platform_event_subscriptions (city_code, subscription_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_platform_checkpoint_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_platform_checkpoint_cursor
    CHECK ((candidate_created_at IS NULL AND candidate_event_id IS NULL)
        OR (candidate_created_at IS NOT NULL AND candidate_event_id IS NOT NULL)),
  CONSTRAINT chk_platform_checkpoint_result
    CHECK (last_reconciliation_result IS NULL
        OR last_reconciliation_result IN ('complete','partial','failed')),
  CONSTRAINT chk_platform_checkpoint_hash
    CHECK (last_reconciliation_hash IS NULL
        OR last_reconciliation_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_platform_checkpoint_version CHECK (row_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_event_deliveries (
  delivery_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  subscriber_id VARCHAR(64) NOT NULL,
  subscription_id VARCHAR(64) NOT NULL,
  event_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  event_major_version SMALLINT UNSIGNED NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  aggregate_version BIGINT UNSIGNED NULL,
  aggregate_sequence BIGINT UNSIGNED NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  available_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  lease_owner VARCHAR(128) NULL,
  lease_token CHAR(36) NULL,
  lease_expires_at TIMESTAMP(3) NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts INT UNSIGNED NOT NULL,
  last_error_code VARCHAR(64) NULL,
  last_error_message VARCHAR(512) NULL,
  last_failed_at TIMESTAMP(3) NULL,
  delivered_at TIMESTAMP(3) NULL,
  dead_lettered_at TIMESTAMP(3) NULL,
  row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (delivery_id),
  UNIQUE KEY uq_platform_delivery_subscriber_event (subscriber_id, event_id),
  UNIQUE KEY uq_platform_delivery_city_id (city_code, delivery_id),
  KEY idx_platform_delivery_claim
    (city_code, subscriber_id, status, available_at, created_at),
  KEY idx_platform_delivery_reaper
    (city_code, subscriber_id, status, lease_expires_at),
  KEY idx_platform_delivery_dlq
    (city_code, subscriber_id, status, dead_lettered_at),
  KEY idx_platform_delivery_antijoin
    (city_code, subscriber_id, event_type, event_major_version, event_id),
  KEY idx_platform_delivery_aggregate
    (city_code, subscriber_id, aggregate_type, aggregate_id, aggregate_sequence),
  CONSTRAINT fk_platform_delivery_source
    FOREIGN KEY (city_code, event_id) REFERENCES event_outbox (city_code, event_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_platform_delivery_exact_subscription
    FOREIGN KEY (city_code, subscription_id, subscriber_id, event_type, event_major_version)
    REFERENCES platform_event_subscriptions
      (city_code, subscription_id, subscriber_id, event_type, event_major_version)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_platform_delivery_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_platform_delivery_status
    CHECK (status IN ('pending','processing','retry_wait','delivered','dead_letter')),
  CONSTRAINT chk_platform_delivery_hash
    CHECK (payload_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_platform_delivery_attempts
    CHECK (max_attempts BETWEEN 1 AND 100 AND attempt_count <= max_attempts),
  CONSTRAINT chk_platform_delivery_version CHECK (row_version >= 1),
  CONSTRAINT chk_platform_delivery_lease
    CHECK ((status = 'processing'
            AND lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
        OR (status <> 'processing'
            AND lease_owner IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)),
  CONSTRAINT chk_platform_delivery_terminal_time
    CHECK ((status = 'delivered' AND delivered_at IS NOT NULL AND dead_lettered_at IS NULL)
        OR (status = 'dead_letter' AND dead_lettered_at IS NOT NULL AND delivered_at IS NULL)
        OR (status NOT IN ('delivered','dead_letter')
            AND delivered_at IS NULL AND dead_lettered_at IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_event_delivery_attempts (
  attempt_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  delivery_id VARCHAR(64) NOT NULL,
  attempt_number INT UNSIGNED NOT NULL,
  lease_owner VARCHAR(128) NOT NULL,
  lease_token_hash CHAR(64) NOT NULL,
  outcome VARCHAR(32) NOT NULL DEFAULT 'processing',
  error_code VARCHAR(64) NULL,
  error_message VARCHAR(512) NULL,
  trace_id VARCHAR(128) NULL,
  started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (attempt_id),
  UNIQUE KEY uq_platform_attempt_delivery_number (city_code, delivery_id, attempt_number),
  KEY idx_platform_attempt_outcome_time (city_code, outcome, started_at),
  CONSTRAINT fk_platform_attempt_delivery
    FOREIGN KEY (city_code, delivery_id)
    REFERENCES platform_event_deliveries (city_code, delivery_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_platform_attempt_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_platform_attempt_number CHECK (attempt_number >= 1),
  CONSTRAINT chk_platform_attempt_token_hash
    CHECK (lease_token_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_platform_attempt_outcome
    CHECK (outcome IN ('processing','delivered','retry_wait','dead_letter','lease_expired')),
  CONSTRAINT chk_platform_attempt_finished
    CHECK ((outcome = 'processing' AND finished_at IS NULL)
        OR (outcome <> 'processing' AND finished_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_event_replay_generations (
  replay_generation_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  subscriber_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  event_major_version SMALLINT UNSIGNED NOT NULL,
  event_id_from VARCHAR(64) NULL,
  event_id_to VARCHAR(64) NULL,
  occurred_from TIMESTAMP(3) NULL,
  occurred_to TIMESTAMP(3) NULL,
  row_cap INT UNSIGNED NOT NULL,
  purpose VARCHAR(255) NOT NULL,
  dry_run_count BIGINT UNSIGNED NOT NULL,
  dry_run_hash CHAR(64) NOT NULL,
  approval_reference VARCHAR(255) NOT NULL,
  requested_by_actor_type VARCHAR(32) NOT NULL,
  requested_by_actor_id VARCHAR(128) NOT NULL,
  approved_by_actor_id VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'approved',
  started_at TIMESTAMP(3) NULL,
  completed_at TIMESTAMP(3) NULL,
  cancelled_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (replay_generation_id),
  KEY idx_platform_replay_scope
    (city_code, subscriber_id, event_type, event_major_version, status, created_at),
  CONSTRAINT fk_platform_replay_city
    FOREIGN KEY (city_code) REFERENCES cities (city_code)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_platform_replay_subscriber
    FOREIGN KEY (subscriber_id) REFERENCES platform_event_subscribers (subscriber_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_platform_replay_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_platform_replay_bounds CHECK (row_cap BETWEEN 1 AND 100000),
  CONSTRAINT chk_platform_replay_hash
    CHECK (dry_run_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_platform_replay_actor
    CHECK (requested_by_actor_type IN ('platform_service','admin','operator','auditor')),
  CONSTRAINT chk_platform_replay_status
    CHECK (status IN ('approved','running','completed','failed','cancelled')),
  CONSTRAINT chk_platform_replay_time_range
    CHECK (occurred_from IS NULL OR occurred_to IS NULL OR occurred_from <= occurred_to)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_event_delivery_actions (
  action_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  delivery_id_copy VARCHAR(64) NULL,
  event_id_copy VARCHAR(64) NULL,
  subscription_id_copy VARCHAR(64) NULL,
  subscriber_id_copy VARCHAR(64) NOT NULL,
  compatibility_handler_revision_copy VARCHAR(128) NULL,
  replay_generation_id_copy VARCHAR(64) NULL,
  payload_hash_copy CHAR(64) NULL,
  action_kind VARCHAR(64) NOT NULL,
  actor_type VARCHAR(32) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  reason_code VARCHAR(64) NOT NULL,
  reason VARCHAR(512) NOT NULL,
  change_reference VARCHAR(255) NULL,
  expected_row_version BIGINT UNSIGNED NULL,
  actual_row_version BIGINT UNSIGNED NULL,
  trace_id VARCHAR(128) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (action_id),
  KEY idx_platform_action_delivery (city_code, delivery_id_copy, created_at),
  KEY idx_platform_action_event (city_code, subscriber_id_copy, event_id_copy, created_at),
  KEY idx_platform_action_actor (city_code, actor_type, actor_id, created_at),
  UNIQUE KEY uq_platform_action_terminal_rejection
    (city_code, subscription_id_copy, subscriber_id_copy, event_id_copy,
     compatibility_handler_revision_copy, action_kind),
  CONSTRAINT fk_platform_action_city
    FOREIGN KEY (city_code) REFERENCES cities (city_code)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_platform_action_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_platform_action_kind
    CHECK (action_kind IN ('materialized','reconciliation_repair','materialization_rejected',
      'lease_reaped','manual_retry_requested','replay_requested','replay_cancelled')),
  CONSTRAINT chk_platform_action_actor
    CHECK (actor_type IN ('platform_service','admin','operator','auditor')),
  CONSTRAINT chk_platform_action_hash
    CHECK (payload_hash_copy IS NULL OR payload_hash_copy REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_platform_action_rejection_identity
    CHECK (action_kind <> 'materialization_rejected'
      OR (event_id_copy IS NOT NULL AND subscription_id_copy IS NOT NULL
        AND compatibility_handler_revision_copy IS NOT NULL AND payload_hash_copy IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version)
VALUES ('054_phase27a_platform_delivery_foundation')
ON DUPLICATE KEY UPDATE version = version;
