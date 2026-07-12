import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  CityCode, SupportAgent, SupportAgentSkillGroupMembership, SupportSkillGroup,
  SupportTicketType,
} from "@xlb/types";
import { RepositoryBase } from "../../dal/repositoryBase.js";

export type SupportAgentLifecycleStatus = "active" | "suspended";
export type SupportAgentWorkStatus = "offline" | "online" | "busy";

export type SupportAgentProfile = SupportAgent;

type AgentRow = RowDataPacket & {
  agent_id: string; city_code: string; admin_user_id: string; display_name: string;
  lifecycle_status: SupportAgentLifecycleStatus; work_status: SupportAgentWorkStatus;
  create_idempotency_key: string; create_fingerprint: string; last_mutation_idempotency_key: string | null; last_mutation_fingerprint: string | null;
  version: number | string; created_at: Date; updated_at: Date;
};
type GroupRow = RowDataPacket & {
  skill_group_id: string; city_code: string; name: string;
  matched_types_json: string | SupportTicketType[]; matched_languages_json: string | string[];
  priority_weight: number | string; is_default: number | boolean; is_active: number | boolean;
  create_idempotency_key: string; create_fingerprint: string; last_mutation_idempotency_key: string | null; last_mutation_fingerprint: string | null;
  version: number | string; created_at: Date; updated_at: Date;
};
type MembershipRow = RowDataPacket & {
  city_code: string; agent_id: string; skill_group_id: string;
  proficiency: number | string; is_primary: number | boolean; is_active: number | boolean;
  last_idempotency_key: string; last_mutation_fingerprint: string; created_at: Date; updated_at: Date;
};

const AGENT_COLUMNS = "agent_id,city_code,admin_user_id,display_name,lifecycle_status,work_status,create_idempotency_key,create_fingerprint,last_mutation_idempotency_key,last_mutation_fingerprint,version,created_at,updated_at";
const GROUP_COLUMNS = "skill_group_id,city_code,name,matched_types_json,matched_languages_json,priority_weight,is_default,is_active,create_idempotency_key,create_fingerprint,last_mutation_idempotency_key,last_mutation_fingerprint,version,created_at,updated_at";

function parseJsonArray<T>(value: string | T[]): T[] {
  return Array.isArray(value) ? value : JSON.parse(value) as T[];
}

function mapAgent(row: AgentRow): SupportAgentProfile {
  return {
    agentId: row.agent_id, cityCode: row.city_code, adminUserId: row.admin_user_id,
    displayName: row.display_name, lifecycleStatus: row.lifecycle_status, workStatus: row.work_status,
    version: Number(row.version), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

function mapGroup(row: GroupRow): SupportSkillGroup {
  return {
    skillGroupId: row.skill_group_id, cityCode: row.city_code, name: row.name,
    matchedTypes: parseJsonArray<SupportTicketType>(row.matched_types_json),
    matchedLanguages: parseJsonArray<string>(row.matched_languages_json),
    priorityWeight: Number(row.priority_weight), isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active), version: Number(row.version),
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

function mapMembership(row: MembershipRow): SupportAgentSkillGroupMembership {
  return {
    cityCode: row.city_code, agentId: row.agent_id, skillGroupId: row.skill_group_id,
    proficiency: Number(row.proficiency), isPrimary: Boolean(row.is_primary),
    isActive: Boolean(row.is_active), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

export class SupportAgentRepository extends RepositoryBase {
  constructor(pool?: Pool) { super(pool); }

  async loadAdminRoleAndExplicitScope(connection: PoolConnection, cityCode: CityCode, adminUserId: string): Promise<{ role: string } | null> {
    const [rows] = await connection.query<(RowDataPacket & { role: string })[]>(
      `SELECT au.role FROM admin_users au
       INNER JOIN admin_city_scopes acs ON acs.admin_user_id=au.id AND acs.city_code=?
       WHERE au.id=? LIMIT 1`,
      [cityCode, adminUserId],
    );
    return rows[0] ? { role: rows[0].role } : null;
  }

  async listAgents(connection: PoolConnection, cityCode: CityCode, filters: {
    adminUserId?: string; lifecycleStatus?: string; workStatus?: string;
    cursor?: { createdAt: string; id: string }; limit: number;
  }): Promise<SupportAgentProfile[]> {
    const clauses = ["city_code=?"];
    const params: unknown[] = [cityCode];
    if (filters.adminUserId) { clauses.push("admin_user_id=?"); params.push(filters.adminUserId); }
    if (filters.lifecycleStatus) { clauses.push("lifecycle_status=?"); params.push(filters.lifecycleStatus); }
    if (filters.workStatus) { clauses.push("work_status=?"); params.push(filters.workStatus); }
    if (filters.cursor) {
      clauses.push("(created_at<? OR (created_at=? AND agent_id<?))");
      params.push(filters.cursor.createdAt, filters.cursor.createdAt, filters.cursor.id);
    }
    params.push(filters.limit);
    const [rows] = await connection.query<AgentRow[]>(
      `SELECT ${AGENT_COLUMNS} FROM support_agents WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC,agent_id DESC LIMIT ?`, params,
    );
    return rows.map(mapAgent);
  }

  async findAgent(connection: PoolConnection, cityCode: CityCode, agentId: string, forUpdate = false): Promise<SupportAgentProfile | null> {
    const [rows] = await connection.query<AgentRow[]>(
      `SELECT ${AGENT_COLUMNS} FROM support_agents WHERE city_code=? AND agent_id=? LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
      [cityCode, agentId],
    );
    return rows[0] ? mapAgent(rows[0]) : null;
  }

  async findAgentByAdminUser(connection: PoolConnection, cityCode: CityCode, adminUserId: string): Promise<SupportAgentProfile | null> {
    const [rows] = await connection.query<AgentRow[]>(
      `SELECT ${AGENT_COLUMNS} FROM support_agents WHERE city_code=? AND admin_user_id=? LIMIT 1`,
      [cityCode, adminUserId],
    );
    return rows[0] ? mapAgent(rows[0]) : null;
  }

  async findAgentByCreateKey(connection: PoolConnection, cityCode: CityCode, idempotencyKey: string): Promise<{ agent: SupportAgent; fingerprint: string } | null> {
    const [rows] = await connection.query<AgentRow[]>(
      `SELECT ${AGENT_COLUMNS} FROM support_agents WHERE city_code=? AND create_idempotency_key=? LIMIT 1 FOR UPDATE`,
      [cityCode, idempotencyKey],
    );
    return rows[0] ? { agent: mapAgent(rows[0]), fingerprint: rows[0].create_fingerprint } : null;
  }

  async loadAgentMutationState(connection: PoolConnection, cityCode: CityCode, agentId: string): Promise<{ agent: SupportAgent; lastIdempotencyKey: string | null; lastFingerprint: string | null } | null> {
    const [rows] = await connection.query<AgentRow[]>(
      `SELECT ${AGENT_COLUMNS} FROM support_agents WHERE city_code=? AND agent_id=? LIMIT 1 FOR UPDATE`, [cityCode, agentId],
    );
    return rows[0] ? { agent: mapAgent(rows[0]), lastIdempotencyKey: rows[0].last_mutation_idempotency_key, lastFingerprint: rows[0].last_mutation_fingerprint } : null;
  }

  async insertAgent(connection: PoolConnection, input: {
    agentId: string; cityCode: CityCode; adminUserId: string; displayName: string;
    lifecycleStatus: SupportAgentLifecycleStatus; workStatus: SupportAgentWorkStatus; idempotencyKey: string; fingerprint: string;
  }): Promise<void> {
    await connection.query(
      `INSERT INTO support_agents
       (agent_id,city_code,admin_user_id,display_name,lifecycle_status,work_status,create_idempotency_key,create_fingerprint)
       VALUES (?,?,?,?,?,?,?,?)`,
      [input.agentId, input.cityCode, input.adminUserId, input.displayName, input.lifecycleStatus, input.workStatus, input.idempotencyKey, input.fingerprint],
    );
  }

  async updateAgentCas(connection: PoolConnection, input: {
    cityCode: CityCode; agentId: string; displayName: string;
    lifecycleStatus: SupportAgentLifecycleStatus; workStatus: SupportAgentWorkStatus; expectedVersion: number; idempotencyKey: string; fingerprint: string;
  }): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE support_agents SET display_name=?,lifecycle_status=?,work_status=?,last_mutation_idempotency_key=?,last_mutation_fingerprint=?,version=version+1
       WHERE city_code=? AND agent_id=? AND version=?`,
      [input.displayName, input.lifecycleStatus, input.workStatus, input.idempotencyKey, input.fingerprint, input.cityCode, input.agentId, input.expectedVersion],
    );
    return result.affectedRows === 1;
  }

  async listSkillGroups(connection: PoolConnection, cityCode: CityCode, filters: {
    isActive?: boolean; isDefault?: boolean; cursor?: { createdAt: string; id: string }; limit: number;
  }): Promise<SupportSkillGroup[]> {
    const clauses = ["city_code=?"];
    const params: unknown[] = [cityCode];
    if (filters.isActive !== undefined) { clauses.push("is_active=?"); params.push(filters.isActive); }
    if (filters.isDefault !== undefined) { clauses.push("is_default=?"); params.push(filters.isDefault); }
    if (filters.cursor) {
      clauses.push("(created_at<? OR (created_at=? AND skill_group_id<?))");
      params.push(filters.cursor.createdAt, filters.cursor.createdAt, filters.cursor.id);
    }
    params.push(filters.limit);
    const [rows] = await connection.query<GroupRow[]>(
      `SELECT ${GROUP_COLUMNS} FROM support_skill_groups WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC,skill_group_id DESC LIMIT ?`, params,
    );
    return rows.map(mapGroup);
  }

  async findSkillGroup(connection: PoolConnection, cityCode: CityCode, skillGroupId: string, forUpdate = false): Promise<SupportSkillGroup | null> {
    const [rows] = await connection.query<GroupRow[]>(
      `SELECT ${GROUP_COLUMNS} FROM support_skill_groups WHERE city_code=? AND skill_group_id=? LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
      [cityCode, skillGroupId],
    );
    return rows[0] ? mapGroup(rows[0]) : null;
  }

  async findSkillGroupByCreateKey(connection: PoolConnection, cityCode: CityCode, idempotencyKey: string): Promise<{ skillGroup: SupportSkillGroup; fingerprint: string } | null> {
    const [rows] = await connection.query<GroupRow[]>(
      `SELECT ${GROUP_COLUMNS} FROM support_skill_groups WHERE city_code=? AND create_idempotency_key=? LIMIT 1 FOR UPDATE`,
      [cityCode, idempotencyKey],
    );
    return rows[0] ? { skillGroup: mapGroup(rows[0]), fingerprint: rows[0].create_fingerprint } : null;
  }

  async loadSkillGroupMutationState(connection: PoolConnection, cityCode: CityCode, skillGroupId: string): Promise<{ skillGroup: SupportSkillGroup; lastIdempotencyKey: string | null; lastFingerprint: string | null } | null> {
    const [rows] = await connection.query<GroupRow[]>(
      `SELECT ${GROUP_COLUMNS} FROM support_skill_groups WHERE city_code=? AND skill_group_id=? LIMIT 1 FOR UPDATE`, [cityCode, skillGroupId],
    );
    return rows[0] ? { skillGroup: mapGroup(rows[0]), lastIdempotencyKey: rows[0].last_mutation_idempotency_key, lastFingerprint: rows[0].last_mutation_fingerprint } : null;
  }

  async insertSkillGroup(connection: PoolConnection, input: Omit<SupportSkillGroup, "version" | "createdAt" | "updatedAt"> & { idempotencyKey: string; fingerprint: string }): Promise<void> {
    await connection.query(
      `INSERT INTO support_skill_groups
       (skill_group_id,city_code,name,matched_types_json,matched_languages_json,priority_weight,is_default,is_active,create_idempotency_key,create_fingerprint)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [input.skillGroupId, input.cityCode, input.name, JSON.stringify(input.matchedTypes),
        JSON.stringify(input.matchedLanguages), input.priorityWeight, input.isDefault, input.isActive, input.idempotencyKey, input.fingerprint],
    );
  }

  async updateSkillGroupCas(connection: PoolConnection, input: {
    cityCode: CityCode; skillGroupId: string; name: string; matchedTypes: SupportTicketType[];
    matchedLanguages: string[]; priorityWeight: number; isDefault: boolean; isActive: boolean; expectedVersion: number; idempotencyKey: string; fingerprint: string;
  }): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE support_skill_groups SET name=?,matched_types_json=?,matched_languages_json=?,
         priority_weight=?,is_default=?,is_active=?,last_mutation_idempotency_key=?,last_mutation_fingerprint=?,version=version+1
       WHERE city_code=? AND skill_group_id=? AND version=?`,
      [input.name, JSON.stringify(input.matchedTypes), JSON.stringify(input.matchedLanguages),
        input.priorityWeight, input.isDefault, input.isActive, input.idempotencyKey, input.fingerprint, input.cityCode, input.skillGroupId, input.expectedVersion],
    );
    return result.affectedRows === 1;
  }

  async listMemberships(connection: PoolConnection, cityCode: CityCode, agentId: string): Promise<SupportAgentSkillGroupMembership[]> {
    const [rows] = await connection.query<MembershipRow[]>(
      `SELECT city_code,agent_id,skill_group_id,proficiency,is_primary,is_active,last_idempotency_key,last_mutation_fingerprint,created_at,updated_at
       FROM support_agent_skill_groups WHERE city_code=? AND agent_id=?
       ORDER BY is_primary DESC,proficiency DESC,skill_group_id ASC`, [cityCode, agentId],
    );
    return rows.map(mapMembership);
  }

  async findMembershipByKey(connection: PoolConnection, cityCode: CityCode, agentId: string, idempotencyKey: string): Promise<{ membership: SupportAgentSkillGroupMembership; fingerprint: string } | null> {
    const [rows] = await connection.query<MembershipRow[]>(
      `SELECT city_code,agent_id,skill_group_id,proficiency,is_primary,is_active,last_idempotency_key,last_mutation_fingerprint,created_at,updated_at
       FROM support_agent_skill_groups WHERE city_code=? AND agent_id=? AND last_idempotency_key=? LIMIT 1 FOR UPDATE`,
      [cityCode, agentId, idempotencyKey],
    );
    return rows[0] ? { membership: mapMembership(rows[0]), fingerprint: rows[0].last_mutation_fingerprint } : null;
  }

  async upsertMembership(connection: PoolConnection, input: {
    cityCode: CityCode; agentId: string; skillGroupId: string; proficiency: number; isPrimary: boolean; idempotencyKey: string; fingerprint: string;
  }): Promise<void> {
    await connection.query(
      `INSERT INTO support_agent_skill_groups
       (city_code,agent_id,skill_group_id,proficiency,is_primary,is_active,last_idempotency_key,last_mutation_fingerprint)
       VALUES (?,?,?,?,?,1,?,?)
       ON DUPLICATE KEY UPDATE proficiency=VALUES(proficiency),is_primary=VALUES(is_primary),
         is_active=1,last_idempotency_key=VALUES(last_idempotency_key),last_mutation_fingerprint=VALUES(last_mutation_fingerprint)`,
      [input.cityCode, input.agentId, input.skillGroupId, input.proficiency, input.isPrimary, input.idempotencyKey, input.fingerprint],
    );
  }

  async deactivateMembership(connection: PoolConnection, cityCode: CityCode, agentId: string, skillGroupId: string, idempotencyKey: string, fingerprint: string): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE support_agent_skill_groups SET is_active=0,last_idempotency_key=?,last_mutation_fingerprint=?
       WHERE city_code=? AND agent_id=? AND skill_group_id=? AND is_active=1`,
      [idempotencyKey, fingerprint, cityCode, agentId, skillGroupId],
    );
    return result.affectedRows === 1;
  }

  async bumpAgentVersionCas(connection: PoolConnection, cityCode: CityCode, agentId: string, expectedVersion: number): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE support_agents SET version=version+1 WHERE city_code=? AND agent_id=? AND version=?`,
      [cityCode, agentId, expectedVersion],
    );
    return result.affectedRows === 1;
  }

  async isActiveMemberForAdmin(connection: PoolConnection, cityCode: CityCode, adminUserId: string, skillGroupId: string): Promise<boolean> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT sa.agent_id FROM support_agents sa
       INNER JOIN support_agent_skill_groups sag
         ON sag.city_code=sa.city_code AND sag.agent_id=sa.agent_id AND sag.skill_group_id=? AND sag.is_active=1
       WHERE sa.city_code=? AND sa.admin_user_id=? AND sa.lifecycle_status='active' LIMIT 1`,
      [skillGroupId, cityCode, adminUserId],
    );
    return Boolean(rows[0]);
  }
}

export const supportAgentRepository = new SupportAgentRepository();
