-- Phase 12: Settlement Execution Preparation Control Envelope
-- Governance-only preparation envelope. No execution, no money movement, no file export.
CREATE TABLE settlement_execution_preparation_envelopes (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  source_packet_id VARCHAR(64) NOT NULL,
  source_plan_id VARCHAR(64) NULL,
  envelope_status VARCHAR(32) NOT NULL DEFAULT 'draft',
  payload_hash VARCHAR(128) NOT NULL,
  item_hash VARCHAR(128) NULL,
  source_packet_hash VARCHAR(128) NULL,
  source_plan_hash VARCHAR(128) NULL,
  amount_snapshot_json JSON NOT NULL DEFAULT ('{}'),
  city_config_snapshot_hash VARCHAR(128) NULL,
  settlement_cycle_snapshot_hash VARCHAR(128) NULL,
  conflict_check_snapshot_json JSON NOT NULL DEFAULT ('{}'),
  frozen_by_admin_id VARCHAR(64) NULL,
  approved_by_admin_id VARCHAR(64) NULL,
  trace_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  frozen_at TIMESTAMP NULL,
  approved_at TIMESTAMP NULL,
  CONSTRAINT fk_prep_envelope_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_prep_envelope_city CHECK (city_code <> '__global__'),
  CONSTRAINT fk_prep_envelope_source_packet FOREIGN KEY (source_packet_id) REFERENCES settlement_action_governance_readiness_packets(id),
  CONSTRAINT fk_prep_envelope_source_plan FOREIGN KEY (source_plan_id) REFERENCES settlement_execution_dry_run_plans(id),
  CONSTRAINT chk_prep_envelope_status CHECK (envelope_status IN ('draft','frozen','approved_for_phase13_review')),
  INDEX idx_prep_city (city_code),
  INDEX idx_prep_source_packet (source_packet_id),
  INDEX idx_prep_status (envelope_status),
  INDEX idx_prep_payload_hash (payload_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE settlement_execution_preparation_envelopes
  ADD UNIQUE KEY uk_prep_envelope_city (id, city_code);

CREATE TABLE settlement_execution_preparation_items (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  envelope_id VARCHAR(64) NOT NULL,
  item_type VARCHAR(64) NOT NULL,
  item_ref_id VARCHAR(64) NOT NULL,
  planned_action VARCHAR(256) NULL,
  item_order INT DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prep_item_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_prep_item_city CHECK (city_code <> '__global__'),
  INDEX idx_prepitem_city (city_code),
  INDEX idx_prepitem_envelope (envelope_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE settlement_execution_preparation_items
  ADD CONSTRAINT fk_prep_item_envelope_city FOREIGN KEY (envelope_id, city_code) REFERENCES settlement_execution_preparation_envelopes(id, city_code);

CREATE TABLE settlement_execution_preparation_audit (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  envelope_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  event_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_admin_id VARCHAR(64) NULL,
  summary TEXT NULL,
  trace_id VARCHAR(64) NULL,
  CONSTRAINT fk_prep_audit_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_prep_audit_city CHECK (city_code <> '__global__'),
  INDEX idx_prepaudit_city (city_code),
  INDEX idx_prepaudit_envelope (envelope_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE settlement_execution_preparation_audit
  ADD CONSTRAINT fk_prep_audit_envelope_city FOREIGN KEY (envelope_id, city_code) REFERENCES settlement_execution_preparation_envelopes(id, city_code);

INSERT INTO schema_migrations(version) VALUES ('026_settlement_execution_preparation_envelope') ON DUPLICATE KEY UPDATE version=version;
