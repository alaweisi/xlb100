-- Phase 10E: Settlement Action Governance Evidence Bundles
-- Governance-only evidence references. No file generation, no download, no execution.
CREATE TABLE settlement_action_governance_evidence_bundles (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  intent_id VARCHAR(64) NOT NULL,
  review_id VARCHAR(64) NULL,
  statement_id VARCHAR(64) NULL,
  bundle_status VARCHAR(32) NOT NULL DEFAULT 'draft',
  evidence_refs_json JSON NOT NULL DEFAULT ('[]'),
  phase9_context_json JSON NOT NULL DEFAULT ('{}'),
  review_history_refs_json JSON NOT NULL DEFAULT ('[]'),
  audit_trail_refs_json JSON NOT NULL DEFAULT ('[]'),
  risk_summary VARCHAR(2000) NULL,
  created_by_admin_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at TIMESTAMP NULL,
  CONSTRAINT fk_evidence_bundle_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_evidence_bundle_city CHECK (city_code <> '__global__'),
  CONSTRAINT fk_evidence_bundle_intent FOREIGN KEY (intent_id)
    REFERENCES settlement_action_governance_intents(id),
  CONSTRAINT fk_evidence_bundle_review FOREIGN KEY (review_id)
    REFERENCES settlement_action_governance_reviews(id),
  CONSTRAINT chk_evidence_bundle_status CHECK (
    bundle_status IN (
      'draft',
      'attached_to_review',
      'approved_for_governance_reference',
      'archived'
    )
  ),
  INDEX idx_evidence_bundle_city (city_code),
  INDEX idx_evidence_bundle_intent (intent_id),
  INDEX idx_evidence_bundle_review (review_id),
  INDEX idx_evidence_bundle_status (bundle_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('022_settlement_action_governance_evidence_bundles')
ON DUPLICATE KEY UPDATE version=version;
