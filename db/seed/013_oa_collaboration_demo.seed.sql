-- Local/test-only OA organization and permission seed.
-- These rows are technical demo identities, not production company/legal facts.

INSERT INTO oa_organizations (
  organization_id, organization_code, name, organization_type, parent_organization_id, status
) VALUES
  ('oa-org-hq', 'XLB-HQ', '喜乐帮总公司', 'headquarters', NULL, 'active'),
  ('oa-org-hangzhou', 'XLB-HZ', '杭州分公司', 'branch', 'oa-org-hq', 'active'),
  ('oa-org-shanghai', 'XLB-SH', '上海分公司', 'branch', 'oa-org-hq', 'active'),
  ('oa-org-beijing', 'XLB-BJ', '北京分公司', 'branch', 'oa-org-hq', 'active')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  parent_organization_id = VALUES(parent_organization_id),
  status = VALUES(status);

INSERT INTO oa_organization_closure (
  ancestor_organization_id, descendant_organization_id, depth
) VALUES
  ('oa-org-hq', 'oa-org-hq', 0),
  ('oa-org-hangzhou', 'oa-org-hangzhou', 0),
  ('oa-org-shanghai', 'oa-org-shanghai', 0),
  ('oa-org-beijing', 'oa-org-beijing', 0),
  ('oa-org-hq', 'oa-org-hangzhou', 1),
  ('oa-org-hq', 'oa-org-shanghai', 1),
  ('oa-org-hq', 'oa-org-beijing', 1)
ON DUPLICATE KEY UPDATE depth = VALUES(depth);

INSERT INTO oa_organization_city_assignments (organization_id, city_code, status) VALUES
  ('oa-org-hangzhou', 'hangzhou', 'active'),
  ('oa-org-shanghai', 'shanghai', 'active'),
  ('oa-org-beijing', 'beijing', 'active')
ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO oa_branch_city_ownership (city_code, organization_id)
SELECT source.city_code, source.organization_id
FROM (
  SELECT 'hangzhou' AS city_code, 'oa-org-hangzhou' AS organization_id
  UNION ALL SELECT 'shanghai', 'oa-org-shanghai'
  UNION ALL SELECT 'beijing', 'oa-org-beijing'
) source
WHERE NOT EXISTS (
  SELECT 1 FROM oa_branch_city_ownership ownership
  WHERE ownership.city_code = source.city_code
    AND ownership.organization_id = source.organization_id
);

INSERT INTO admin_city_scopes (admin_user_id, city_code) VALUES
  ('admin-global', '__global__'),
  ('admin-hangzhou', 'hangzhou'),
  ('admin-shanghai', 'shanghai')
ON DUPLICATE KEY UPDATE city_code = VALUES(city_code);

INSERT INTO oa_memberships (
  membership_id, admin_user_id, organization_id, status, authz_version
) VALUES
  ('oa-member-hq-global', 'admin-global', 'oa-org-hq', 'active', 1),
  ('oa-member-hangzhou', 'admin-hangzhou', 'oa-org-hangzhou', 'active', 1),
  ('oa-member-shanghai', 'admin-shanghai', 'oa-org-shanghai', 'active', 1)
ON DUPLICATE KEY UPDATE status = VALUES(status), authz_version = VALUES(authz_version);

INSERT INTO oa_permissions (permission_key, description, risk_level) VALUES
  ('oa.workbench.read', 'Read OA workbench', 'read'),
  ('oa.task.read', 'Read OA tasks', 'read'),
  ('oa.task.manage', 'Create and transition OA tasks', 'normal'),
  ('oa.approval.read', 'Read OA approvals', 'read'),
  ('oa.approval.request', 'Create OA approval requests', 'normal'),
  ('oa.approval.decide', 'Decide OA approval steps', 'high'),
  ('oa.notification.read', 'Read OA notifications', 'read'),
  ('oa.organization.read', 'Read organization structure', 'read'),
  ('oa.organization.manage', 'Manage organization structure', 'high'),
  ('oa.authorization.read', 'Read authorization grants', 'read'),
  ('oa.authorization.manage', 'Manage authorization grants', 'high'),
  ('oa.audit.read', 'Read OA audit records', 'read'),
  ('oa.activity.read', 'Read headquarters activity projection', 'read'),
  ('operations.orders.read', 'Read operations orders', 'read'),
  ('operations.catalog.read', 'Read catalog operations', 'read'),
  ('operations.catalog.manage', 'Manage catalog operations', 'high'),
  ('operations.certification.read', 'Read worker certifications', 'read'),
  ('operations.certification.decide', 'Decide worker certifications', 'high'),
  ('operations.dispatch.read', 'Read dispatch operations', 'read'),
  ('operations.dispatch.manage', 'Manage dispatch operations', 'high'),
  ('aftersale.read', 'Read aftersale operations', 'read'),
  ('aftersale.manage', 'Manage aftersale operations', 'high'),
  ('enterprise.read', 'Read enterprise operations', 'read'),
  ('enterprise.manage', 'Manage enterprise operations', 'high'),
  ('finance.settlement.read', 'Read settlement operations', 'read'),
  ('finance.settlement.review', 'Review settlement operations', 'high'),
  ('finance.withdrawal.read', 'Read worker withdrawals', 'read'),
  ('finance.withdrawal.review', 'Review worker withdrawals', 'high'),
  ('support.read', 'Read support operations', 'read'),
  ('support.manage', 'Manage support operations', 'normal'),
  ('support.quality.read', 'Read support quality', 'read'),
  ('support.quality.manage', 'Manage support quality', 'high'),
  ('reviews.read', 'Read reviews and reputation', 'read'),
  ('reviews.moderate', 'Moderate reviews', 'high'),
  ('marketing.read', 'Read marketing operations', 'read'),
  ('marketing.manage', 'Manage marketing operations', 'high')
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  risk_level = VALUES(risk_level);

INSERT INTO oa_roles (role_id, organization_id, role_key, name, status) VALUES
  ('oa-role-hq-super', 'oa-org-hq', 'hq_super_admin', '总部超级管理员', 'active'),
  ('oa-role-branch-admin-hz', 'oa-org-hangzhou', 'branch_admin', '分公司管理员', 'active'),
  ('oa-role-branch-admin-sh', 'oa-org-shanghai', 'branch_admin', '分公司管理员', 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status);

INSERT INTO oa_role_permissions (role_id, permission_key)
SELECT 'oa-role-hq-super', permission_key FROM oa_permissions
ON DUPLICATE KEY UPDATE permission_key = VALUES(permission_key);

INSERT INTO oa_role_permissions (role_id, permission_key) VALUES
  ('oa-role-branch-admin-hz', 'oa.workbench.read'),
  ('oa-role-branch-admin-hz', 'oa.task.read'),
  ('oa-role-branch-admin-hz', 'oa.task.manage'),
  ('oa-role-branch-admin-hz', 'oa.approval.read'),
  ('oa-role-branch-admin-hz', 'oa.approval.request'),
  ('oa-role-branch-admin-hz', 'oa.notification.read'),
  ('oa-role-branch-admin-hz', 'oa.organization.read'),
  ('oa-role-branch-admin-hz', 'oa.activity.read'),
  ('oa-role-branch-admin-hz', 'operations.orders.read'),
  ('oa-role-branch-admin-hz', 'operations.catalog.read'),
  ('oa-role-branch-admin-hz', 'operations.certification.read'),
  ('oa-role-branch-admin-hz', 'operations.dispatch.read'),
  ('oa-role-branch-admin-hz', 'aftersale.read'),
  ('oa-role-branch-admin-hz', 'enterprise.read'),
  ('oa-role-branch-admin-hz', 'finance.settlement.read'),
  ('oa-role-branch-admin-hz', 'finance.withdrawal.read'),
  ('oa-role-branch-admin-hz', 'support.read'),
  ('oa-role-branch-admin-hz', 'support.manage'),
  ('oa-role-branch-admin-hz', 'reviews.read'),
  ('oa-role-branch-admin-hz', 'marketing.read'),
  ('oa-role-branch-admin-sh', 'oa.workbench.read'),
  ('oa-role-branch-admin-sh', 'oa.task.read'),
  ('oa-role-branch-admin-sh', 'oa.task.manage'),
  ('oa-role-branch-admin-sh', 'oa.approval.read'),
  ('oa-role-branch-admin-sh', 'oa.approval.request'),
  ('oa-role-branch-admin-sh', 'oa.notification.read'),
  ('oa-role-branch-admin-sh', 'oa.organization.read'),
  ('oa-role-branch-admin-sh', 'oa.activity.read'),
  ('oa-role-branch-admin-sh', 'operations.orders.read'),
  ('oa-role-branch-admin-sh', 'operations.catalog.read'),
  ('oa-role-branch-admin-sh', 'operations.certification.read'),
  ('oa-role-branch-admin-sh', 'operations.dispatch.read'),
  ('oa-role-branch-admin-sh', 'aftersale.read'),
  ('oa-role-branch-admin-sh', 'enterprise.read'),
  ('oa-role-branch-admin-sh', 'finance.settlement.read'),
  ('oa-role-branch-admin-sh', 'finance.withdrawal.read'),
  ('oa-role-branch-admin-sh', 'support.read'),
  ('oa-role-branch-admin-sh', 'support.manage'),
  ('oa-role-branch-admin-sh', 'reviews.read'),
  ('oa-role-branch-admin-sh', 'marketing.read')
ON DUPLICATE KEY UPDATE permission_key = VALUES(permission_key);

INSERT INTO oa_membership_roles (membership_id, role_id, granted_by_membership_id) VALUES
  ('oa-member-hq-global', 'oa-role-hq-super', NULL),
  ('oa-member-hangzhou', 'oa-role-branch-admin-hz', 'oa-member-hq-global'),
  ('oa-member-shanghai', 'oa-role-branch-admin-sh', 'oa-member-hq-global')
ON DUPLICATE KEY UPDATE granted_by_membership_id = VALUES(granted_by_membership_id);

INSERT INTO oa_delegation_grants (
  grant_id, grantor_organization_id, grantee_organization_id, city_code,
  permission_key, status, granted_by_membership_id, approved_by_membership_id,
  reason, idempotency_key_hash, request_fingerprint
)
SELECT
  CONCAT('oa-grant-', SUBSTRING(SHA2(CONCAT(r.organization_id, ':', rp.permission_key), 256), 1, 20)),
  'oa-org-hq',
  r.organization_id,
  city.city_code,
  rp.permission_key,
  'active',
  'oa-member-hq-global',
  NULL,
  'Local demo delegation from headquarters',
  SHA2(CONCAT('seed:', r.organization_id, ':', rp.permission_key), 256),
  SHA2(CONCAT('seed-request:', r.organization_id, ':', city.city_code, ':', rp.permission_key), 256)
FROM oa_roles r
JOIN oa_role_permissions rp ON rp.role_id = r.role_id
JOIN oa_organization_city_assignments city ON city.organization_id = r.organization_id
WHERE r.role_key = 'branch_admin'
ON DUPLICATE KEY UPDATE
  status = VALUES(status),
  reason = VALUES(reason);
