-- Phase 10D: Settlement Action Governance Review Workflow
-- Governance-only review records. No execution, no money movement.
CREATE TABLE settlement_action_governance_reviews (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  city_code VARCHAR(64) NOT NULL,
  intent_id VARCHAR(64) NOT NULL,
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending_review',
  review_decision VARCHAR(32) NULL,
  submitted_by_admin_id VARCHAR(64) NOT NULL,
  reviewed_by_admin_id VARCHAR(64) NULL,
  review_note VARCHAR(1000) NULL,
  rejection_reason VARCHAR(1000) NULL,
  changes_requested_note VARCHAR(1000) NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_governance_review_city FOREIGN KEY (city_code) REFERENCES cities(city_code),
  CONSTRAINT chk_governance_review_city CHECK (city_code <> '__global__'),
  CONSTRAINT fk_governance_review_intent FOREIGN KEY (intent_id)
    REFERENCES settlement_action_governance_intents(id),
  CONSTRAINT chk_governance_review_status CHECK (
    review_status IN (
      'pending_review',
      'approved_for_governance',
      'rejected_for_governance',
      'changes_requested',
      'cancelled',
      'archived'
    )
  ),
  CONSTRAINT chk_governance_review_decision CHECK (
    review_decision IS NULL OR review_decision IN (
      'approve_governance',
      'reject_governance',
      'request_changes',
      'cancel_review',
      'archive_review'
    )
  ),
  INDEX idx_governance_review_city (city_code),
  INDEX idx_governance_review_intent (intent_id),
  INDEX idx_governance_review_status (review_status),
  INDEX idx_governance_review_submitted (submitted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('021_settlement_action_governance_reviews')
ON DUPLICATE KEY UPDATE version=version;
