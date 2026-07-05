-- Phase 10C: Settlement Action Governance Intent Persistence
-- Governance-only intent drafts. No execution, no money movement.
CREATE TABLE settlement_action_governance_intents (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  statement_id VARCHAR(64) NULL,
  action_kind VARCHAR(64) NOT NULL,
  action_status VARCHAR(32) NOT NULL DEFAULT 'draft',
  target_type VARCHAR(64) NULL,
  target_ref VARCHAR(64) NULL,
  requested_by_admin_id VARCHAR(64) NOT NULL,
  requested_reason VARCHAR(1000) NOT NULL,
  evidence_refs_json JSON NOT NULL DEFAULT ('[]'),
  risk_flags_json JSON NOT NULL DEFAULT ('[]'),
  phase_boundary_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP NULL,
  archived_at TIMESTAMP NULL,
  CONSTRAINT fk_governance_intent_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_governance_intent_city CHECK (city_code <> '__global__'),
  CONSTRAINT chk_governance_intent_action_kind CHECK (
    action_kind IN (
      'review_settlement_statement',
      'prepare_payout_review',
      'prepare_refund_review',
      'prepare_reversal_review',
      'request_evidence_review',
      'mark_governance_risk'
    )
  ),
  CONSTRAINT chk_governance_intent_action_status CHECK (
    action_status IN (
      'draft',
      'ready_for_review',
      'blocked',
      'cancelled',
      'archived'
    )
  ),
  INDEX idx_governance_intent_city (city_code),
  INDEX idx_governance_intent_statement (statement_id),
  INDEX idx_governance_intent_status (action_status),
  INDEX idx_governance_intent_kind (action_kind),
  INDEX idx_governance_intent_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('020_settlement_action_governance_intents')
ON DUPLICATE KEY UPDATE version=version;
