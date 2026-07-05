import type { RowDataPacket } from "mysql2/promise";
import { randomBytes } from "node:crypto";
import type { RequestContext } from "@xlb/types";
import type {
  GovernanceIntentRecord,
  CreateGovernanceIntentRequest,
  GovernanceIntentListQuery,
} from "@xlb/types";
import { getMysqlPool } from "../dal/mysqlPool.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

const generateIntentId = (): string => `gi_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;

// ── Row mapper ──
type IntentRow = RowDataPacket & {
  id: string; city_code: string; statement_id: string | null;
  action_kind: string; action_status: string;
  target_type: string | null; target_ref: string | null;
  requested_by_admin_id: string; requested_reason: string;
  evidence_refs_json: string; risk_flags_json: string;
  phase_boundary_json: string;
  created_at: Date; updated_at: Date;
  cancelled_at: Date | null; archived_at: Date | null;
};

function mapIntent(row: IntentRow): GovernanceIntentRecord {
  return {
    id: row.id,
    cityCode: row.city_code,
    statementId: row.statement_id,
    actionKind: row.action_kind as GovernanceIntentRecord["actionKind"],
    actionStatus: row.action_status as GovernanceIntentRecord["actionStatus"],
    targetType: row.target_type,
    targetRef: row.target_ref,
    requestedByAdminId: row.requested_by_admin_id,
    requestedReason: row.requested_reason,
    evidenceRefs: JSON.parse(row.evidence_refs_json),
    riskFlags: JSON.parse(row.risk_flags_json),
    phaseBoundary: JSON.parse(row.phase_boundary_json),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    archivedAt: row.archived_at?.toISOString() ?? null,
  };
}

// ── Helpers ──

async function getIntentRaw(pool: ReturnType<typeof getMysqlPool>, intentId: string): Promise<IntentRow | null> {
  const [rows] = await pool.query<IntentRow[]>("SELECT * FROM settlement_action_governance_intents WHERE id = ?", [intentId]);
  return rows.length > 0 ? rows[0] : null;
}

export async function assertGovernanceIntentInCity(pool: ReturnType<typeof getMysqlPool>, intentId: string, cityCode: string): Promise<void> {
  const row = await getIntentRaw(pool, intentId);
  if (!row) throw new Error(`governance intent ${intentId} not found`);
  if (row.city_code !== cityCode) throw new Error(`governance intent ${intentId} belongs to city ${row.city_code}, not ${cityCode}`);
}

// ── Service ──
class GovernanceIntentService {
  private pool = getMysqlPool();

  async createDraft(
    context: RequestContext,
    req: CreateGovernanceIntentRequest,
  ): Promise<GovernanceIntentRecord> {
    const cityCode = assertCityScopedContext(context);
    const id = generateIntentId();
    const now = new Date();
    const phaseBoundary = {
      phase: "10C",
      governanceOnly: true,
      executionEnabled: false,
      persistenceEnabled: true,
      mutationEnabled: false,
    };

    await this.pool.query(
      `INSERT INTO settlement_action_governance_intents
        (id, city_code, statement_id, action_kind, action_status,
         target_type, target_ref, requested_by_admin_id, requested_reason,
         evidence_refs_json, risk_flags_json, phase_boundary_json,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, cityCode, req.statementId ?? null, req.actionKind,
        req.targetType ?? null, req.targetRef ?? null,
        req.requestedByAdminId, req.requestedReason,
        JSON.stringify(req.evidenceRefs ?? []),
        JSON.stringify(req.riskFlags ?? []),
        JSON.stringify(phaseBoundary),
        now, now,
      ],
    );

    const record = await this.getIntent(context, id);
    if (!record) throw new Error("failed to read back created governance intent");
    return record;
  }

  async getIntent(
    context: RequestContext,
    id: string,
  ): Promise<GovernanceIntentRecord | null> {
    const cityCode = assertCityScopedContext(context);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const [rows] = await this.pool.query<IntentRow[]>(
      `SELECT * FROM settlement_action_governance_intents WHERE id = ? AND ${clause}`,
      [id, ...params],
    );
    if (rows.length === 0) return null;
    return mapIntent(rows[0]);
  }

  async listIntents(
    context: RequestContext,
    query: GovernanceIntentListQuery,
  ): Promise<GovernanceIntentRecord[]> {
    const cityCode = assertCityScopedContext(context);
    const conditions: string[] = [];
    const params: unknown[] = [];

    // B1 FIX: Always enforce context cityCode, never override from query
    const { clause, params: cp } = buildCityScopedWhere(cityCode, "city_code");
    conditions.push(clause);
    params.push(...cp);

    if (query.statementId) {
      conditions.push("statement_id = ?");
      params.push(query.statementId);
    }
    if (query.actionStatus) {
      conditions.push("action_status = ?");
      params.push(query.actionStatus);
    }

    const limit = query.limit ?? 50;
    const [rows] = await this.pool.query<IntentRow[]>(
      `SELECT * FROM settlement_action_governance_intents
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC LIMIT ?`,
      [...params, limit],
    );
    return rows.map(mapIntent);
  }

  async cancelIntent(
    context: RequestContext,
    id: string,
  ): Promise<GovernanceIntentRecord | null> {
    const cityCode = assertCityScopedContext(context);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const now = new Date();
    const [result] = await this.pool.query(
      `UPDATE settlement_action_governance_intents
       SET action_status = 'cancelled', cancelled_at = ?, updated_at = ?
       WHERE id = ? AND ${clause} AND action_status = 'draft'`,
      [now, now, id, ...params],
    );
    if ((result as { affectedRows: number }).affectedRows === 0) return null;
    return this.getIntent(context, id);
  }

  async archiveIntent(
    context: RequestContext,
    id: string,
  ): Promise<GovernanceIntentRecord | null> {
    const cityCode = assertCityScopedContext(context);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const now = new Date();
    const [result] = await this.pool.query(
      `UPDATE settlement_action_governance_intents
       SET action_status = 'archived', archived_at = ?, updated_at = ?
       WHERE id = ? AND ${clause} AND action_status IN ('cancelled', 'draft')`,
      [now, now, id, ...params],
    );
    if ((result as { affectedRows: number }).affectedRows === 0) return null;
    return this.getIntent(context, id);
  }
}

export const governanceIntentService = new GovernanceIntentService();
