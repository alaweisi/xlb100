import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  CityCode, SupportSlaPolicy, SupportTicketPriority, SupportTicketType,
} from "@xlb/types";

type PolicyRow = RowDataPacket & {
  policy_id: string;
  policy_series_id: string;
  revision: number | string;
  supersedes_policy_id: string | null;
  city_code: string;
  type: string;
  priority: string;
  first_response_minutes: number | string;
  resolution_minutes: number | string;
  effective_from: Date;
  effective_to: Date | null;
  is_active: number | boolean;
  version: number | string;
  create_idempotency_key: string | null;
  create_fingerprint: string | null;
  mutation_idempotency_key: string | null;
  mutation_fingerprint: string | null;
  created_at: Date;
  updated_at: Date;
};

const POLICY_COLUMNS = `policy_id,policy_series_id,revision,supersedes_policy_id,city_code,type,priority,
  first_response_minutes,resolution_minutes,effective_from,effective_to,is_active,version,
  create_idempotency_key,create_fingerprint,mutation_idempotency_key,mutation_fingerprint,created_at,updated_at`;

function mapPolicy(row: PolicyRow): SupportSlaPolicy {
  return {
    policyId: row.policy_id,
    policySeriesId: row.policy_series_id,
    revision: Number(row.revision),
    supersedesPolicyId: row.supersedes_policy_id,
    cityCode: row.city_code as CityCode,
    type: row.type as SupportTicketType,
    priority: row.priority as SupportTicketPriority,
    firstResponseMinutes: Number(row.first_response_minutes),
    resolutionMinutes: Number(row.resolution_minutes),
    effectiveFrom: row.effective_from.toISOString(),
    effectiveTo: row.effective_to?.toISOString() ?? null,
    isActive: Boolean(row.is_active),
    version: Number(row.version),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export type SupportSlaPolicyCursor = { createdAt: string; policyId: string };

export class SupportSlaPolicyRepository {
  async databaseNow(connection: PoolConnection): Promise<Date> {
    const [rows] = await connection.query<(RowDataPacket & { database_now: Date })[]>(
      "SELECT CURRENT_TIMESTAMP(3) AS database_now",
    );
    return rows[0]!.database_now;
  }

  async lockCity(connection: PoolConnection, cityCode: CityCode): Promise<boolean> {
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT city_code FROM cities WHERE city_code=? LIMIT 1 FOR UPDATE",
      [cityCode],
    );
    return Boolean(rows[0]);
  }

  async findById(connection: PoolConnection, cityCode: CityCode, policyId: string, forUpdate = false): Promise<SupportSlaPolicy | null> {
    const [rows] = await connection.query<PolicyRow[]>(
      `SELECT ${POLICY_COLUMNS} FROM support_sla_policies
       WHERE city_code=? AND policy_id=? LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`,
      [cityCode, policyId],
    );
    return rows[0] ? mapPolicy(rows[0]) : null;
  }

  async findLatestInSeries(connection: PoolConnection, cityCode: CityCode, seriesId: string): Promise<SupportSlaPolicy | null> {
    const [rows] = await connection.query<PolicyRow[]>(
      `SELECT ${POLICY_COLUMNS} FROM support_sla_policies
       WHERE city_code=? AND policy_series_id=?
       ORDER BY revision DESC LIMIT 1 FOR UPDATE`,
      [cityCode, seriesId],
    );
    return rows[0] ? mapPolicy(rows[0]) : null;
  }

  async findByCreateKey(connection: PoolConnection, cityCode: CityCode, idempotencyKey: string): Promise<{ policy: SupportSlaPolicy; fingerprint: string } | null> {
    const [rows] = await connection.query<PolicyRow[]>(
      `SELECT ${POLICY_COLUMNS} FROM support_sla_policies
       WHERE city_code=? AND create_idempotency_key=? LIMIT 1 FOR UPDATE`,
      [cityCode, idempotencyKey],
    );
    return rows[0] ? { policy: mapPolicy(rows[0]), fingerprint: rows[0].create_fingerprint! } : null;
  }

  async findByMutationKey(connection: PoolConnection, cityCode: CityCode, seriesId: string, idempotencyKey: string): Promise<{ policy: SupportSlaPolicy; fingerprint: string } | null> {
    const [rows] = await connection.query<PolicyRow[]>(
      `SELECT ${POLICY_COLUMNS} FROM support_sla_policies
       WHERE city_code=? AND policy_series_id=? AND mutation_idempotency_key=?
       LIMIT 1 FOR UPDATE`,
      [cityCode, seriesId, idempotencyKey],
    );
    return rows[0] ? { policy: mapPolicy(rows[0]), fingerprint: rows[0].mutation_fingerprint! } : null;
  }

  async findEffective(connection: PoolConnection, input: {
    cityCode: CityCode;
    type: SupportTicketType;
    priority: SupportTicketPriority;
    at: Date;
  }): Promise<SupportSlaPolicy | null> {
    const [rows] = await connection.query<PolicyRow[]>(
      `SELECT ${POLICY_COLUMNS} FROM support_sla_policies
       WHERE city_code=? AND type=? AND priority=? AND is_active=1
         AND effective_from<=? AND (effective_to IS NULL OR effective_to>?)
       ORDER BY effective_from DESC,revision DESC,policy_id ASC LIMIT 1`,
      [input.cityCode, input.type, input.priority, input.at, input.at],
    );
    return rows[0] ? mapPolicy(rows[0]) : null;
  }

  async hasOverlap(connection: PoolConnection, input: {
    cityCode: CityCode;
    type: SupportTicketType;
    priority: SupportTicketPriority;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }): Promise<boolean> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT policy_id FROM support_sla_policies
       WHERE city_code=? AND type=? AND priority=? AND is_active=1
         AND (effective_to IS NULL OR effective_to>?)
         AND (? IS NULL OR effective_from<?)
       LIMIT 1`,
      [input.cityCode, input.type, input.priority, input.effectiveFrom,
        input.effectiveTo, input.effectiveTo],
    );
    return Boolean(rows[0]);
  }

  async insert(connection: PoolConnection, input: {
    policyId: string;
    policySeriesId: string;
    revision: number;
    supersedesPolicyId: string | null;
    cityCode: CityCode;
    type: SupportTicketType;
    priority: SupportTicketPriority;
    firstResponseMinutes: number;
    resolutionMinutes: number;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    isActive: boolean;
    version: number;
    idempotencyKey: string;
    fingerprint: string;
  }): Promise<void> {
    await connection.query(
      `INSERT INTO support_sla_policies
       (policy_id,policy_series_id,revision,supersedes_policy_id,city_code,type,priority,
        first_response_minutes,resolution_minutes,effective_from,effective_to,is_active,version,
        create_idempotency_key,create_fingerprint,mutation_idempotency_key,mutation_fingerprint)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [input.policyId, input.policySeriesId, input.revision, input.supersedesPolicyId,
        input.cityCode, input.type, input.priority, input.firstResponseMinutes,
        input.resolutionMinutes, input.effectiveFrom, input.effectiveTo, input.isActive,
        input.version,
        input.revision === 1 ? input.idempotencyKey : null,
        input.revision === 1 ? input.fingerprint : null,
        input.revision > 1 ? input.idempotencyKey : null,
        input.revision > 1 ? input.fingerprint : null],
    );
  }

  async closeRevisionCas(connection: PoolConnection, input: {
    cityCode: CityCode;
    policyId: string;
    expectedVersion: number;
    effectiveTo: Date;
  }): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE support_sla_policies SET effective_to=?
       WHERE city_code=? AND policy_id=? AND version=?
         AND effective_from<? AND (effective_to IS NULL OR effective_to>?)`,
      [input.effectiveTo, input.cityCode, input.policyId, input.expectedVersion,
        input.effectiveTo, input.effectiveTo],
    );
    return result.affectedRows === 1;
  }

  async list(connection: PoolConnection, cityCode: CityCode, filters: {
    type?: SupportTicketType;
    priority?: SupportTicketPriority;
    isActive?: boolean;
    effectiveAt?: Date;
    cursor?: SupportSlaPolicyCursor;
    limit: number;
  }): Promise<SupportSlaPolicy[]> {
    const clauses = ["city_code=?"];
    const params: unknown[] = [cityCode];
    if (filters.type) { clauses.push("type=?"); params.push(filters.type); }
    if (filters.priority) { clauses.push("priority=?"); params.push(filters.priority); }
    if (filters.isActive !== undefined) { clauses.push("is_active=?"); params.push(filters.isActive); }
    if (filters.effectiveAt) {
      clauses.push("effective_from<=?", "(effective_to IS NULL OR effective_to>?)");
      params.push(filters.effectiveAt, filters.effectiveAt);
    }
    if (filters.cursor) {
      clauses.push("(created_at<? OR (created_at=? AND policy_id<?))");
      params.push(filters.cursor.createdAt, filters.cursor.createdAt, filters.cursor.policyId);
    }
    params.push(filters.limit);
    const [rows] = await connection.query<PolicyRow[]>(
      `SELECT ${POLICY_COLUMNS} FROM support_sla_policies
       WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC,policy_id DESC LIMIT ?`,
      params,
    );
    return rows.map(mapPolicy);
  }
}

export const supportSlaPolicyRepository = new SupportSlaPolicyRepository();
