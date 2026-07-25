import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { stableHash } from "@xlb/shared/deterministic/stableHash.js";
import type {
  CityCode,
  ApproveOaDelegationRequest,
  CreateOaDelegationRequest,
  CreateOaMembershipRequest,
  CreateOaOrganizationRequest,
  CreateOaRoleRequest,
  OaDelegationGrant,
  OaMembership,
  OaOrganization,
  OaPermissionKey,
  OaPrincipal,
  OaRole,
  RequestContext,
  RevokeOaDelegationRequest,
  Role,
  UpdateOaMembershipRequest,
  UpdateOaOrganizationRequest,
  UpdateOaRoleRequest,
} from "@xlb/types";
import { getMysqlPool } from "../dal/mysqlPool.js";
import { withTransaction } from "../dal/transaction.js";

export class OaAdministrationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "OaAdministrationError";
  }
}

type OrganizationRow = RowDataPacket & {
  organization_id: string;
  organization_code: string;
  name: string;
  organization_type: "headquarters" | "branch";
  parent_organization_id: string | null;
  status: OaOrganization["status"];
  version: number;
};

type RoleRow = RowDataPacket & {
  role_id: string;
  organization_id: string;
  role_key: string;
  name: string;
  status: OaRole["status"];
  version: number;
};

type MembershipRow = RowDataPacket & {
  membership_id: string;
  admin_user_id: string;
  username: string;
  legacy_role: Role;
  organization_id: string;
  organization_name: string;
  organization_type: OaOrganization["organizationType"];
  status: OaMembership["status"];
  authz_version: number;
};

type DelegationRow = RowDataPacket & {
  grant_id: string;
  grantor_organization_id: string;
  grantee_organization_id: string;
  city_code: CityCode;
  permission_key: OaPermissionKey;
  status: OaDelegationGrant["status"];
  valid_from: Date | string;
  valid_to: Date | string | null;
  version: number;
  granted_by_membership_id: string;
  approved_by_membership_id: string | null;
  reason: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type ReceiptRow = RowDataPacket & {
  receipt_id: string;
  request_fingerprint: string;
  response_json: unknown;
  http_status: number;
};

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseJson<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

function mapOrganization(row: OrganizationRow): OaOrganization {
  return {
    organizationId: row.organization_id,
    organizationCode: row.organization_code,
    name: row.name,
    organizationType: row.organization_type,
    parentOrganizationId: row.parent_organization_id,
    status: row.status,
    version: row.version,
  };
}

function mapDelegation(row: DelegationRow): OaDelegationGrant {
  return {
    grantId: row.grant_id,
    grantorOrganizationId: row.grantor_organization_id,
    granteeOrganizationId: row.grantee_organization_id,
    cityCode: row.city_code,
    permissionKey: row.permission_key,
    status: row.status,
    validFrom: iso(row.valid_from)!,
    validTo: iso(row.valid_to),
    version: row.version,
    grantedByMembershipId: row.granted_by_membership_id,
    approvedByMembershipId: row.approved_by_membership_id,
    reason: row.reason,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

export class OaAdministrationService {
  async listRoles(principal: OaPrincipal, organizationId?: string): Promise<OaRole[]> {
    const targetOrganizationId = organizationId ?? principal.organization.organizationId;
    await this.assertOrganizationVisible(principal, targetOrganizationId, "oa.authorization.read");
    const [rows] = await getMysqlPool().query<RoleRow[]>(
      `SELECT role_id, organization_id, role_key, name, status, version
       FROM oa_roles
       WHERE organization_id = ?
       ORDER BY role_key`,
      [targetOrganizationId],
    );
    return Promise.all(rows.map((row) => this.mapRole(getMysqlPool(), row)));
  }

  async listMemberships(principal: OaPrincipal, organizationId?: string): Promise<OaMembership[]> {
    const targetOrganizationId = organizationId ?? principal.organization.organizationId;
    await this.assertOrganizationVisible(principal, targetOrganizationId, "oa.authorization.read");
    const [rows] = await getMysqlPool().query<MembershipRow[]>(
      `SELECT m.membership_id, m.admin_user_id, au.username, au.role AS legacy_role,
              m.organization_id, o.name AS organization_name,
              o.organization_type, m.status, m.authz_version
       FROM oa_memberships m
       JOIN admin_users au ON au.id = m.admin_user_id
       JOIN oa_organizations o ON o.organization_id = m.organization_id
       WHERE m.organization_id = ?
       ORDER BY au.username, m.membership_id`,
      [targetOrganizationId],
    );
    return Promise.all(rows.map((row) => this.mapMembership(getMysqlPool(), row)));
  }

  async listDelegations(principal: OaPrincipal): Promise<OaDelegationGrant[]> {
    const cityCodes = principal.permissionCityCodes["oa.authorization.read"] ?? [];
    if (cityCodes.length === 0) return [];
    const [rows] = await getMysqlPool().query<DelegationRow[]>(
      `SELECT delegation.*
       FROM oa_delegation_grants delegation
       JOIN oa_organization_closure visible
         ON visible.descendant_organization_id = delegation.grantee_organization_id
        AND visible.ancestor_organization_id = ?
       WHERE (
         delegation.grantor_organization_id = ?
         OR delegation.grantee_organization_id = ?
       )
         AND delegation.city_code IN (${placeholders(cityCodes)})
       ORDER BY delegation.created_at DESC`,
      [
        principal.organization.organizationId,
        principal.organization.organizationId,
        principal.organization.organizationId,
        ...cityCodes,
      ],
    );
    return rows.map(mapDelegation);
  }

  async createOrganization(
    context: RequestContext,
    principal: OaPrincipal,
    input: CreateOaOrganizationRequest,
  ): Promise<{ organization: OaOrganization; idempotentReplay: boolean }> {
    this.assertHeadquarters(principal);
    if (input.parentOrganizationId !== principal.organization.organizationId) {
      throw new OaAdministrationError("Branches must be created directly under the acting headquarters", 403);
    }
    this.assertCities(principal, "oa.organization.manage", input.cityCodes);
    return this.withReceipt(
      principal,
      "oa.organization.create",
      input.idempotencyKey,
      input,
      null,
      async (connection) => {
        await this.assertBranchCitiesAvailable(connection, input.cityCodes);
        const organizationId = `oa_org_${randomUUID()}`;
        await connection.query(
          `INSERT INTO oa_organizations (
             organization_id, organization_code, name, organization_type, parent_organization_id
           ) VALUES (?, ?, ?, 'branch', ?)`,
          [organizationId, input.organizationCode, input.name, input.parentOrganizationId],
        );
        await connection.query(
          `INSERT INTO oa_organization_closure (
             ancestor_organization_id, descendant_organization_id, depth
           )
           SELECT ancestor_organization_id, ?, depth + 1
           FROM oa_organization_closure
           WHERE descendant_organization_id = ?
           UNION ALL SELECT ?, ?, 0`,
          [organizationId, input.parentOrganizationId, organizationId, organizationId],
        );
        for (const cityCode of input.cityCodes) {
          await connection.query(
            `INSERT INTO oa_branch_city_ownership (city_code, organization_id)
             VALUES (?, ?)`,
            [cityCode, organizationId],
          );
          await connection.query(
            `INSERT INTO oa_organization_city_assignments (organization_id, city_code)
             VALUES (?, ?)`,
            [organizationId, cityCode],
          );
        }
        await this.writeEvent(connection, principal, "organization", organizationId, "oa.organization.created", {
          organizationCode: input.organizationCode,
          cityCodes: input.cityCodes,
          reason: input.reason,
        });
        await this.writeAudit(connection, context, principal, {
          permission: "oa.organization.manage",
          action: "oa.organization.create",
          targetType: "oa_organization",
          targetId: organizationId,
          reasonCode: "organization_created",
        });
        return { organization: await this.requireOrganization(connection, organizationId) };
      },
    );
  }

  async updateOrganization(
    context: RequestContext,
    principal: OaPrincipal,
    organizationId: string,
    input: UpdateOaOrganizationRequest,
  ): Promise<{ organization: OaOrganization; idempotentReplay: boolean }> {
    this.assertHeadquarters(principal);
    if (organizationId === principal.organization.organizationId) {
      throw new OaAdministrationError("Headquarters lifecycle cannot be changed through the branch endpoint", 403);
    }
    if (input.cityCodes) this.assertCities(principal, "oa.organization.manage", input.cityCodes);
    return this.withReceipt(
      principal,
      "oa.organization.update",
      input.idempotencyKey,
      { organizationId, ...input },
      null,
      async (connection) => {
        await this.assertOrganizationVisible(
          principal,
          organizationId,
          "oa.organization.manage",
          connection,
        );
        const current = await this.requireOrganization(connection, organizationId, true);
        if (current.organizationType !== "branch") {
          throw new OaAdministrationError("Only branch organizations can be changed", 409);
        }
        const [currentCityRows] = await connection.query<(RowDataPacket & { city_code: CityCode })[]>(
          `SELECT city_code FROM oa_organization_city_assignments
           WHERE organization_id = ? AND status = 'active'
             AND valid_from <= CURRENT_TIMESTAMP(3)
             AND (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP(3))
           ORDER BY city_code`,
          [organizationId],
        );
        const currentCityCodes = currentCityRows.map((row) => row.city_code);
        if (input.cityCodes) {
          await this.assertBranchCitiesAvailable(connection, input.cityCodes, organizationId);
        } else if (input.status === "active") {
          await this.assertBranchCitiesAvailable(connection, currentCityCodes, organizationId);
        }
        const [result] = await connection.query<import("mysql2/promise").ResultSetHeader>(
          `UPDATE oa_organizations
           SET name = COALESCE(?, name),
               status = COALESCE(?, status),
               version = version + 1
           WHERE organization_id = ? AND version = ?`,
          [input.name ?? null, input.status ?? null, organizationId, input.expectedVersion],
        );
        if (result.affectedRows !== 1) {
          throw new OaAdministrationError("Organization version conflict", 409);
        }
        if (input.cityCodes) {
          const cityPlaceholders = placeholders(input.cityCodes);
          await connection.query(
            `UPDATE oa_organization_city_assignments
             SET status = 'revoked', valid_to = CURRENT_TIMESTAMP(3), version = version + 1
             WHERE organization_id = ?
               AND city_code NOT IN (${cityPlaceholders})
               AND status = 'active'`,
            [organizationId, ...input.cityCodes],
          );
          for (const cityCode of input.cityCodes) {
            await connection.query(
              `INSERT INTO oa_organization_city_assignments (
                 organization_id, city_code, status, valid_from, valid_to
               ) VALUES (?, ?, 'active', CURRENT_TIMESTAMP(3), NULL)
               ON DUPLICATE KEY UPDATE
                 status = 'active', valid_from = CURRENT_TIMESTAMP(3),
                 valid_to = NULL, version = version + 1`,
              [organizationId, cityCode],
            );
          }
          await connection.query(
            `UPDATE oa_delegation_grants
             SET status = 'revoked', version = version + 1
             WHERE grantee_organization_id = ?
               AND city_code NOT IN (${placeholders(input.cityCodes)})
               AND status IN ('pending', 'active')`,
            [organizationId, ...input.cityCodes],
          );
        }
        if (input.status && input.status !== "active") {
          await connection.query(
            `UPDATE oa_delegation_grants
             SET status = 'revoked', version = version + 1
             WHERE grantee_organization_id = ?
               AND status IN ('pending', 'active')`,
            [organizationId],
          );
        }
        const nextStatus = input.status ?? current.status;
        const nextCityCodes = input.cityCodes ?? currentCityCodes;
        if (nextStatus === "active") {
          if (nextCityCodes.length === 0) {
            throw new OaAdministrationError("An active branch must own at least one city", 409);
          }
          await connection.query(
            `DELETE FROM oa_branch_city_ownership
             WHERE organization_id = ?
               AND city_code NOT IN (${placeholders(nextCityCodes)})`,
            [organizationId, ...nextCityCodes],
          );
          for (const cityCode of nextCityCodes) {
            await connection.query(
              `INSERT INTO oa_branch_city_ownership (city_code, organization_id)
               SELECT ?, ?
               WHERE NOT EXISTS (
                 SELECT 1 FROM oa_branch_city_ownership
                 WHERE city_code = ? AND organization_id = ?
               )`,
              [cityCode, organizationId, cityCode, organizationId],
            );
          }
        } else {
          await connection.query(
            "DELETE FROM oa_branch_city_ownership WHERE organization_id = ?",
            [organizationId],
          );
        }
        await this.invalidateOrganizationSessions(connection, organizationId);
        await this.writeEvent(connection, principal, "organization", organizationId, "oa.organization.updated", {
          name: input.name ?? null,
          status: input.status ?? null,
          cityCodes: input.cityCodes ?? null,
          reason: input.reason,
        });
        const updated = await this.requireOrganization(connection, organizationId);
        await this.writeAudit(connection, context, principal, {
          permission: "oa.organization.manage",
          action: "oa.organization.update",
          targetType: "oa_organization",
          targetId: organizationId,
          reasonCode: "organization_updated",
          beforeHash: stableHash(current),
          afterHash: stableHash(updated),
        });
        return { organization: updated };
      },
    );
  }

  async createRole(
    context: RequestContext,
    principal: OaPrincipal,
    input: CreateOaRoleRequest,
  ): Promise<{ role: OaRole; idempotentReplay: boolean }> {
    this.assertPermissionSubset(principal, input.permissions);
    return this.withReceipt(
      principal,
      "oa.role.create",
      input.idempotencyKey,
      input,
      null,
      async (connection) => {
        await this.assertOrganizationVisible(
          principal,
          input.organizationId,
          "oa.authorization.manage",
          connection,
        );
        await this.assertPermissionsAssignable(
          connection,
          principal,
          input.permissions,
          input.organizationId,
        );
        const roleId = `oa_role_${randomUUID()}`;
        await connection.query(
          `INSERT INTO oa_roles (role_id, organization_id, role_key, name)
           VALUES (?, ?, ?, ?)`,
          [roleId, input.organizationId, input.roleKey, input.name],
        );
        for (const permission of input.permissions) {
          await connection.query(
            `INSERT INTO oa_role_permissions (role_id, permission_key) VALUES (?, ?)`,
            [roleId, permission],
          );
        }
        await this.writeEvent(connection, principal, "authorization", roleId, "oa.role.created", {
          organizationId: input.organizationId,
          roleKey: input.roleKey,
          permissions: input.permissions,
          reason: input.reason,
        });
        await this.writeAudit(connection, context, principal, {
          permission: "oa.authorization.manage",
          action: "oa.role.create",
          targetType: "oa_role",
          targetId: roleId,
          reasonCode: "role_created",
        });
        return { role: await this.requireRole(connection, roleId) };
      },
    );
  }

  async updateRole(
    context: RequestContext,
    principal: OaPrincipal,
    roleId: string,
    input: UpdateOaRoleRequest,
  ): Promise<{ role: OaRole; idempotentReplay: boolean }> {
    if (input.permissions) this.assertPermissionSubset(principal, input.permissions);
    return this.withReceipt(
      principal,
      "oa.role.update",
      input.idempotencyKey,
      { roleId, ...input },
      null,
      async (connection) => {
        const current = await this.requireRole(connection, roleId, true);
        await this.assertOrganizationVisible(
          principal,
          current.organizationId,
          "oa.authorization.manage",
          connection,
        );
        await this.assertPermissionsAssignable(
          connection,
          principal,
          input.permissions ?? current.permissions,
          current.organizationId,
        );
        const [result] = await connection.query<import("mysql2/promise").ResultSetHeader>(
          `UPDATE oa_roles
           SET name = COALESCE(?, name),
               status = COALESCE(?, status),
               version = version + 1
           WHERE role_id = ? AND version = ?`,
          [input.name ?? null, input.status ?? null, roleId, input.expectedVersion],
        );
        if (result.affectedRows !== 1) throw new OaAdministrationError("Role version conflict", 409);
        if (input.permissions) {
          await connection.query("DELETE FROM oa_role_permissions WHERE role_id = ?", [roleId]);
          for (const permission of input.permissions) {
            await connection.query(
              "INSERT INTO oa_role_permissions (role_id, permission_key) VALUES (?, ?)",
              [roleId, permission],
            );
          }
        }
        await this.invalidateRoleSessions(connection, roleId);
        await this.writeEvent(connection, principal, "authorization", roleId, "oa.role.updated", {
          name: input.name ?? null,
          status: input.status ?? null,
          permissions: input.permissions ?? null,
          reason: input.reason,
        });
        const updated = await this.requireRole(connection, roleId);
        await this.writeAudit(connection, context, principal, {
          permission: "oa.authorization.manage",
          action: "oa.role.update",
          targetType: "oa_role",
          targetId: roleId,
          reasonCode: "role_updated",
          beforeHash: stableHash(current),
          afterHash: stableHash(updated),
        });
        return { role: updated };
      },
    );
  }

  async createMembership(
    context: RequestContext,
    principal: OaPrincipal,
    input: CreateOaMembershipRequest,
  ): Promise<{ membership: OaMembership; idempotentReplay: boolean }> {
    return this.withReceipt(
      principal,
      "oa.membership.create",
      input.idempotencyKey,
      input,
      null,
      async (connection) => {
        await this.assertOrganizationVisible(
          principal,
          input.organizationId,
          "oa.authorization.manage",
          connection,
        );
        await this.assertRolesAssignable(
          connection,
          principal,
          input.roleIds,
          input.organizationId,
        );
        const [adminRows] = await connection.query<RowDataPacket[]>(
          "SELECT 1 FROM admin_users WHERE id = ? LIMIT 1",
          [input.adminUserId],
        );
        if (!adminRows[0]) throw new OaAdministrationError("Active Admin identity not found", 404);
        const membershipId = `oa_member_${randomUUID()}`;
        await connection.query(
          `INSERT INTO oa_memberships (membership_id, admin_user_id, organization_id)
           VALUES (?, ?, ?)`,
          [membershipId, input.adminUserId, input.organizationId],
        );
        for (const roleId of input.roleIds) {
          await connection.query(
            `INSERT INTO oa_membership_roles (
               membership_id, role_id, granted_by_membership_id
             ) VALUES (?, ?, ?)`,
            [membershipId, roleId, principal.membershipId],
          );
        }
        await this.writeEvent(connection, principal, "authorization", membershipId, "oa.membership.created", {
          organizationId: input.organizationId,
          roleIds: input.roleIds,
          reason: input.reason,
        });
        await this.writeAudit(connection, context, principal, {
          permission: "oa.authorization.manage",
          action: "oa.membership.create",
          targetType: "oa_membership",
          targetId: membershipId,
          reasonCode: "membership_created",
        });
        return { membership: await this.requireMembership(connection, membershipId) };
      },
    );
  }

  async updateMembership(
    context: RequestContext,
    principal: OaPrincipal,
    membershipId: string,
    input: UpdateOaMembershipRequest,
  ): Promise<{ membership: OaMembership; idempotentReplay: boolean }> {
    if (membershipId === principal.membershipId) {
      throw new OaAdministrationError("Self authorization changes require another administrator", 403);
    }
    return this.withReceipt(
      principal,
      "oa.membership.update",
      input.idempotencyKey,
      { membershipId, ...input },
      null,
      async (connection) => {
        const current = await this.requireMembership(connection, membershipId, true);
        await this.assertOrganizationVisible(
          principal,
          current.organizationId,
          "oa.authorization.manage",
          connection,
        );
        if (input.roleIds) {
          await this.assertRolesAssignable(
            connection,
            principal,
            input.roleIds,
            current.organizationId,
          );
          await connection.query("DELETE FROM oa_membership_roles WHERE membership_id = ?", [membershipId]);
          for (const roleId of input.roleIds) {
            await connection.query(
              `INSERT INTO oa_membership_roles (
                 membership_id, role_id, granted_by_membership_id
               ) VALUES (?, ?, ?)`,
              [membershipId, roleId, principal.membershipId],
            );
          }
        }
        const [result] = await connection.query<import("mysql2/promise").ResultSetHeader>(
          `UPDATE oa_memberships
           SET status = COALESCE(?, status), authz_version = authz_version + 1
           WHERE membership_id = ? AND authz_version = ?`,
          [input.status ?? null, membershipId, input.expectedAuthzVersion],
        );
        if (result.affectedRows !== 1) throw new OaAdministrationError("Membership version conflict", 409);
        await connection.query(
          `UPDATE oa_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP(3))
           WHERE membership_id = ?`,
          [membershipId],
        );
        await this.writeEvent(connection, principal, "authorization", membershipId, "oa.membership.updated", {
          status: input.status ?? null,
          roleIds: input.roleIds ?? null,
          reason: input.reason,
        });
        const updated = await this.requireMembership(connection, membershipId);
        await this.writeAudit(connection, context, principal, {
          permission: "oa.authorization.manage",
          action: "oa.membership.update",
          targetType: "oa_membership",
          targetId: membershipId,
          reasonCode: "membership_updated",
          beforeHash: stableHash(current),
          afterHash: stableHash(updated),
        });
        return { membership: updated };
      },
    );
  }

  async createDelegation(
    context: RequestContext,
    principal: OaPrincipal,
    input: CreateOaDelegationRequest,
  ): Promise<{ delegation: OaDelegationGrant; idempotentReplay: boolean }> {
    this.assertHeadquarters(principal);
    this.assertCities(principal, "oa.authorization.manage", [input.cityCode]);
    if (!principal.permissions.includes(input.permissionKey)) {
      throw new OaAdministrationError("Cannot delegate a permission outside the acting scope", 403);
    }
    if (input.validTo && new Date(input.validTo).getTime() <= Date.now()) {
      throw new OaAdministrationError("Delegation expiry must be in the future", 400);
    }
    return this.withReceipt(
      principal,
      "oa.delegation.create",
      input.idempotencyKey,
      input,
      input.cityCode,
      async (connection) => {
        const grantee = await this.requireOrganization(connection, input.granteeOrganizationId, true);
        await this.assertOrganizationVisible(
          principal,
          input.granteeOrganizationId,
          "oa.authorization.manage",
          connection,
        );
        if (grantee.organizationType !== "branch") {
          throw new OaAdministrationError("Delegations can only target branch organizations", 409);
        }
        const [cityRows] = await connection.query<RowDataPacket[]>(
          `SELECT 1 FROM oa_organization_city_assignments
           WHERE organization_id = ? AND city_code = ? AND status = 'active'
             AND valid_from <= CURRENT_TIMESTAMP(3)
             AND (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP(3))
           LIMIT 1`,
          [input.granteeOrganizationId, input.cityCode],
        );
        if (!cityRows[0]) throw new OaAdministrationError("Branch is not assigned to the requested city", 409);
        const [existingRows] = await connection.query<RowDataPacket[]>(
          `SELECT 1 FROM oa_delegation_grants
           WHERE grantor_organization_id = ?
             AND grantee_organization_id = ?
             AND city_code = ?
             AND permission_key = ?
             AND status IN ('pending', 'active')
             AND (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP(3))
           LIMIT 1 FOR UPDATE`,
          [
            principal.organization.organizationId,
            input.granteeOrganizationId,
            input.cityCode,
            input.permissionKey,
          ],
        );
        if (existingRows[0]) {
          throw new OaAdministrationError(
            "An effective or pending delegation already exists for this branch, city, and permission",
            409,
          );
        }
        const grantId = `oa_grant_${randomUUID()}`;
        await connection.query(
          `INSERT INTO oa_delegation_grants (
             grant_id, grantor_organization_id, grantee_organization_id, city_code,
             permission_key, status, valid_to, granted_by_membership_id,
             approved_by_membership_id, reason, idempotency_key_hash, request_fingerprint
           ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NULL, ?, ?, ?)`,
          [
            grantId,
            principal.organization.organizationId,
            input.granteeOrganizationId,
            input.cityCode,
            input.permissionKey,
            input.validTo ?? null,
            principal.membershipId,
            input.reason,
            stableHash(input.idempotencyKey),
            stableHash(input),
          ],
        );
        await this.writeEvent(connection, principal, "authorization", grantId, "oa.delegation.requested", {
          granteeOrganizationId: input.granteeOrganizationId,
          cityCode: input.cityCode,
          permissionKey: input.permissionKey,
          validTo: input.validTo ?? null,
          reason: input.reason,
        }, input.cityCode);
        await this.writeAudit(connection, context, principal, {
          permission: "oa.authorization.manage",
          action: "oa.delegation.create",
          targetType: "oa_delegation",
          targetId: grantId,
          reasonCode: "delegation_requested",
          cityCode: input.cityCode,
        });
        return { delegation: await this.requireDelegation(connection, grantId) };
      },
    );
  }

  async approveDelegation(
    context: RequestContext,
    principal: OaPrincipal,
    grantId: string,
    input: ApproveOaDelegationRequest,
  ): Promise<{ delegation: OaDelegationGrant; idempotentReplay: boolean }> {
    this.assertHeadquarters(principal);
    return this.withReceipt(
      principal,
      "oa.delegation.approve",
      input.idempotencyKey,
      { grantId, ...input },
      null,
      async (connection) => {
        const current = await this.requireDelegation(connection, grantId, true);
        if (current.grantorOrganizationId !== principal.organization.organizationId) {
          throw new OaAdministrationError("Delegation is outside the acting headquarters", 403);
        }
        if (current.grantedByMembershipId === principal.membershipId) {
          throw new OaAdministrationError("Delegation requester cannot approve the same grant", 403);
        }
        this.assertCities(principal, "oa.authorization.manage", [current.cityCode]);
        if (!principal.permissions.includes(current.permissionKey)) {
          throw new OaAdministrationError("Cannot approve a permission outside the acting scope", 403);
        }
        const [result] = await connection.query<import("mysql2/promise").ResultSetHeader>(
          `UPDATE oa_delegation_grants
           SET status = 'active', approved_by_membership_id = ?, version = version + 1
           WHERE grant_id = ? AND version = ? AND status = 'pending'
             AND (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP(3))`,
          [principal.membershipId, grantId, input.expectedVersion],
        );
        if (result.affectedRows !== 1) throw new OaAdministrationError("Delegation approval conflict", 409);
        await this.invalidateOrganizationSessions(connection, current.granteeOrganizationId);
        await this.writeEvent(connection, principal, "authorization", grantId, "oa.delegation.activated", {
          reason: input.reason,
        }, current.cityCode);
        await this.writeAudit(connection, context, principal, {
          permission: "oa.authorization.manage",
          action: "oa.delegation.approve",
          targetType: "oa_delegation",
          targetId: grantId,
          reasonCode: "delegation_activated",
          cityCode: current.cityCode,
        });
        return { delegation: await this.requireDelegation(connection, grantId) };
      },
    );
  }

  async revokeDelegation(
    context: RequestContext,
    principal: OaPrincipal,
    grantId: string,
    input: RevokeOaDelegationRequest,
  ): Promise<{ delegation: OaDelegationGrant; idempotentReplay: boolean }> {
    this.assertHeadquarters(principal);
    return this.withReceipt(
      principal,
      "oa.delegation.revoke",
      input.idempotencyKey,
      { grantId, ...input },
      null,
      async (connection) => {
        const current = await this.requireDelegation(connection, grantId, true);
        if (current.grantorOrganizationId !== principal.organization.organizationId) {
          throw new OaAdministrationError("Delegation is outside the acting headquarters", 403);
        }
        this.assertCities(principal, "oa.authorization.manage", [current.cityCode]);
        const [result] = await connection.query<import("mysql2/promise").ResultSetHeader>(
          `UPDATE oa_delegation_grants
           SET status = 'revoked', version = version + 1
           WHERE grant_id = ? AND version = ? AND status = 'active'`,
          [grantId, input.expectedVersion],
        );
        if (result.affectedRows !== 1) throw new OaAdministrationError("Delegation version conflict", 409);
        await this.invalidateOrganizationSessions(connection, current.granteeOrganizationId);
        await this.writeEvent(connection, principal, "authorization", grantId, "oa.delegation.revoked", {
          reason: input.reason,
        }, current.cityCode);
        await this.writeAudit(connection, context, principal, {
          permission: "oa.authorization.manage",
          action: "oa.delegation.revoke",
          targetType: "oa_delegation",
          targetId: grantId,
          reasonCode: "delegation_revoked",
          cityCode: current.cityCode,
        });
        return { delegation: await this.requireDelegation(connection, grantId) };
      },
    );
  }

  private assertHeadquarters(principal: OaPrincipal): void {
    if (principal.organization.organizationType !== "headquarters") {
      throw new OaAdministrationError("Headquarters authorization is required", 403);
    }
  }

  private assertCities(
    principal: OaPrincipal,
    permission: OaPermissionKey,
    cityCodes: readonly CityCode[],
  ): void {
    const allowed = principal.permissionCityCodes[permission] ?? [];
    if (cityCodes.some((cityCode) => !allowed.includes(cityCode))) {
      throw new OaAdministrationError("City is outside the effective permission scope", 403);
    }
  }

  private assertPermissionSubset(principal: OaPrincipal, permissions: readonly OaPermissionKey[]): void {
    if (permissions.some((permission) => !principal.permissions.includes(permission))) {
      throw new OaAdministrationError("Role contains a permission outside the acting scope", 403);
    }
  }

  private async assertOrganizationVisible(
    principal: OaPrincipal,
    organizationId: string,
    permission: OaPermissionKey,
    connection: PoolConnection | ReturnType<typeof getMysqlPool> = getMysqlPool(),
  ): Promise<void> {
    const allowedCities = principal.permissionCityCodes[permission] ?? [];
    if (allowedCities.length === 0) {
      throw new OaAdministrationError("Organization is outside the acting city scope", 403);
    }
    const allowedPlaceholders = placeholders(allowedCities);
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT 1
       FROM oa_organization_closure closure
       WHERE closure.ancestor_organization_id = ?
         AND closure.descendant_organization_id = ?
         AND EXISTS (
           SELECT 1
           FROM oa_organization_closure target_scope
           JOIN oa_organization_city_assignments assignment
             ON assignment.organization_id = target_scope.descendant_organization_id
           WHERE target_scope.ancestor_organization_id = closure.descendant_organization_id
             AND assignment.status = 'active'
             AND assignment.valid_from <= CURRENT_TIMESTAMP(3)
             AND (assignment.valid_to IS NULL OR assignment.valid_to > CURRENT_TIMESTAMP(3))
             AND assignment.city_code IN (${allowedPlaceholders})
         )
         AND NOT EXISTS (
           SELECT 1
           FROM oa_organization_closure target_scope
           JOIN oa_organization_city_assignments assignment
             ON assignment.organization_id = target_scope.descendant_organization_id
           WHERE target_scope.ancestor_organization_id = closure.descendant_organization_id
             AND assignment.status = 'active'
             AND assignment.valid_from <= CURRENT_TIMESTAMP(3)
             AND (assignment.valid_to IS NULL OR assignment.valid_to > CURRENT_TIMESTAMP(3))
             AND assignment.city_code NOT IN (${allowedPlaceholders})
         )
       LIMIT 1`,
      [
        principal.organization.organizationId,
        organizationId,
        ...allowedCities,
        ...allowedCities,
      ],
    );
    if (!rows[0]) throw new OaAdministrationError("Organization is outside the acting hierarchy", 403);
  }

  private async assertRolesAssignable(
    connection: PoolConnection,
    principal: OaPrincipal,
    roleIds: readonly string[],
    organizationId: string,
  ): Promise<void> {
    const [rows] = await connection.query<(RowDataPacket & {
      role_id: string;
      permission_key: OaPermissionKey;
    })[]>(
      `SELECT role.role_id, permission.permission_key
       FROM oa_roles role
       JOIN oa_role_permissions permission ON permission.role_id = role.role_id
       WHERE role.organization_id = ? AND role.status = 'active'
         AND role.role_id IN (${placeholders(roleIds)})`,
      [organizationId, ...roleIds],
    );
    if (new Set(rows.map((row) => row.role_id)).size !== roleIds.length) {
      throw new OaAdministrationError("Every membership role must be active and belong to the organization", 409);
    }
    await this.assertPermissionsAssignable(
      connection,
      principal,
      [...new Set(rows.map((row) => row.permission_key))],
      organizationId,
    );
  }

  private async assertPermissionsAssignable(
    connection: PoolConnection,
    principal: OaPrincipal,
    permissions: readonly OaPermissionKey[],
    organizationId: string,
  ): Promise<void> {
    this.assertPermissionSubset(principal, permissions);
    const [cityRows] = await connection.query<(RowDataPacket & { city_code: CityCode })[]>(
      `SELECT DISTINCT assignment.city_code
       FROM oa_organization_closure target_scope
       JOIN oa_organization_city_assignments assignment
         ON assignment.organization_id = target_scope.descendant_organization_id
       WHERE target_scope.ancestor_organization_id = ?
         AND assignment.status = 'active'
         AND assignment.valid_from <= CURRENT_TIMESTAMP(3)
         AND (assignment.valid_to IS NULL OR assignment.valid_to > CURRENT_TIMESTAMP(3))`,
      [organizationId],
    );
    const targetCities = cityRows.map((row) => row.city_code);
    const missingScope = permissions.find((permission) => {
      const allowed = principal.permissionCityCodes[permission] ?? [];
      return targetCities.some((cityCode) => !allowed.includes(cityCode));
    });
    if (missingScope) {
      throw new OaAdministrationError(
        `Permission ${missingScope} is outside the acting city scope for this organization`,
        403,
      );
    }
  }

  private async assertBranchCitiesAvailable(
    connection: PoolConnection,
    cityCodes: readonly CityCode[],
    excludedOrganizationId?: string,
  ): Promise<void> {
    if (cityCodes.length === 0) {
      throw new OaAdministrationError("An active branch must own at least one city", 409);
    }
    const [rows] = await connection.query<(RowDataPacket & {
      city_code: CityCode;
      organization_id: string;
    })[]>(
      `SELECT ownership.city_code, ownership.organization_id
       FROM oa_branch_city_ownership ownership
       WHERE ownership.city_code IN (${placeholders(cityCodes)})
         ${excludedOrganizationId ? "AND ownership.organization_id <> ?" : ""}
       LIMIT 1`,
      excludedOrganizationId ? [...cityCodes, excludedOrganizationId] : [...cityCodes],
    );
    if (rows[0]) {
      throw new OaAdministrationError(
        `City ${rows[0].city_code} is already owned by another active branch`,
        409,
      );
    }
  }

  private async mapRole(
    connection: PoolConnection | ReturnType<typeof getMysqlPool>,
    row: RoleRow,
  ): Promise<OaRole> {
    const [permissions] = await connection.query<(RowDataPacket & { permission_key: OaPermissionKey })[]>(
      "SELECT permission_key FROM oa_role_permissions WHERE role_id = ? ORDER BY permission_key",
      [row.role_id],
    );
    return {
      roleId: row.role_id,
      organizationId: row.organization_id,
      roleKey: row.role_key,
      name: row.name,
      status: row.status,
      version: row.version,
      permissions: permissions.map((item) => item.permission_key),
    };
  }

  private async mapMembership(
    connection: PoolConnection | ReturnType<typeof getMysqlPool>,
    row: MembershipRow,
  ): Promise<OaMembership> {
    const [roleRows] = await connection.query<RoleRow[]>(
      `SELECT role.role_id, role.organization_id, role.role_key, role.name, role.status, role.version
       FROM oa_membership_roles membership_role
       JOIN oa_roles role ON role.role_id = membership_role.role_id
       WHERE membership_role.membership_id = ?
         AND membership_role.valid_from <= CURRENT_TIMESTAMP(3)
         AND (membership_role.valid_to IS NULL OR membership_role.valid_to > CURRENT_TIMESTAMP(3))
       ORDER BY role.role_key`,
      [row.membership_id],
    );
    return {
      membershipId: row.membership_id,
      userId: row.admin_user_id,
      username: row.username,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      organizationType: row.organization_type,
      status: row.status,
      authzVersion: row.authz_version,
      legacyRole: row.legacy_role,
      roles: await Promise.all(roleRows.map((role) => this.mapRole(connection, role))),
    };
  }

  private async requireOrganization(
    connection: PoolConnection,
    organizationId: string,
    forUpdate = false,
  ): Promise<OaOrganization> {
    const [rows] = await connection.query<OrganizationRow[]>(
      `SELECT organization_id, organization_code, name, organization_type,
              parent_organization_id, status, version
       FROM oa_organizations WHERE organization_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
      [organizationId],
    );
    if (!rows[0]) throw new OaAdministrationError("Organization not found", 404);
    return mapOrganization(rows[0]);
  }

  private async requireRole(
    connection: PoolConnection,
    roleId: string,
    forUpdate = false,
  ): Promise<OaRole> {
    const [rows] = await connection.query<RoleRow[]>(
      `SELECT role_id, organization_id, role_key, name, status, version
       FROM oa_roles WHERE role_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
      [roleId],
    );
    if (!rows[0]) throw new OaAdministrationError("Role not found", 404);
    return this.mapRole(connection, rows[0]);
  }

  private async requireMembership(
    connection: PoolConnection,
    membershipId: string,
    forUpdate = false,
  ): Promise<OaMembership> {
    const [rows] = await connection.query<MembershipRow[]>(
      `SELECT m.membership_id, m.admin_user_id, au.username, au.role AS legacy_role,
              m.organization_id, o.name AS organization_name,
              o.organization_type, m.status, m.authz_version
       FROM oa_memberships m
       JOIN admin_users au ON au.id = m.admin_user_id
       JOIN oa_organizations o ON o.organization_id = m.organization_id
       WHERE m.membership_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
      [membershipId],
    );
    if (!rows[0]) throw new OaAdministrationError("Membership not found", 404);
    return this.mapMembership(connection, rows[0]);
  }

  private async requireDelegation(
    connection: PoolConnection,
    grantId: string,
    forUpdate = false,
  ): Promise<OaDelegationGrant> {
    const [rows] = await connection.query<DelegationRow[]>(
      `SELECT * FROM oa_delegation_grants WHERE grant_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
      [grantId],
    );
    if (!rows[0]) throw new OaAdministrationError("Delegation not found", 404);
    return mapDelegation(rows[0]);
  }

  private async invalidateRoleSessions(connection: PoolConnection, roleId: string): Promise<void> {
    await connection.query(
      `UPDATE oa_memberships membership
       JOIN oa_membership_roles membership_role
         ON membership_role.membership_id = membership.membership_id
       SET membership.authz_version = membership.authz_version + 1
       WHERE membership_role.role_id = ?`,
      [roleId],
    );
    await connection.query(
      `UPDATE oa_sessions session
       JOIN oa_membership_roles membership_role
         ON membership_role.membership_id = session.membership_id
       SET session.revoked_at = COALESCE(session.revoked_at, CURRENT_TIMESTAMP(3))
       WHERE membership_role.role_id = ?`,
      [roleId],
    );
  }

  private async invalidateOrganizationSessions(
    connection: PoolConnection,
    organizationId: string,
  ): Promise<void> {
    await connection.query(
      `UPDATE oa_memberships SET authz_version = authz_version + 1
       WHERE organization_id = ?`,
      [organizationId],
    );
    await connection.query(
      `UPDATE oa_sessions session
       JOIN oa_memberships membership ON membership.membership_id = session.membership_id
       SET session.revoked_at = COALESCE(session.revoked_at, CURRENT_TIMESTAMP(3))
       WHERE membership.organization_id = ?`,
      [organizationId],
    );
  }

  private async withReceipt<T extends object>(
    principal: OaPrincipal,
    operation: string,
    idempotencyKey: string,
    fingerprintInput: unknown,
    cityCode: CityCode | null,
    mutation: (connection: PoolConnection) => Promise<T>,
  ): Promise<T & { idempotentReplay: boolean }> {
    const fingerprint = stableHash(fingerprintInput);
    const receiptId = `oa_receipt_${randomUUID()}`;
    return withTransaction(async (connection) => {
      await connection.query(
        `INSERT IGNORE INTO oa_mutation_receipts (
           receipt_id, membership_id, organization_id, city_code, operation,
           idempotency_key_hash, request_fingerprint, response_json, http_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, JSON_OBJECT(), 0)`,
        [
          receiptId,
          principal.membershipId,
          principal.organization.organizationId,
          cityCode,
          operation,
          stableHash(idempotencyKey),
          fingerprint,
        ],
      );
      const [rows] = await connection.query<ReceiptRow[]>(
        `SELECT receipt_id, request_fingerprint, response_json, http_status
         FROM oa_mutation_receipts
         WHERE membership_id = ? AND operation = ? AND idempotency_key_hash = ?
         FOR UPDATE`,
        [principal.membershipId, operation, stableHash(idempotencyKey)],
      );
      const receipt = rows[0];
      if (!receipt) throw new OaAdministrationError("Idempotency receipt could not be created", 500);
      if (receipt.request_fingerprint !== fingerprint) {
        throw new OaAdministrationError("Idempotency key was already used with another request", 409);
      }
      if (receipt.http_status !== 0) {
        return { ...parseJson<T>(receipt.response_json), idempotentReplay: true };
      }
      const result = await mutation(connection);
      await connection.query(
        "UPDATE oa_mutation_receipts SET response_json = ?, http_status = 200 WHERE receipt_id = ?",
        [JSON.stringify(result), receipt.receipt_id],
      );
      return { ...result, idempotentReplay: false };
    }).catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "ER_DUP_ENTRY"
      ) {
        throw new OaAdministrationError("The requested OA record already exists", 409);
      }
      throw error;
    });
  }

  private async writeEvent(
    connection: PoolConnection,
    principal: OaPrincipal,
    aggregateType: "organization" | "authorization",
    aggregateId: string,
    eventType: string,
    detail: Record<string, unknown>,
    cityCode: CityCode | null = null,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO oa_process_events (
         event_id, organization_id, city_code, aggregate_type, aggregate_id,
         event_type, actor_membership_id, detail_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `oa_event_${randomUUID()}`,
        principal.organization.organizationId,
        cityCode,
        aggregateType,
        aggregateId,
        eventType,
        principal.membershipId,
        JSON.stringify(detail),
      ],
    );
  }

  private async writeAudit(
    connection: PoolConnection,
    context: RequestContext,
    principal: OaPrincipal,
    input: {
      permission: OaPermissionKey;
      action: string;
      targetType: string;
      targetId: string;
      reasonCode: string;
      cityCode?: CityCode;
      beforeHash?: string;
      afterHash?: string;
    },
  ): Promise<void> {
    await connection.query(
      `INSERT INTO oa_audit_records (
         audit_id, actor_user_id, actor_membership_id, organization_id, city_code,
         permission_key, action, target_type, target_id, decision, reason_code,
         before_hash, after_hash, trace_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'allowed', ?, ?, ?, ?)`,
      [
        `oa_audit_${randomUUID()}`,
        principal.userId,
        principal.membershipId,
        principal.organization.organizationId,
        input.cityCode ?? null,
        input.permission,
        input.action,
        input.targetType,
        input.targetId,
        input.reasonCode,
        input.beforeHash ?? null,
        input.afterHash ?? null,
        context.traceId,
      ],
    );
  }
}

export const oaAdministrationService = new OaAdministrationService();
