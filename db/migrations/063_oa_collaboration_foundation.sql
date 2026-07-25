-- OA collaboration foundation.
-- Human-authorized local construction batch on 2026-07-25.
-- Depends on: 062_customer_sdui_control_plane.sql
-- Additive only: existing Admin identities and domain state machines remain authoritative.

CREATE TABLE IF NOT EXISTS oa_organizations (
  organization_id VARCHAR(64) NOT NULL,
  organization_code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  organization_type VARCHAR(24) NOT NULL,
  parent_organization_id VARCHAR(64) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (organization_id),
  UNIQUE KEY uk_oa_org_code (organization_code),
  KEY idx_oa_org_parent (parent_organization_id),
  CONSTRAINT fk_oa_org_parent FOREIGN KEY (parent_organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_org_type CHECK (organization_type IN ('headquarters', 'branch')),
  CONSTRAINT chk_oa_org_status CHECK (status IN ('active', 'suspended', 'revoked'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_organization_closure (
  ancestor_organization_id VARCHAR(64) NOT NULL,
  descendant_organization_id VARCHAR(64) NOT NULL,
  depth SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (ancestor_organization_id, descendant_organization_id),
  KEY idx_oa_org_closure_descendant (descendant_organization_id, depth),
  CONSTRAINT fk_oa_org_closure_ancestor FOREIGN KEY (ancestor_organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE CASCADE,
  CONSTRAINT fk_oa_org_closure_descendant FOREIGN KEY (descendant_organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_organization_city_assignments (
  organization_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  valid_from TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  valid_to TIMESTAMP(3) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (organization_id, city_code),
  KEY idx_oa_org_city_city (city_code, status),
  CONSTRAINT fk_oa_org_city_org FOREIGN KEY (organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_org_city_city FOREIGN KEY (city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_org_city_status CHECK (status IN ('active', 'suspended', 'revoked')),
  CONSTRAINT chk_oa_org_city_real CHECK (city_code <> '__global__')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_memberships (
  membership_id VARCHAR(64) NOT NULL,
  admin_user_id VARCHAR(64) NOT NULL,
  organization_id VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  authz_version INT UNSIGNED NOT NULL DEFAULT 0,
  valid_from TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  valid_to TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (membership_id),
  UNIQUE KEY uk_oa_membership_user_org (admin_user_id, organization_id),
  KEY idx_oa_membership_org_status (organization_id, status),
  CONSTRAINT fk_oa_membership_admin FOREIGN KEY (admin_user_id)
    REFERENCES admin_users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_membership_org FOREIGN KEY (organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_membership_status CHECK (status IN ('active', 'suspended', 'revoked'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_permissions (
  permission_key VARCHAR(96) NOT NULL,
  description VARCHAR(255) NOT NULL,
  risk_level VARCHAR(16) NOT NULL DEFAULT 'normal',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (permission_key),
  CONSTRAINT chk_oa_permission_risk CHECK (risk_level IN ('read', 'normal', 'high'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_roles (
  role_id VARCHAR(64) NOT NULL,
  organization_id VARCHAR(64) NOT NULL,
  role_key VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (role_id),
  UNIQUE KEY uk_oa_role_org_key (organization_id, role_key),
  CONSTRAINT fk_oa_role_org FOREIGN KEY (organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_role_status CHECK (status IN ('active', 'suspended', 'revoked'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_role_permissions (
  role_id VARCHAR(64) NOT NULL,
  permission_key VARCHAR(96) NOT NULL,
  granted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (role_id, permission_key),
  CONSTRAINT fk_oa_role_permission_role FOREIGN KEY (role_id)
    REFERENCES oa_roles (role_id) ON DELETE CASCADE,
  CONSTRAINT fk_oa_role_permission_key FOREIGN KEY (permission_key)
    REFERENCES oa_permissions (permission_key) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_membership_roles (
  membership_id VARCHAR(64) NOT NULL,
  role_id VARCHAR(64) NOT NULL,
  granted_by_membership_id VARCHAR(64) NULL,
  valid_from TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  valid_to TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (membership_id, role_id),
  CONSTRAINT fk_oa_membership_role_member FOREIGN KEY (membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE CASCADE,
  CONSTRAINT fk_oa_membership_role_role FOREIGN KEY (role_id)
    REFERENCES oa_roles (role_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_membership_role_grantor FOREIGN KEY (granted_by_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_delegation_grants (
  grant_id VARCHAR(64) NOT NULL,
  grantor_organization_id VARCHAR(64) NOT NULL,
  grantee_organization_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  permission_key VARCHAR(96) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  valid_from TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  valid_to TIMESTAMP(3) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  granted_by_membership_id VARCHAR(64) NOT NULL,
  approved_by_membership_id VARCHAR(64) NULL,
  reason VARCHAR(1000) NOT NULL,
  idempotency_key_hash CHAR(64) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (grant_id),
  UNIQUE KEY uk_oa_delegation_idempotency (granted_by_membership_id, idempotency_key_hash),
  KEY idx_oa_delegation_effective (grantee_organization_id, city_code, permission_key, status),
  CONSTRAINT fk_oa_delegation_grantor_org FOREIGN KEY (grantor_organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_delegation_grantee_org FOREIGN KEY (grantee_organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_delegation_city FOREIGN KEY (city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_delegation_permission FOREIGN KEY (permission_key)
    REFERENCES oa_permissions (permission_key) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_delegation_grantor_member FOREIGN KEY (granted_by_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_delegation_approver_member FOREIGN KEY (approved_by_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_delegation_status CHECK (status IN ('pending', 'active', 'revoked', 'expired')),
  CONSTRAINT chk_oa_delegation_city_real CHECK (city_code <> '__global__'),
  CONSTRAINT chk_oa_delegation_distinct_org CHECK (grantor_organization_id <> grantee_organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_sessions (
  session_id VARCHAR(64) NOT NULL,
  membership_id VARCHAR(64) NOT NULL,
  token_jti CHAR(36) NOT NULL,
  authz_version INT UNSIGNED NOT NULL,
  device_summary VARCHAR(255) NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  revoked_at TIMESTAMP(3) NULL,
  last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (session_id),
  UNIQUE KEY uk_oa_session_jti (token_jti),
  KEY idx_oa_session_member_active (membership_id, revoked_at, expires_at),
  CONSTRAINT fk_oa_session_membership FOREIGN KEY (membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_workflow_definitions (
  workflow_definition_id VARCHAR(64) NOT NULL,
  workflow_key VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  owning_organization_id VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  current_revision INT UNSIGNED NOT NULL DEFAULT 0,
  created_by_membership_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workflow_definition_id),
  UNIQUE KEY uk_oa_workflow_key_org (owning_organization_id, workflow_key),
  CONSTRAINT fk_oa_workflow_owner_org FOREIGN KEY (owning_organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_workflow_creator FOREIGN KEY (created_by_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_workflow_status CHECK (status IN ('draft', 'active', 'retired'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_workflow_revisions (
  workflow_definition_id VARCHAR(64) NOT NULL,
  revision INT UNSIGNED NOT NULL,
  definition_json JSON NOT NULL,
  content_hash CHAR(64) NOT NULL,
  published_by_membership_id VARCHAR(64) NULL,
  published_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (workflow_definition_id, revision),
  UNIQUE KEY uk_oa_workflow_revision_hash (workflow_definition_id, content_hash),
  CONSTRAINT fk_oa_workflow_revision_definition FOREIGN KEY (workflow_definition_id)
    REFERENCES oa_workflow_definitions (workflow_definition_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_workflow_revision_publisher FOREIGN KEY (published_by_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_approval_requests (
  approval_request_id VARCHAR(64) NOT NULL,
  organization_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  request_type VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  requested_by_membership_id VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  current_step_order INT UNSIGNED NOT NULL DEFAULT 1,
  source_domain VARCHAR(64) NULL,
  source_reference_id VARCHAR(128) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  submitted_at TIMESTAMP(3) NULL,
  decided_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (approval_request_id),
  KEY idx_oa_approval_queue (organization_id, city_code, status, created_at),
  CONSTRAINT fk_oa_approval_org FOREIGN KEY (organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_approval_city FOREIGN KEY (city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_approval_requester FOREIGN KEY (requested_by_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_approval_status CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'withdrawn', 'expired')),
  CONSTRAINT chk_oa_approval_city_real CHECK (city_code <> '__global__')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_approval_steps (
  approval_step_id VARCHAR(64) NOT NULL,
  approval_request_id VARCHAR(64) NOT NULL,
  step_order INT UNSIGNED NOT NULL,
  organization_id VARCHAR(64) NOT NULL,
  required_permission VARCHAR(96) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  decided_by_membership_id VARCHAR(64) NULL,
  decided_at TIMESTAMP(3) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (approval_step_id),
  UNIQUE KEY uk_oa_approval_step_order (approval_request_id, step_order),
  CONSTRAINT fk_oa_approval_step_request FOREIGN KEY (approval_request_id)
    REFERENCES oa_approval_requests (approval_request_id) ON DELETE CASCADE,
  CONSTRAINT fk_oa_approval_step_org FOREIGN KEY (organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_approval_step_permission FOREIGN KEY (required_permission)
    REFERENCES oa_permissions (permission_key) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_approval_step_decider FOREIGN KEY (decided_by_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_approval_step_status CHECK (status IN ('pending', 'approved', 'rejected', 'returned', 'skipped'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_approval_decisions (
  decision_id VARCHAR(64) NOT NULL,
  approval_request_id VARCHAR(64) NOT NULL,
  approval_step_id VARCHAR(64) NOT NULL,
  decision VARCHAR(24) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  decided_by_membership_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (decision_id),
  UNIQUE KEY uk_oa_approval_step_decider (approval_step_id, decided_by_membership_id),
  KEY idx_oa_approval_decision_request (approval_request_id, created_at),
  CONSTRAINT fk_oa_decision_request FOREIGN KEY (approval_request_id)
    REFERENCES oa_approval_requests (approval_request_id) ON DELETE CASCADE,
  CONSTRAINT fk_oa_decision_step FOREIGN KEY (approval_step_id)
    REFERENCES oa_approval_steps (approval_step_id) ON DELETE CASCADE,
  CONSTRAINT fk_oa_decision_member FOREIGN KEY (decided_by_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_decision CHECK (decision IN ('approved', 'rejected', 'returned'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_tasks (
  task_id VARCHAR(64) NOT NULL,
  organization_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  priority VARCHAR(16) NOT NULL DEFAULT 'normal',
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  assignee_membership_id VARCHAR(64) NULL,
  created_by_membership_id VARCHAR(64) NOT NULL,
  due_at TIMESTAMP(3) NULL,
  blocked_reason VARCHAR(1000) NULL,
  completed_at TIMESTAMP(3) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (task_id),
  KEY idx_oa_task_queue (organization_id, city_code, status, due_at),
  KEY idx_oa_task_assignee (assignee_membership_id, status, due_at),
  CONSTRAINT fk_oa_task_org FOREIGN KEY (organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_task_city FOREIGN KEY (city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_task_assignee FOREIGN KEY (assignee_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_task_creator FOREIGN KEY (created_by_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_task_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT chk_oa_task_status CHECK (status IN ('open', 'claimed', 'in_progress', 'blocked', 'completed', 'cancelled')),
  CONSTRAINT chk_oa_task_city_real CHECK (city_code <> '__global__')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_task_assignments (
  task_id VARCHAR(64) NOT NULL,
  membership_id VARCHAR(64) NOT NULL,
  assignment_type VARCHAR(24) NOT NULL DEFAULT 'candidate',
  assigned_by_membership_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (task_id, membership_id),
  CONSTRAINT fk_oa_task_assignment_task FOREIGN KEY (task_id)
    REFERENCES oa_tasks (task_id) ON DELETE CASCADE,
  CONSTRAINT fk_oa_task_assignment_member FOREIGN KEY (membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_task_assignment_assigner FOREIGN KEY (assigned_by_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_task_assignment_type CHECK (assignment_type IN ('candidate', 'assignee', 'watcher'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_process_events (
  event_id VARCHAR(64) NOT NULL,
  organization_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NULL,
  aggregate_type VARCHAR(32) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(96) NOT NULL,
  actor_membership_id VARCHAR(64) NULL,
  detail_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (event_id),
  KEY idx_oa_process_timeline (aggregate_type, aggregate_id, created_at),
  KEY idx_oa_process_city (city_code, created_at),
  CONSTRAINT fk_oa_process_event_org FOREIGN KEY (organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_process_event_city FOREIGN KEY (city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_process_event_actor FOREIGN KEY (actor_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_process_aggregate CHECK (aggregate_type IN ('task', 'approval', 'authorization', 'organization')),
  CONSTRAINT chk_oa_process_city_real CHECK (city_code IS NULL OR city_code <> '__global__')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_mutation_receipts (
  receipt_id VARCHAR(64) NOT NULL,
  membership_id VARCHAR(64) NOT NULL,
  organization_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NULL,
  operation VARCHAR(96) NOT NULL,
  idempotency_key_hash CHAR(64) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  response_json JSON NOT NULL,
  http_status SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (receipt_id),
  UNIQUE KEY uk_oa_receipt_operation_key (membership_id, operation, idempotency_key_hash),
  CONSTRAINT fk_oa_receipt_member FOREIGN KEY (membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_receipt_org FOREIGN KEY (organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_receipt_city FOREIGN KEY (city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_receipt_city_real CHECK (city_code IS NULL OR city_code <> '__global__')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_activity_projection (
  activity_id VARCHAR(64) NOT NULL,
  source_event_id VARCHAR(64) NOT NULL,
  organization_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  source_domain VARCHAR(64) NOT NULL,
  event_type VARCHAR(96) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  occurred_at TIMESTAMP(3) NOT NULL,
  projected_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  payload_hash CHAR(64) NOT NULL,
  PRIMARY KEY (activity_id),
  UNIQUE KEY uk_oa_activity_source (organization_id, city_code, source_event_id),
  KEY idx_oa_activity_scope (organization_id, city_code, occurred_at),
  CONSTRAINT fk_oa_activity_org FOREIGN KEY (organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_activity_city FOREIGN KEY (city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_activity_city_real CHECK (city_code <> '__global__')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_activity_projection_cursors (
  organization_id VARCHAR(64) NOT NULL,
  city_code VARCHAR(64) NOT NULL,
  last_created_at TIMESTAMP(3) NOT NULL,
  last_event_id VARCHAR(64) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (organization_id, city_code),
  CONSTRAINT fk_oa_activity_cursor_org FOREIGN KEY (organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE CASCADE,
  CONSTRAINT fk_oa_activity_cursor_city FOREIGN KEY (city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_activity_cursor_city_real CHECK (city_code <> '__global__')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oa_audit_records (
  audit_id VARCHAR(64) NOT NULL,
  actor_user_id VARCHAR(64) NULL,
  actor_membership_id VARCHAR(64) NULL,
  organization_id VARCHAR(64) NULL,
  city_code VARCHAR(64) NULL,
  permission_key VARCHAR(96) NULL,
  action VARCHAR(96) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(128) NULL,
  decision VARCHAR(16) NOT NULL,
  reason_code VARCHAR(96) NOT NULL,
  before_hash CHAR(64) NULL,
  after_hash CHAR(64) NULL,
  trace_id VARCHAR(128) NOT NULL,
  idempotency_receipt_id VARCHAR(64) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (audit_id),
  KEY idx_oa_audit_target (target_type, target_id, created_at),
  KEY idx_oa_audit_scope (organization_id, city_code, created_at),
  KEY idx_oa_audit_actor (actor_user_id, created_at),
  CONSTRAINT fk_oa_audit_actor_member FOREIGN KEY (actor_membership_id)
    REFERENCES oa_memberships (membership_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_audit_org FOREIGN KEY (organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_audit_city FOREIGN KEY (city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_audit_permission FOREIGN KEY (permission_key)
    REFERENCES oa_permissions (permission_key) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_audit_receipt FOREIGN KEY (idempotency_receipt_id)
    REFERENCES oa_mutation_receipts (receipt_id) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_audit_decision CHECK (decision IN ('allowed', 'denied')),
  CONSTRAINT chk_oa_audit_city_real CHECK (city_code IS NULL OR city_code <> '__global__')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('063_oa_collaboration_foundation')
ON DUPLICATE KEY UPDATE version = version;
