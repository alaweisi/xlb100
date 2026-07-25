import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { loadEnv } from "@xlb/config";
import type { OaOrganizationType, Role } from "@xlb/types";
import { getMysqlPool } from "../dal/mysqlPool.js";
import { createOaToken } from "../auth/tokenAuth.js";

export interface OaLoginProfile {
  userId: string;
  username: string;
  legacyRole: Role;
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationType: OaOrganizationType;
  authzVersion: number;
}

export interface OaLoginSession extends OaLoginProfile {
  token: string;
  sessionId: string;
  expiresAt: string;
}

export class OaIdentityError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "OaIdentityError";
  }
}

export class OaIdentityService {
  async findLoginProfile(username: string): Promise<OaLoginProfile | null> {
    const [rows] = await getMysqlPool().query<(RowDataPacket & {
      user_id: string;
      username: string;
      legacy_role: Role;
      membership_id: string;
      organization_id: string;
      organization_name: string;
      organization_type: OaOrganizationType;
      authz_version: number;
    })[]>(
      `SELECT au.id AS user_id, au.username, au.role AS legacy_role,
              m.membership_id, m.organization_id, m.authz_version,
              o.name AS organization_name, o.organization_type
       FROM admin_users au
       JOIN oa_memberships m ON m.admin_user_id = au.id
       JOIN oa_organizations o ON o.organization_id = m.organization_id
       WHERE au.username = ?
         AND m.status = 'active'
         AND o.status = 'active'
         AND m.valid_from <= CURRENT_TIMESTAMP(3)
         AND (m.valid_to IS NULL OR m.valid_to > CURRENT_TIMESTAMP(3))
       ORDER BY CASE o.organization_type WHEN 'headquarters' THEN 0 ELSE 1 END,
                m.created_at
       LIMIT 1`,
      [username],
    );
    const row = rows[0];
    return row ? {
      userId: row.user_id,
      username: row.username,
      legacyRole: row.legacy_role,
      membershipId: row.membership_id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      organizationType: row.organization_type,
      authzVersion: row.authz_version,
    } : null;
  }

  async createSession(profile: OaLoginProfile, deviceSummary?: string): Promise<OaLoginSession> {
    const env = loadEnv();
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + env.jwtTtlSeconds * 1_000);
    const { token, jti } = createOaToken(profile.userId, profile.legacyRole, {
      sessionId,
      membershipId: profile.membershipId,
      organizationId: profile.organizationId,
      authzVersion: profile.authzVersion,
    });
    await getMysqlPool().query(
      `INSERT INTO oa_sessions (
         session_id, membership_id, token_jti, authz_version, device_summary, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        profile.membershipId,
        jti,
        profile.authzVersion,
        deviceSummary?.slice(0, 255) || null,
        expiresAt,
      ],
    );
    return {
      ...profile,
      token,
      sessionId,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async findActiveSessionProfile(
    sessionId: string,
    membershipId: string,
  ): Promise<OaLoginProfile | null> {
    const [rows] = await getMysqlPool().query<(RowDataPacket & {
      user_id: string;
      username: string;
      legacy_role: Role;
      membership_id: string;
      organization_id: string;
      organization_name: string;
      organization_type: OaOrganizationType;
      authz_version: number;
    })[]>(
      `SELECT au.id AS user_id, au.username, au.role AS legacy_role,
              m.membership_id, m.organization_id, m.authz_version,
              o.name AS organization_name, o.organization_type
       FROM oa_sessions s
       JOIN oa_memberships m ON m.membership_id = s.membership_id
       JOIN admin_users au ON au.id = m.admin_user_id
       JOIN oa_organizations o ON o.organization_id = m.organization_id
       WHERE s.session_id = ?
         AND s.membership_id = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > CURRENT_TIMESTAMP(3)
         AND s.authz_version = m.authz_version
         AND m.status = 'active'
         AND o.status = 'active'
         AND m.valid_from <= CURRENT_TIMESTAMP(3)
         AND (m.valid_to IS NULL OR m.valid_to > CURRENT_TIMESTAMP(3))
       LIMIT 1`,
      [sessionId, membershipId],
    );
    const row = rows[0];
    return row ? {
      userId: row.user_id,
      username: row.username,
      legacyRole: row.legacy_role,
      membershipId: row.membership_id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      organizationType: row.organization_type,
      authzVersion: row.authz_version,
    } : null;
  }

  async revokeSession(sessionId: string, membershipId: string): Promise<void> {
    await getMysqlPool().query(
      `UPDATE oa_sessions
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP(3))
       WHERE session_id = ? AND membership_id = ?`,
      [sessionId, membershipId],
    );
  }
}

export const oaIdentityService = new OaIdentityService();
