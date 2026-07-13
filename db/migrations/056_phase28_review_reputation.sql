-- Phase 28: Review moderation/appeal sidecars and event-derived Reputation read model.
-- Conservative entry decisions:
--   * order_reviews remains the single immutable review writer;
--   * new reviews start pending_moderation and only visible reviews contribute;
--   * no reply, public reputation, dispatch input, automatic purge, seed, or backfill;
--   * explicit event_major_version=1 is required for review.created.
-- Every ALTER is independently guarded because MySQL DDL auto-commits.
-- The schema_migrations marker is deliberately the final statement.

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='event_outbox'
    AND column_name='event_major_version')=0,
  'ALTER TABLE event_outbox ADD COLUMN event_major_version SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER event_type',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='event_outbox'
    AND index_name='idx_event_outbox_platform_candidate_v')=0,
  'ALTER TABLE event_outbox ADD INDEX idx_event_outbox_platform_candidate_v (city_code, event_type, event_major_version, created_at, event_id)',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='order_reviews'
    AND index_name='uq_order_reviews_city_review')=0,
  'ALTER TABLE order_reviews ADD UNIQUE KEY uq_order_reviews_city_review (city_code, review_id)',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema=DATABASE() AND table_name='order_reviews'
    AND constraint_name='fk_order_reviews_city_order')=0,
  'ALTER TABLE order_reviews ADD CONSTRAINT fk_order_reviews_city_order FOREIGN KEY (city_code, order_id) REFERENCES orders (city_code, order_id) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema=DATABASE() AND table_name='order_reviews'
    AND constraint_name='fk_order_reviews_city_fulfillment')=0,
  'ALTER TABLE order_reviews ADD CONSTRAINT fk_order_reviews_city_fulfillment FOREIGN KEY (city_code, order_id, fulfillment_id) REFERENCES fulfillments (city_code, order_id, fulfillment_id) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema=DATABASE() AND table_name='order_reviews'
    AND constraint_name='fk_order_reviews_worker_city')=0,
  'ALTER TABLE order_reviews ADD CONSTRAINT fk_order_reviews_worker_city FOREIGN KEY (worker_id, city_code) REFERENCES worker_city_bindings (worker_id, city_code) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS review_moderation_decisions (
  moderation_decision_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  review_id VARCHAR(64) NOT NULL,
  moderation_version BIGINT UNSIGNED NOT NULL,
  decision VARCHAR(16) NOT NULL,
  reason_code VARCHAR(64) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  idempotency_key_hash CHAR(64) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  trace_id VARCHAR(128) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (moderation_decision_id),
  UNIQUE KEY uq_review_moderation_city_id (city_code, moderation_decision_id),
  UNIQUE KEY uq_review_moderation_review_decision
    (city_code, review_id, moderation_decision_id),
  UNIQUE KEY uq_review_moderation_version
    (city_code, review_id, moderation_version),
  UNIQUE KEY uq_review_moderation_idempotency
    (city_code, actor_id, idempotency_key_hash),
  KEY idx_review_moderation_review (city_code, review_id, created_at),
  CONSTRAINT fk_review_moderation_review
    FOREIGN KEY (city_code, review_id)
    REFERENCES order_reviews (city_code, review_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_review_moderation_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_review_moderation_version CHECK (moderation_version >= 1),
  CONSTRAINT chk_review_moderation_decision CHECK (decision IN ('visible','hidden')),
  CONSTRAINT chk_review_moderation_idempotency_hash
    CHECK (idempotency_key_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_review_moderation_fingerprint
    CHECK (request_fingerprint REGEXP '^[a-f0-9]{64}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS review_visibility_states (
  visibility_state_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  review_id VARCHAR(64) NOT NULL,
  visibility VARCHAR(32) NOT NULL DEFAULT 'pending_moderation',
  moderation_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  current_decision_id VARCHAR(64) NULL,
  row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (visibility_state_id),
  UNIQUE KEY uq_review_visibility_city_id (city_code, visibility_state_id),
  UNIQUE KEY uq_review_visibility_review (city_code, review_id),
  KEY idx_review_visibility_queue (city_code, visibility, updated_at, review_id),
  CONSTRAINT fk_review_visibility_review
    FOREIGN KEY (city_code, review_id)
    REFERENCES order_reviews (city_code, review_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_review_visibility_decision
    FOREIGN KEY (city_code, review_id, current_decision_id)
    REFERENCES review_moderation_decisions
      (city_code, review_id, moderation_decision_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_review_visibility_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_review_visibility_value
    CHECK (visibility IN ('pending_moderation','visible','hidden')),
  CONSTRAINT chk_review_visibility_version CHECK (row_version >= 1),
  CONSTRAINT chk_review_visibility_decision_shape
    CHECK ((visibility='pending_moderation' AND moderation_version=0 AND current_decision_id IS NULL)
      OR (visibility IN ('visible','hidden') AND moderation_version>=1 AND current_decision_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS review_appeals (
  appeal_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  review_id VARCHAR(64) NOT NULL,
  moderation_decision_id VARCHAR(64) NOT NULL,
  moderation_version BIGINT UNSIGNED NOT NULL,
  appellant_type VARCHAR(16) NOT NULL,
  appellant_id VARCHAR(64) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'open',
  active_appeal_guard TINYINT GENERATED ALWAYS AS
    (CASE WHEN status='open' THEN 1 ELSE NULL END) STORED,
  submitted_idempotency_key_hash CHAR(64) NOT NULL,
  submitted_request_fingerprint CHAR(64) NOT NULL,
  resolution_reason VARCHAR(1000) NULL,
  resolved_by_actor_id VARCHAR(128) NULL,
  resolution_idempotency_key_hash CHAR(64) NULL,
  resolution_request_fingerprint CHAR(64) NULL,
  withdrawal_idempotency_key_hash CHAR(64) NULL,
  withdrawal_request_fingerprint CHAR(64) NULL,
  row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at TIMESTAMP(3) NULL,
  withdrawn_at TIMESTAMP(3) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (appeal_id),
  UNIQUE KEY uq_review_appeal_city_id (city_code, appeal_id),
  UNIQUE KEY uq_review_appeal_active_subject_version
    (city_code, review_id, moderation_version, appellant_type, appellant_id, active_appeal_guard),
  UNIQUE KEY uq_review_appeal_submit_idempotency
    (city_code, appellant_type, appellant_id, submitted_idempotency_key_hash),
  UNIQUE KEY uq_review_appeal_resolution_idempotency
    (city_code, resolved_by_actor_id, resolution_idempotency_key_hash),
  UNIQUE KEY uq_review_appeal_withdrawal_idempotency
    (city_code, appellant_type, appellant_id, withdrawal_idempotency_key_hash),
  KEY idx_review_appeal_queue (city_code, status, created_at, appeal_id),
  CONSTRAINT fk_review_appeal_decision
    FOREIGN KEY (city_code, review_id, moderation_decision_id)
    REFERENCES review_moderation_decisions
      (city_code, review_id, moderation_decision_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_review_appeal_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_review_appeal_version CHECK (moderation_version >= 1 AND row_version >= 1),
  CONSTRAINT chk_review_appeal_appellant CHECK (appellant_type IN ('customer','worker')),
  CONSTRAINT chk_review_appeal_status
    CHECK (status IN ('open','upheld','rejected','withdrawn')),
  CONSTRAINT chk_review_appeal_submit_hashes
    CHECK (submitted_idempotency_key_hash REGEXP '^[a-f0-9]{64}$'
      AND submitted_request_fingerprint REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_review_appeal_resolution_shape
    CHECK ((status IN ('open','withdrawn')
        AND resolution_reason IS NULL AND resolved_by_actor_id IS NULL
        AND resolution_idempotency_key_hash IS NULL AND resolution_request_fingerprint IS NULL
        AND resolved_at IS NULL)
      OR (status IN ('upheld','rejected') AND resolution_reason IS NOT NULL
        AND resolved_by_actor_id IS NOT NULL
        AND resolution_idempotency_key_hash REGEXP '^[a-f0-9]{64}$'
        AND resolution_request_fingerprint REGEXP '^[a-f0-9]{64}$'
        AND resolved_at IS NOT NULL)),
  CONSTRAINT chk_review_appeal_withdrawal_shape CHECK (
    (status='withdrawn' AND withdrawal_idempotency_key_hash REGEXP '^[a-f0-9]{64}$'
      AND withdrawal_request_fingerprint REGEXP '^[a-f0-9]{64}$' AND withdrawn_at IS NOT NULL)
    OR (status<>'withdrawn' AND withdrawal_idempotency_key_hash IS NULL
      AND withdrawal_request_fingerprint IS NULL AND withdrawn_at IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='review_appeals'
    AND index_name='uq_review_appeal_subject_moderation_version')>0,
  'ALTER TABLE review_appeals DROP INDEX uq_review_appeal_subject_moderation_version',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='review_appeals'
    AND column_name='withdrawal_idempotency_key_hash')=0,
  'ALTER TABLE review_appeals ADD COLUMN withdrawal_idempotency_key_hash CHAR(64) NULL AFTER resolution_request_fingerprint',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='review_appeals'
    AND column_name='withdrawal_request_fingerprint')=0,
  'ALTER TABLE review_appeals ADD COLUMN withdrawal_request_fingerprint CHAR(64) NULL AFTER withdrawal_idempotency_key_hash',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='review_appeals'
    AND column_name='withdrawn_at')=0,
  'ALTER TABLE review_appeals ADD COLUMN withdrawn_at TIMESTAMP(3) NULL AFTER resolved_at',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='review_appeals'
    AND index_name='uq_review_appeal_active_subject_version')>0,
  'ALTER TABLE review_appeals DROP INDEX uq_review_appeal_active_subject_version',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='review_appeals'
    AND column_name='active_appeal_guard')=0,
  CONCAT('ALTER TABLE review_appeals ADD COLUMN active_appeal_guard TINYINT GENERATED ALWAYS AS (CASE WHEN status=',CHAR(39),'open',CHAR(39),' THEN 1 ELSE NULL END) STORED AFTER status'),
  CONCAT('ALTER TABLE review_appeals MODIFY COLUMN active_appeal_guard TINYINT GENERATED ALWAYS AS (CASE WHEN status=',CHAR(39),'open',CHAR(39),' THEN 1 ELSE NULL END) STORED'));
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='review_appeals'
    AND index_name='uq_review_appeal_active_subject_version')=0,
  'ALTER TABLE review_appeals ADD UNIQUE KEY uq_review_appeal_active_subject_version (city_code, review_id, moderation_version, appellant_type, appellant_id, active_appeal_guard)',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='review_appeals'
    AND index_name='uq_review_appeal_withdrawal_idempotency')=0,
  'ALTER TABLE review_appeals ADD UNIQUE KEY uq_review_appeal_withdrawal_idempotency (city_code, appellant_type, appellant_id, withdrawal_idempotency_key_hash)',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema=DATABASE() AND table_name='review_appeals'
    AND constraint_name='chk_review_appeal_status')>0,
  'ALTER TABLE review_appeals DROP CHECK chk_review_appeal_status',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
ALTER TABLE review_appeals ADD CONSTRAINT chk_review_appeal_status
  CHECK (status IN ('open','upheld','rejected','withdrawn'));

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema=DATABASE() AND table_name='review_appeals'
    AND constraint_name='chk_review_appeal_resolution_shape')>0,
  'ALTER TABLE review_appeals DROP CHECK chk_review_appeal_resolution_shape',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
ALTER TABLE review_appeals ADD CONSTRAINT chk_review_appeal_resolution_shape
  CHECK ((status IN ('open','withdrawn')
      AND resolution_reason IS NULL AND resolved_by_actor_id IS NULL
      AND resolution_idempotency_key_hash IS NULL AND resolution_request_fingerprint IS NULL
      AND resolved_at IS NULL)
    OR (status IN ('upheld','rejected') AND resolution_reason IS NOT NULL
      AND resolved_by_actor_id IS NOT NULL
      AND resolution_idempotency_key_hash REGEXP '^[a-f0-9]{64}$'
      AND resolution_request_fingerprint REGEXP '^[a-f0-9]{64}$'
      AND resolved_at IS NOT NULL));

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema=DATABASE() AND table_name='review_appeals'
    AND constraint_name='chk_review_appeal_withdrawal_shape')=0,
  CONCAT('ALTER TABLE review_appeals ADD CONSTRAINT chk_review_appeal_withdrawal_shape CHECK ((status=',CHAR(39),'withdrawn',CHAR(39),' AND withdrawal_idempotency_key_hash REGEXP ',CHAR(39),'^[a-f0-9]{64}$',CHAR(39),' AND withdrawal_request_fingerprint REGEXP ',CHAR(39),'^[a-f0-9]{64}$',CHAR(39),' AND withdrawn_at IS NOT NULL) OR (status<>',CHAR(39),'withdrawn',CHAR(39),' AND withdrawal_idempotency_key_hash IS NULL AND withdrawal_request_fingerprint IS NULL AND withdrawn_at IS NULL))'),
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS reputation_projection_generations (
  generation_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'building',
  build_kind VARCHAR(16) NOT NULL,
  requested_by_actor_type VARCHAR(32) NOT NULL,
  requested_by_actor_id VARCHAR(128) NOT NULL,
  reason VARCHAR(512) NOT NULL,
  formula_revision VARCHAR(64) NOT NULL,
  source_watermark VARCHAR(128) NULL,
  source_row_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  visible_row_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  dry_run_hash CHAR(64) NULL,
  failure_code VARCHAR(64) NULL,
  failure_message VARCHAR(512) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ready_at TIMESTAMP(3) NULL,
  activated_at TIMESTAMP(3) NULL,
  retired_at TIMESTAMP(3) NULL,
  PRIMARY KEY (generation_id),
  UNIQUE KEY uq_reputation_generation_city_id (city_code, generation_id),
  KEY idx_reputation_generation_status (city_code, status, created_at),
  CONSTRAINT fk_reputation_generation_city
    FOREIGN KEY (city_code) REFERENCES cities (city_code)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_reputation_generation_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_reputation_generation_status
    CHECK (status IN ('building','ready','active','retired','failed')),
  CONSTRAINT chk_reputation_generation_kind CHECK (build_kind IN ('live','rebuild')),
  CONSTRAINT chk_reputation_generation_actor
    CHECK (requested_by_actor_type IN ('reputation_service','admin','operator')),
  CONSTRAINT chk_reputation_generation_hash
    CHECK (dry_run_hash IS NULL OR dry_run_hash REGEXP '^[a-f0-9]{64}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reputation_projection_pointers (
  city_code VARCHAR(64) NOT NULL,
  active_generation_id VARCHAR(64) NOT NULL,
  row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  activated_by_actor_id VARCHAR(128) NOT NULL,
  activated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (city_code),
  CONSTRAINT fk_reputation_pointer_generation
    FOREIGN KEY (city_code, active_generation_id)
    REFERENCES reputation_projection_generations (city_code, generation_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_reputation_pointer_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_reputation_pointer_version CHECK (row_version >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reputation_worker_aggregates (
  city_code VARCHAR(64) NOT NULL,
  generation_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  rating_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rating_sum BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rating_1_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rating_2_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rating_3_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rating_4_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rating_5_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  formula_revision VARCHAR(64) NOT NULL,
  source_watermark VARCHAR(128) NULL,
  row_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (city_code, generation_id, worker_id),
  KEY idx_reputation_worker_read (city_code, worker_id, generation_id),
  CONSTRAINT fk_reputation_aggregate_generation
    FOREIGN KEY (city_code, generation_id)
    REFERENCES reputation_projection_generations (city_code, generation_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reputation_aggregate_worker_city
    FOREIGN KEY (worker_id, city_code)
    REFERENCES worker_city_bindings (worker_id, city_code)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_reputation_aggregate_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_reputation_aggregate_version CHECK (row_version >= 1),
  CONSTRAINT chk_reputation_aggregate_math CHECK (
    rating_count=rating_1_count+rating_2_count+rating_3_count+rating_4_count+rating_5_count
    AND rating_sum=rating_1_count+2*rating_2_count+3*rating_3_count+4*rating_4_count+5*rating_5_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reputation_review_contributions (
  contribution_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  generation_id VARCHAR(64) NOT NULL,
  review_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  rating TINYINT NOT NULL,
  visibility VARCHAR(32) NOT NULL,
  source_event_id VARCHAR(64) NULL,
  source_moderation_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  included_at TIMESTAMP(3) NULL,
  excluded_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (contribution_id),
  UNIQUE KEY uq_reputation_contribution_city_id (city_code, contribution_id),
  UNIQUE KEY uq_reputation_contribution_review
    (city_code, generation_id, review_id),
  KEY idx_reputation_contribution_worker
    (city_code, generation_id, worker_id, visibility),
  CONSTRAINT fk_reputation_contribution_generation
    FOREIGN KEY (city_code, generation_id)
    REFERENCES reputation_projection_generations (city_code, generation_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reputation_contribution_review
    FOREIGN KEY (city_code, review_id)
    REFERENCES order_reviews (city_code, review_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reputation_contribution_source
    FOREIGN KEY (city_code, source_event_id)
    REFERENCES event_outbox (city_code, event_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_reputation_contribution_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_reputation_contribution_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_reputation_contribution_visibility
    CHECK (visibility IN ('pending_moderation','visible','hidden')),
  CONSTRAINT chk_reputation_contribution_times
    CHECK ((visibility='visible' AND included_at IS NOT NULL AND excluded_at IS NULL)
      OR (visibility<>'visible' AND included_at IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS review_content_access_audits (
  access_audit_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  review_id VARCHAR(64) NOT NULL,
  actor_id VARCHAR(128) NOT NULL,
  actor_role VARCHAR(16) NOT NULL,
  access_purpose VARCHAR(64) NOT NULL,
  trace_id VARCHAR(128) NULL,
  accessed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (access_audit_id),
  KEY idx_review_content_access_review (city_code, review_id, accessed_at),
  KEY idx_review_content_access_actor (city_code, actor_id, accessed_at),
  CONSTRAINT fk_review_content_access_review
    FOREIGN KEY (city_code, review_id)
    REFERENCES order_reviews (city_code, review_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_review_content_access_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_review_content_access_role CHECK (actor_role = 'admin'),
  CONSTRAINT chk_review_content_access_purpose
    CHECK (access_purpose IN ('moderation_detail','appeal_review'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reputation_projection_receipts (
  receipt_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  generation_id VARCHAR(64) NOT NULL,
  subscriber_id VARCHAR(64) NOT NULL,
  event_id VARCHAR(64) NOT NULL,
  review_id VARCHAR(64) NOT NULL,
  event_major_version SMALLINT UNSIGNED NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  result VARCHAR(16) NOT NULL,
  committed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (receipt_id),
  UNIQUE KEY uq_reputation_receipt_city_id (city_code, receipt_id),
  UNIQUE KEY uq_reputation_receipt_subscriber_event (subscriber_id, event_id),
  KEY idx_reputation_receipt_review (city_code, generation_id, review_id),
  CONSTRAINT fk_reputation_receipt_generation
    FOREIGN KEY (city_code, generation_id)
    REFERENCES reputation_projection_generations (city_code, generation_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reputation_receipt_delivery
    FOREIGN KEY (subscriber_id, event_id)
    REFERENCES platform_event_deliveries (subscriber_id, event_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_reputation_receipt_review
    FOREIGN KEY (city_code, review_id)
    REFERENCES order_reviews (city_code, review_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_reputation_receipt_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_reputation_receipt_major CHECK (event_major_version = 1),
  CONSTRAINT chk_reputation_receipt_hash
    CHECK (payload_hash REGEXP '^[a-f0-9]{64}$'),
  CONSTRAINT chk_reputation_receipt_result CHECK (result IN ('applied','reused'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version)
VALUES ('056_phase28_review_reputation')
ON DUPLICATE KEY UPDATE version=version;
