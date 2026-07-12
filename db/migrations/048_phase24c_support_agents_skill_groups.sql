-- Phase 24C Phase 1: city-scoped Support agent profiles and skill groups.
-- Append-only. assigned_agent_id remains an admin_users.id and migration 047 is unchanged.

CREATE TABLE IF NOT EXISTS support_agents (
  agent_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  admin_user_id VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  lifecycle_status VARCHAR(32) NOT NULL DEFAULT 'active',
  work_status VARCHAR(32) NOT NULL DEFAULT 'offline',
  create_idempotency_key VARCHAR(128) NOT NULL,
  create_fingerprint CHAR(64) NOT NULL,
  last_mutation_idempotency_key VARCHAR(128) NULL,
  last_mutation_fingerprint CHAR(64) NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (agent_id),
  UNIQUE KEY uq_support_agent_city_agent (city_code, agent_id),
  UNIQUE KEY uq_support_agent_city_admin (city_code, admin_user_id),
  UNIQUE KEY uq_support_agent_create_idempotency (city_code, create_idempotency_key),
  INDEX idx_support_agent_admin (admin_user_id),
  INDEX idx_support_agent_workbench (city_code, lifecycle_status, work_status, display_name, agent_id),
  CONSTRAINT fk_support_agent_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT fk_support_agent_admin FOREIGN KEY (admin_user_id) REFERENCES admin_users(id),
  CONSTRAINT fk_support_agent_admin_city_scope FOREIGN KEY (admin_user_id, city_code)
    REFERENCES admin_city_scopes(admin_user_id, city_code) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_support_agent_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_support_agent_lifecycle CHECK (lifecycle_status IN ('active','suspended')),
  CONSTRAINT chk_support_agent_work_status CHECK (work_status IN ('offline','online','busy')),
  CONSTRAINT chk_support_agent_create_fingerprint CHECK (create_fingerprint REGEXP '^[0-9a-f]{64}$'),
  CONSTRAINT chk_support_agent_mutation_fingerprint CHECK (
    (last_mutation_idempotency_key IS NULL AND last_mutation_fingerprint IS NULL)
    OR (last_mutation_idempotency_key IS NOT NULL AND last_mutation_fingerprint REGEXP '^[0-9a-f]{64}$')
  ),
  CONSTRAINT chk_support_agent_version CHECK (version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_skill_groups (
  skill_group_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  matched_types_json JSON NOT NULL,
  matched_languages_json JSON NOT NULL,
  priority_weight INT NOT NULL DEFAULT 0,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  create_idempotency_key VARCHAR(128) NOT NULL,
  create_fingerprint CHAR(64) NOT NULL,
  last_mutation_idempotency_key VARCHAR(128) NULL,
  last_mutation_fingerprint CHAR(64) NULL,
  active_default_guard VARCHAR(64)
    GENERATED ALWAYS AS (
      CASE WHEN is_default = 1 AND is_active = 1 THEN city_code ELSE NULL END
    ) STORED,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (skill_group_id),
  UNIQUE KEY uq_support_skill_group_city_group (city_code, skill_group_id),
  UNIQUE KEY uq_support_skill_group_city_name (city_code, name),
  UNIQUE KEY uq_support_skill_group_create_idempotency (city_code, create_idempotency_key),
  UNIQUE KEY uq_support_skill_group_active_default (active_default_guard),
  INDEX idx_support_skill_group_routing
    (city_code, is_active, priority_weight, skill_group_id),
  CONSTRAINT fk_support_skill_group_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_support_skill_group_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_support_skill_group_types CHECK (
    JSON_TYPE(matched_types_json) = 'ARRAY' AND JSON_LENGTH(matched_types_json) BETWEEN 1 AND 7
  ),
  CONSTRAINT chk_support_skill_group_languages CHECK (
    JSON_TYPE(matched_languages_json) = 'ARRAY' AND JSON_LENGTH(matched_languages_json) <= 16
  ),
  CONSTRAINT chk_support_skill_group_priority CHECK (priority_weight BETWEEN -1000 AND 1000),
  CONSTRAINT chk_support_skill_group_default CHECK (is_default IN (0,1)),
  CONSTRAINT chk_support_skill_group_active CHECK (is_active IN (0,1)),
  CONSTRAINT chk_support_skill_group_create_fingerprint CHECK (create_fingerprint REGEXP '^[0-9a-f]{64}$'),
  CONSTRAINT chk_support_skill_group_mutation_fingerprint CHECK (
    (last_mutation_idempotency_key IS NULL AND last_mutation_fingerprint IS NULL)
    OR (last_mutation_idempotency_key IS NOT NULL AND last_mutation_fingerprint REGEXP '^[0-9a-f]{64}$')
  ),
  CONSTRAINT chk_support_skill_group_default_language CHECK (
    is_default = 0 OR JSON_LENGTH(matched_languages_json) = 0
  ),
  CONSTRAINT chk_support_skill_group_version CHECK (version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_agent_skill_groups (
  city_code VARCHAR(64) NOT NULL,
  agent_id VARCHAR(64) NOT NULL,
  skill_group_id VARCHAR(64) NOT NULL,
  proficiency SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_idempotency_key VARCHAR(128) NOT NULL,
  last_mutation_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (city_code, agent_id, skill_group_id),
  INDEX idx_support_agent_skill_group_group (city_code, skill_group_id, agent_id),
  INDEX idx_support_agent_skill_group_agent (city_code, agent_id, is_primary, skill_group_id),
  UNIQUE KEY uq_support_agent_skill_group_idempotency (city_code, agent_id, last_idempotency_key),
  CONSTRAINT fk_support_agent_skill_group_agent FOREIGN KEY (city_code, agent_id)
    REFERENCES support_agents(city_code, agent_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_support_agent_skill_group_group FOREIGN KEY (city_code, skill_group_id)
    REFERENCES support_skill_groups(city_code, skill_group_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_support_agent_skill_group_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_support_agent_skill_group_proficiency CHECK (proficiency <= 100),
  CONSTRAINT chk_support_agent_skill_group_primary CHECK (is_primary IN (0,1)),
  CONSTRAINT chk_support_agent_skill_group_active CHECK (is_active IN (0,1)),
  CONSTRAINT chk_support_agent_skill_group_fingerprint CHECK (
    last_mutation_fingerprint REGEXP '^[0-9a-f]{64}$'
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('048_phase24c_support_agents_skill_groups')
ON DUPLICATE KEY UPDATE version=version;
