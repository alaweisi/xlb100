-- Phase 10F: Settlement Action Governance Readiness Packets
-- Governance-only readiness metadata. No execution, no file generation, no money dry-run.
CREATE TABLE settlement_action_governance_readiness_packets (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  intent_id VARCHAR(64) NOT NULL,
  review_id VARCHAR(64) NULL,
  evidence_bundle_id VARCHAR(64) NULL,
  statement_id VARCHAR(64) NULL,
  packet_status VARCHAR(32) NOT NULL DEFAULT 'draft',
  readiness_checks_json JSON NOT NULL DEFAULT ('{}'),
  blocker_flags_json JSON NOT NULL DEFAULT ('[]'),
  risk_flags_json JSON NOT NULL DEFAULT ('[]'),
  source_refs_json JSON NOT NULL DEFAULT ('[]'),
  dry_run_guard_json JSON NOT NULL,
  execution_boundary_json JSON NOT NULL,
  created_by_admin_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,
  CONSTRAINT fk_readiness_packet_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_readiness_packet_city CHECK (city_code <> '__global__'),
  CONSTRAINT fk_readiness_packet_intent FOREIGN KEY (intent_id) REFERENCES settlement_action_governance_intents(id),
  CONSTRAINT fk_readiness_packet_review FOREIGN KEY (review_id) REFERENCES settlement_action_governance_reviews(id),
  CONSTRAINT fk_readiness_packet_evidence FOREIGN KEY (evidence_bundle_id) REFERENCES settlement_action_governance_evidence_bundles(id),
  CONSTRAINT chk_readiness_packet_status CHECK (packet_status IN ('draft','checks_pending','blocked','ready_for_future_phase_review','archived')),
  INDEX idx_readiness_packet_city (city_code),
  INDEX idx_readiness_packet_intent (intent_id),
  INDEX idx_readiness_packet_status (packet_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('023_settlement_action_governance_readiness_packets') ON DUPLICATE KEY UPDATE version=version;
