-- Phase 11: Settlement Execution Dry Run Planner Tables
-- Governance-only dry-run planning. No execution, no money movement.
CREATE TABLE settlement_execution_dry_run_plans (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  readiness_packet_id VARCHAR(64) NOT NULL,
  governance_intent_id VARCHAR(64) NULL,
  governance_review_id VARCHAR(64) NULL,
  plan_status VARCHAR(32) NOT NULL DEFAULT 'draft',
  plan_hash VARCHAR(128) NOT NULL,
  source_refs_json JSON NOT NULL DEFAULT ('[]'),
  created_by_admin_id VARCHAR(64) NULL,
  trace_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_dry_run_plan_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_dry_run_plan_city CHECK (city_code <> '__global__'),
  CONSTRAINT fk_dry_run_plan_readiness FOREIGN KEY (readiness_packet_id) REFERENCES settlement_action_governance_readiness_packets(id),
  CONSTRAINT chk_dry_run_plan_status CHECK (plan_status IN ('draft', 'generated', 'archived')),
  INDEX idx_dry_run_plan_city (city_code),
  INDEX idx_dry_run_plan_readiness (readiness_packet_id),
  INDEX idx_dry_run_plan_hash (plan_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settlement_execution_dry_run_plan_items (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  plan_id VARCHAR(64) NOT NULL,
  item_type VARCHAR(64) NOT NULL,
  item_ref_id VARCHAR(64) NOT NULL,
  planned_action VARCHAR(256) NULL,
  item_order INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dry_run_plan_item_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_dry_run_plan_item_city CHECK (city_code <> '__global__'),
  CONSTRAINT fk_dry_run_plan_item_plan FOREIGN KEY (plan_id) REFERENCES settlement_execution_dry_run_plans(id),
  INDEX idx_dry_run_plan_item_city (city_code),
  INDEX idx_dry_run_plan_item_plan (plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settlement_execution_dry_run_plan_audit (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  plan_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  event_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_admin_id VARCHAR(64) NULL,
  summary TEXT NULL,
  CONSTRAINT fk_dry_run_plan_audit_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_dry_run_plan_audit_city CHECK (city_code <> '__global__'),
  CONSTRAINT fk_dry_run_plan_audit_plan FOREIGN KEY (plan_id) REFERENCES settlement_execution_dry_run_plans(id),
  INDEX idx_dry_run_plan_audit_city (city_code),
  INDEX idx_dry_run_plan_audit_plan (plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('025_settlement_execution_dry_run_plans') ON DUPLICATE KEY UPDATE version=version;
