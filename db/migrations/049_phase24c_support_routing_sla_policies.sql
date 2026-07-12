-- Phase 24C Phase 2: automatic routing metadata and city-scoped SLA policy revisions.
-- Append-only. Migrations 000-048 and historical ticket SLA snapshots remain unchanged.

CREATE TABLE IF NOT EXISTS support_sla_policies (
  policy_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  policy_series_id VARCHAR(64) NOT NULL,
  revision INT UNSIGNED NOT NULL,
  supersedes_policy_id VARCHAR(64) NULL,
  type VARCHAR(32) NOT NULL,
  priority VARCHAR(32) NOT NULL,
  first_response_minutes INT UNSIGNED NOT NULL,
  resolution_minutes INT UNSIGNED NOT NULL,
  effective_from TIMESTAMP(3) NOT NULL,
  effective_to TIMESTAMP(3) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  create_idempotency_key VARCHAR(128) NULL,
  create_fingerprint CHAR(64) NULL,
  mutation_idempotency_key VARCHAR(128) NULL,
  mutation_fingerprint CHAR(64) NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (policy_id),
  UNIQUE KEY uq_support_sla_policy_city_policy (city_code, policy_id),
  UNIQUE KEY uq_support_sla_policy_series_revision (city_code, policy_series_id, revision),
  UNIQUE KEY uq_support_sla_policy_create_idempotency (city_code, create_idempotency_key),
  UNIQUE KEY uq_support_sla_policy_mutation_idempotency
    (city_code, policy_series_id, mutation_idempotency_key),
  INDEX idx_support_sla_policy_effective
    (city_code, type, priority, is_active, effective_from, effective_to, revision),
  INDEX idx_support_sla_policy_series
    (city_code, policy_series_id, revision),
  CONSTRAINT fk_support_sla_policy_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_support_sla_policy_supersedes FOREIGN KEY (city_code, supersedes_policy_id)
    REFERENCES support_sla_policies(city_code, policy_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_support_sla_policy_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_support_sla_policy_type CHECK (type IN (
    'order_question','order_dispute','service_complaint','withdrawal_issue',
    'account_issue','safety','other'
  )),
  CONSTRAINT chk_support_sla_policy_priority CHECK (priority IN (
    'low','normal','high','urgent','critical'
  )),
  CONSTRAINT chk_support_sla_policy_minutes CHECK (
    first_response_minutes BETWEEN 1 AND 525600
    AND resolution_minutes BETWEEN first_response_minutes AND 525600
  ),
  CONSTRAINT chk_support_sla_policy_window CHECK (
    effective_to IS NULL OR effective_to > effective_from
  ),
  CONSTRAINT chk_support_sla_policy_active CHECK (is_active IN (0,1)),
  CONSTRAINT chk_support_sla_policy_revision CHECK (revision > 0),
  CONSTRAINT chk_support_sla_policy_version CHECK (version > 0),
  CONSTRAINT chk_support_sla_policy_idempotency CHECK (
    (revision = 1
      AND create_idempotency_key IS NOT NULL
      AND create_fingerprint REGEXP '^[0-9a-f]{64}$'
      AND mutation_idempotency_key IS NULL
      AND mutation_fingerprint IS NULL)
    OR (revision > 1
      AND create_idempotency_key IS NULL
      AND create_fingerprint IS NULL
      AND mutation_idempotency_key IS NOT NULL
      AND mutation_fingerprint REGEXP '^[0-9a-f]{64}$')
  ),
  CONSTRAINT chk_support_sla_policy_revision_link CHECK (
    (revision = 1 AND supersedes_policy_id IS NULL)
    OR (revision > 1 AND supersedes_policy_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='support_tickets' AND column_name='routing_language')=0,
  'ALTER TABLE support_tickets ADD COLUMN routing_language VARCHAR(32) NULL AFTER assigned_skill_group_id',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_schema=DATABASE() AND table_name='support_tickets'
    AND constraint_name='chk_support_ticket_routing_language' AND constraint_type='CHECK')=0,
  'ALTER TABLE support_tickets ADD CONSTRAINT chk_support_ticket_routing_language CHECK (routing_language IS NULL OR routing_language REGEXP ''^[a-z]{2,8}(-[a-z0-9]{1,8})*$'')',
  'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

INSERT INTO schema_migrations(version) VALUES ('049_phase24c_support_routing_sla_policies')
ON DUPLICATE KEY UPDATE version=version;
