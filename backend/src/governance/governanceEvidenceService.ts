import type { RowDataPacket } from "mysql2/promise";
import { randomBytes } from "node:crypto";
import type { RequestContext } from "@xlb/types";
import type {
  GovernanceEvidenceBundleRecord,
  CreateEvidenceBundleRequest,
  AttachEvidenceRefRequest,
  GovernanceAuditTrailEntry,
} from "@xlb/types";
import { getMysqlPool } from "../dal/mysqlPool.js";
import { assertCityScopedContext, buildCityScopedWhere } from "../dal/scopedExecutor.js";
import { assertGovernanceIntentInCity } from "./governanceIntentService.js";

const generateBundleId = (): string => `eb_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;

type BundleRow = RowDataPacket & {
  id: string; city_code: string; intent_id: string; review_id: string | null;
  statement_id: string | null; bundle_status: string;
  evidence_refs_json: string; phase9_context_json: string;
  review_history_refs_json: string; audit_trail_refs_json: string;
  risk_summary: string | null; created_by_admin_id: string;
  created_at: Date; updated_at: Date; archived_at: Date | null;
};

function mapBundle(row: BundleRow): GovernanceEvidenceBundleRecord {
  return {
    id: row.id, cityCode: row.city_code, intentId: row.intent_id,
    reviewId: row.review_id, statementId: row.statement_id,
    bundleStatus: row.bundle_status as GovernanceEvidenceBundleRecord["bundleStatus"],
    evidenceRefs: JSON.parse(row.evidence_refs_json),
    phase9Context: JSON.parse(row.phase9_context_json),
    reviewHistoryRefs: JSON.parse(row.review_history_refs_json),
    auditTrailRefs: JSON.parse(row.audit_trail_refs_json),
    riskSummary: row.risk_summary,
    createdByAdminId: row.created_by_admin_id,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    archivedAt: row.archived_at?.toISOString() ?? null,
  };
}

class GovernanceEvidenceService {
  private pool = getMysqlPool();

  async createBundle(ctx: RequestContext, req: CreateEvidenceBundleRequest): Promise<GovernanceEvidenceBundleRecord> {
    const cityCode = assertCityScopedContext(ctx);
    // B4 FIX: verify intent belongs to current city
    await assertGovernanceIntentInCity(this.pool, req.intentId, cityCode);
    // Verify review belongs to current city if provided
    if (req.reviewId) {
      const [rr] = await this.pool.query<RowDataPacket[]>("SELECT city_code FROM settlement_action_governance_reviews WHERE id = ?", [req.reviewId]);
      if (rr.length === 0) throw new Error(`governance review ${req.reviewId} not found`);
      if (rr[0].city_code !== cityCode) throw new Error(`governance review ${req.reviewId} belongs to city ${rr[0].city_code}, not ${cityCode}`);
    }
    const id = generateBundleId(); const now = new Date();
    await this.pool.query(
      `INSERT INTO settlement_action_governance_evidence_bundles
        (id, city_code, intent_id, review_id, statement_id, bundle_status, evidence_refs_json, phase9_context_json, review_history_refs_json, audit_trail_refs_json, risk_summary, created_by_admin_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', '[]', '{}', '[]', '[]', ?, ?, ?, ?)`,
      [id, cityCode, req.intentId, req.reviewId ?? null, req.statementId ?? null, req.riskSummary ?? null, req.createdByAdminId, now, now],
    );
    return (await this.getBundle(ctx, id))!;
  }

  async getBundle(ctx: RequestContext, id: string): Promise<GovernanceEvidenceBundleRecord | null> {
    const cityCode = assertCityScopedContext(ctx);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const [rows] = await this.pool.query<BundleRow[]>(`SELECT * FROM settlement_action_governance_evidence_bundles WHERE id = ? AND ${clause}`, [id, ...params]);
    return rows.length === 0 ? null : mapBundle(rows[0]);
  }

  async listBundles(ctx: RequestContext, intentId?: string): Promise<GovernanceEvidenceBundleRecord[]> {
    const cityCode = assertCityScopedContext(ctx);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const conds = [clause]; const qp: unknown[] = [...params];
    if (intentId) { conds.push("intent_id = ?"); qp.push(intentId); }
    const [rows] = await this.pool.query<BundleRow[]>(`SELECT * FROM settlement_action_governance_evidence_bundles WHERE ${conds.join(" AND ")} ORDER BY created_at DESC LIMIT 50`, qp);
    return rows.map(mapBundle);
  }

  async attachRef(ctx: RequestContext, bundleId: string, ref: AttachEvidenceRefRequest): Promise<GovernanceEvidenceBundleRecord | null> {
    const cityCode = assertCityScopedContext(ctx);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const bundle = await this.getBundle(ctx, bundleId);
    if (!bundle || bundle.bundleStatus !== "draft") return null;
    // B4 FIX: reject cross-city refs
    if (ref.cityCode && ref.cityCode !== cityCode) {
      throw new Error("evidence ref cityCode mismatch with request context");
    }
    const refs = [...bundle.evidenceRefs, { ...ref, cityCode, createdAt: new Date().toISOString() }];
    await this.pool.query(`UPDATE settlement_action_governance_evidence_bundles SET evidence_refs_json = ?, updated_at = ? WHERE id = ? AND ${clause} AND bundle_status = 'draft'`,
      [JSON.stringify(refs), new Date(), bundleId, ...params]);
    return this.getBundle(ctx, bundleId);
  }

  async removeRef(ctx: RequestContext, bundleId: string, refId: string): Promise<GovernanceEvidenceBundleRecord | null> {
    const cityCode = assertCityScopedContext(ctx);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const bundle = await this.getBundle(ctx, bundleId);
    if (!bundle || bundle.bundleStatus !== "draft") return null;
    const refs = bundle.evidenceRefs.filter(r => r.refId !== refId);
    await this.pool.query(`UPDATE settlement_action_governance_evidence_bundles SET evidence_refs_json = ?, updated_at = ? WHERE id = ? AND ${clause} AND bundle_status = 'draft'`,
      [JSON.stringify(refs), new Date(), bundleId, ...params]);
    return this.getBundle(ctx, bundleId);
  }

  async archiveBundle(ctx: RequestContext, bundleId: string): Promise<GovernanceEvidenceBundleRecord | null> {
    const cityCode = assertCityScopedContext(ctx);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const now = new Date();
    const [r] = await this.pool.query(`UPDATE settlement_action_governance_evidence_bundles SET bundle_status = 'archived', archived_at = ?, updated_at = ? WHERE id = ? AND ${clause}`,
      [now, now, bundleId, ...params]);
    if ((r as { affectedRows: number }).affectedRows === 0) return null;
    return this.getBundle(ctx, bundleId);
  }

  async getAuditTrail(ctx: RequestContext, intentId: string): Promise<GovernanceAuditTrailEntry[]> {
    const cityCode = assertCityScopedContext(ctx);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const entries: GovernanceAuditTrailEntry[] = [];
    const [intents] = await this.pool.query<RowDataPacket[]>(`SELECT * FROM settlement_action_governance_intents WHERE id = ? AND ${clause}`, [intentId, ...params]);
    for (const i of intents) {
      entries.push({ eventType: "governance_intent_created", eventTimestamp: i.created_at instanceof Date ? i.created_at.toISOString() : String(i.created_at), actorAdminId: i.requested_by_admin_id, targetType: "governance_intent", targetId: i.id, cityCode, summary: `Intent created: ${i.action_kind}` });
    }
    const [reviews] = await this.pool.query<RowDataPacket[]>(`SELECT * FROM settlement_action_governance_reviews WHERE intent_id = ? AND ${clause}`, [intentId, ...params]);
    for (const rv of reviews) {
      entries.push({ eventType: `governance_review_${rv.review_status}`, eventTimestamp: rv.submitted_at instanceof Date ? rv.submitted_at.toISOString() : String(rv.submitted_at), actorAdminId: rv.submitted_by_admin_id, targetType: "governance_review", targetId: rv.id, cityCode, summary: `Review ${rv.review_status}` + (rv.review_note ? `: ${rv.review_note}` : "") });
    }
    return entries.sort((a, b) => a.eventTimestamp.localeCompare(b.eventTimestamp));
  }
}

export const governanceEvidenceService = new GovernanceEvidenceService();
