-- Human-authorized OA completion batch on 2026-07-26: enforce one active branch owner per city.
-- Additive ownership guard; existing organization/city assignment history remains authoritative.

CREATE TABLE IF NOT EXISTS oa_branch_city_ownership (
  city_code VARCHAR(64) NOT NULL,
  organization_id VARCHAR(64) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  assigned_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (city_code),
  KEY idx_oa_branch_city_owner_org (organization_id),
  CONSTRAINT fk_oa_branch_city_owner_city FOREIGN KEY (city_code)
    REFERENCES cities (city_code) ON DELETE RESTRICT,
  CONSTRAINT fk_oa_branch_city_owner_org FOREIGN KEY (organization_id)
    REFERENCES oa_organizations (organization_id) ON DELETE RESTRICT,
  CONSTRAINT chk_oa_branch_city_owner_real CHECK (city_code <> '__global__')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deliberately no GROUP BY/IGNORE: pre-existing duplicate active branch ownership
-- must fail migration instead of silently selecting a winner.
INSERT INTO oa_branch_city_ownership (city_code, organization_id)
SELECT assignment.city_code, assignment.organization_id
FROM oa_organization_city_assignments assignment
JOIN oa_organizations organization
  ON organization.organization_id = assignment.organization_id
 AND organization.organization_type = 'branch'
 AND organization.status = 'active'
WHERE assignment.status = 'active'
  AND assignment.valid_from <= CURRENT_TIMESTAMP(3)
  AND (assignment.valid_to IS NULL OR assignment.valid_to > CURRENT_TIMESTAMP(3))
  AND NOT EXISTS (
    SELECT 1
    FROM oa_branch_city_ownership ownership
    WHERE ownership.city_code = assignment.city_code
      AND ownership.organization_id = assignment.organization_id
  );

INSERT INTO schema_migrations (version) VALUES ('065_oa_branch_city_ownership')
ON DUPLICATE KEY UPDATE version = version;
