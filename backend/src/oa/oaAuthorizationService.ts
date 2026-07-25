import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import {
  OA_PERMISSION_KEYS,
  type CityCode,
  type OaOrganization,
  type OaOrganizationType,
  type OaPermissionKey,
  type OaPrincipal,
  type RequestContext,
  type Role,
} from "@xlb/types";
import { getMysqlPool } from "../dal/mysqlPool.js";
import { GLOBAL_ADMIN_CITY_MARKER } from "../dal/adminQueryGuard.js";

const PERMISSION_SET = new Set<string>(OA_PERMISSION_KEYS);

export class OaAuthorizationError extends Error {
  constructor(
    message: string,
    readonly statusCode: 401 | 403,
    readonly reasonCode: string,
  ) {
    super(message);
    this.name = "OaAuthorizationError";
  }
}

type IdentityRow = RowDataPacket & {
  user_id: string;
  username: string;
  legacy_role: Role;
  membership_id: string;
  membership_status: string;
  authz_version: number;
  organization_id: string;
  organization_code: string;
  organization_name: string;
  organization_type: OaOrganizationType;
  parent_organization_id: string | null;
  organization_status: string;
  organization_version: number;
};

export class OaAuthorizationService {
  async authorize(
    context: RequestContext,
    permission: OaPermissionKey,
    requestedCityCodes: readonly string[] = [],
  ): Promise<OaPrincipal> {
    if (context.appType !== "oa" || !context.userId || !context.backoffice) {
      throw new OaAuthorizationError("OA identity required", 401, "oa_identity_required");
    }
    const backoffice = context.backoffice;
    const [identityRows] = await getMysqlPool().query<IdentityRow[]>(
      `SELECT au.id AS user_id, au.username, au.role AS legacy_role,
              m.membership_id, m.status AS membership_status, m.authz_version,
              o.organization_id, o.organization_code, o.name AS organization_name,
              o.organization_type, o.parent_organization_id,
              o.status AS organization_status, o.version AS organization_version
       FROM oa_sessions s
       JOIN oa_memberships m ON m.membership_id = s.membership_id
       JOIN admin_users au ON au.id = m.admin_user_id
       JOIN oa_organizations o ON o.organization_id = m.organization_id
       WHERE s.session_id = ?
         AND s.token_jti = ?
         AND s.membership_id = ?
         AND m.organization_id = ?
         AND au.id = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > CURRENT_TIMESTAMP(3)
         AND s.authz_version = ?
         AND m.authz_version = ?
         AND m.status = 'active'
         AND o.status = 'active'
         AND m.valid_from <= CURRENT_TIMESTAMP(3)
         AND (m.valid_to IS NULL OR m.valid_to > CURRENT_TIMESTAMP(3))
       LIMIT 1`,
      [
        backoffice.sessionId,
        backoffice.tokenJti,
        backoffice.membershipId,
        backoffice.organizationId,
        context.userId,
        backoffice.authzVersion,
        backoffice.authzVersion,
      ],
    );
    const identity = identityRows[0];
    if (!identity) {
      throw new OaAuthorizationError("OA session or authorization version is no longer valid", 401, "oa_session_invalid");
    }

    const [permissionRows] = await getMysqlPool().query<(RowDataPacket & { permission_key: string })[]>(
      `SELECT DISTINCT rp.permission_key
       FROM oa_membership_roles mr
       JOIN oa_roles r
         ON r.role_id = mr.role_id
        AND r.organization_id = ?
        AND r.status = 'active'
       JOIN oa_role_permissions rp ON rp.role_id = r.role_id
       WHERE mr.membership_id = ?
         AND mr.valid_from <= CURRENT_TIMESTAMP(3)
         AND (mr.valid_to IS NULL OR mr.valid_to > CURRENT_TIMESTAMP(3))`,
      [identity.organization_id, identity.membership_id],
    );
    const rolePermissions = permissionRows
      .map((row) => row.permission_key)
      .filter((key): key is OaPermissionKey => PERMISSION_SET.has(key));
    if (!rolePermissions.includes(permission)) {
      await this.recordAudit(context, {
        organizationId: identity.organization_id,
        permission,
        action: "authorization.check",
        targetType: "permission",
        targetId: permission,
        decision: "denied",
        reasonCode: "permission_missing",
      });
      throw new OaAuthorizationError("OA permission denied", 403, "permission_missing");
    }

    const [organizationCityRows] = await getMysqlPool().query<(RowDataPacket & { city_code: CityCode })[]>(
      `SELECT DISTINCT assignment.city_code
       FROM oa_organization_closure closure
       JOIN oa_organization_city_assignments assignment
         ON assignment.organization_id = closure.descendant_organization_id
       JOIN cities city ON city.city_code = assignment.city_code AND city.is_open = 1
       WHERE closure.ancestor_organization_id = ?
         AND assignment.status = 'active'
         AND assignment.valid_from <= CURRENT_TIMESTAMP(3)
         AND (assignment.valid_to IS NULL OR assignment.valid_to > CURRENT_TIMESTAMP(3))
       ORDER BY assignment.city_code`,
      [identity.organization_id],
    );
    const organizationCities = organizationCityRows.map((row) => row.city_code);

    const [adminScopeRows] = await getMysqlPool().query<(RowDataPacket & { city_code: string })[]>(
      `SELECT city_code FROM admin_city_scopes WHERE admin_user_id = ? ORDER BY city_code`,
      [identity.user_id],
    );
    const rawAdminScopes = adminScopeRows.map((row) => row.city_code);
    const hasGlobalAdminScope = rawAdminScopes.includes(GLOBAL_ADMIN_CITY_MARKER);
    const baseCityCodes = hasGlobalAdminScope
      ? organizationCities
      : organizationCities.filter((cityCode) => rawAdminScopes.includes(cityCode));
    const permissionCityCodes: Partial<Record<OaPermissionKey, CityCode[]>> = {};
    if (identity.organization_type === "branch") {
      const [delegationRows] = await getMysqlPool().query<(RowDataPacket & {
        permission_key: string;
        city_code: CityCode;
      })[]>(
        `SELECT DISTINCT permission_key, city_code
         FROM oa_delegation_grants
         WHERE grantee_organization_id = ?
           AND status = 'active'
           AND valid_from <= CURRENT_TIMESTAMP(3)
           AND (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP(3))`,
        [identity.organization_id],
      );
      for (const rolePermission of rolePermissions) {
        const delegatedCities = new Set(
          delegationRows
            .filter((row) => row.permission_key === rolePermission)
            .map((row) => row.city_code),
        );
        const effectiveCities = baseCityCodes.filter((cityCode) => delegatedCities.has(cityCode));
        if (effectiveCities.length > 0) permissionCityCodes[rolePermission] = effectiveCities;
      }
    } else {
      for (const rolePermission of rolePermissions) {
        permissionCityCodes[rolePermission] = [...baseCityCodes];
      }
    }
    const permissions = rolePermissions.filter(
      (rolePermission) => (permissionCityCodes[rolePermission]?.length ?? 0) > 0,
    );
    let cityCodes = permissionCityCodes[permission] ?? [];
    if (!permissions.includes(permission)) {
      await this.recordAudit(context, {
        organizationId: identity.organization_id,
        permission,
        action: "authorization.delegation_scope",
        targetType: "permission",
        targetId: permission,
        decision: "denied",
        reasonCode: "delegation_missing",
      });
      throw new OaAuthorizationError("OA permission has no effective delegated scope", 403, "delegation_missing");
    }

    const normalizedRequested = [...new Set(requestedCityCodes.filter(Boolean))];
    const invalidRequested = normalizedRequested.filter(
      (cityCode) => cityCode === GLOBAL_ADMIN_CITY_MARKER || !cityCodes.includes(cityCode as CityCode),
    );
    if (invalidRequested.length > 0) {
      await this.recordAudit(context, {
        organizationId: identity.organization_id,
        permission,
        action: "authorization.city_scope",
        targetType: "city_scope",
        targetId: invalidRequested.join(","),
        decision: "denied",
        reasonCode: "city_scope_denied",
      });
      throw new OaAuthorizationError("Requested city is outside the effective OA scope", 403, "city_scope_denied");
    }
    if (normalizedRequested.length > 0) {
      cityCodes = normalizedRequested as CityCode[];
    }
    if (cityCodes.length === 0 && requestedCityCodes.length > 0) {
      throw new OaAuthorizationError("OA city scope is empty", 403, "city_scope_empty");
    }

    await getMysqlPool().query(
      `UPDATE oa_sessions SET last_seen_at = CURRENT_TIMESTAMP(3) WHERE session_id = ?`,
      [backoffice.sessionId],
    );

    const organization: OaOrganization = {
      organizationId: identity.organization_id,
      organizationCode: identity.organization_code,
      name: identity.organization_name,
      organizationType: identity.organization_type,
      parentOrganizationId: identity.parent_organization_id,
      status: "active",
      version: identity.organization_version,
    };
    return {
      userId: identity.user_id,
      username: identity.username,
      legacyRole: identity.legacy_role,
      sessionId: backoffice.sessionId,
      membershipId: identity.membership_id,
      organization,
      permissions,
      permissionCityCodes,
      cityCodes,
      authzVersion: identity.authz_version,
    };
  }

  async listOrganizations(principal: OaPrincipal): Promise<OaOrganization[]> {
    if (principal.cityCodes.length === 0) return [];
    const cityPlaceholders = principal.cityCodes.map(() => "?").join(", ");
    const [rows] = await getMysqlPool().query<(RowDataPacket & {
      organization_id: string;
      organization_code: string;
      name: string;
      organization_type: OaOrganizationType;
      parent_organization_id: string | null;
      status: "active" | "suspended" | "revoked";
      version: number;
    })[]>(
      `SELECT o.organization_id, o.organization_code, o.name, o.organization_type,
              o.parent_organization_id, o.status, o.version
       FROM oa_organization_closure c
       JOIN oa_organizations o ON o.organization_id = c.descendant_organization_id
       WHERE c.ancestor_organization_id = ?
         AND (o.organization_id = ? OR EXISTS (
           SELECT 1
           FROM oa_organization_city_assignments assignment
           WHERE assignment.organization_id = o.organization_id
             AND assignment.city_code IN (${cityPlaceholders})
             AND assignment.status = 'active'
             AND assignment.valid_from <= CURRENT_TIMESTAMP(3)
             AND (assignment.valid_to IS NULL OR assignment.valid_to > CURRENT_TIMESTAMP(3))
         ))
       ORDER BY c.depth, o.organization_code`,
      [
        principal.organization.organizationId,
        principal.organization.organizationId,
        ...principal.cityCodes,
      ],
    );
    return rows.map((row) => ({
      organizationId: row.organization_id,
      organizationCode: row.organization_code,
      name: row.name,
      organizationType: row.organization_type,
      parentOrganizationId: row.parent_organization_id,
      status: row.status,
      version: row.version,
    }));
  }

  async recordAudit(
    context: RequestContext,
    input: {
      organizationId?: string | null;
      cityCode?: string | null;
      permission?: OaPermissionKey | null;
      action: string;
      targetType: string;
      targetId?: string | null;
      decision: "allowed" | "denied";
      reasonCode: string;
      beforeHash?: string | null;
      afterHash?: string | null;
      receiptId?: string | null;
    },
  ): Promise<string> {
    const auditId = randomUUID();
    await getMysqlPool().query(
      `INSERT INTO oa_audit_records (
         audit_id, actor_user_id, actor_membership_id, organization_id, city_code,
         permission_key, action, target_type, target_id, decision, reason_code,
         before_hash, after_hash, trace_id, idempotency_receipt_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        auditId,
        context.userId ?? null,
        context.backoffice?.membershipId ?? null,
        input.organizationId ?? context.backoffice?.organizationId ?? null,
        input.cityCode ?? context.cityCode ?? null,
        input.permission ?? null,
        input.action,
        input.targetType,
        input.targetId ?? null,
        input.decision,
        input.reasonCode,
        input.beforeHash ?? null,
        input.afterHash ?? null,
        context.traceId,
        input.receiptId ?? null,
      ],
    );
    return auditId;
  }
}

export const oaAuthorizationService = new OaAuthorizationService();
