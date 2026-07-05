import { createHash, randomBytes } from "node:crypto";
import type { RowDataPacket, Pool, PoolConnection } from "mysql2/promise";
import type { RequestContext } from "@xlb/types";
import { assertCityScopedContext, buildCityScopedWhere } from "../dal/scopedExecutor.js";
import { getMysqlPool } from "../dal/mysqlPool.js";
import { withTransaction } from "../dal/transaction.js";

// ── ID generation ──────────────────────────────────────────────────────────────
const genId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;

// ── Row type helpers ───────────────────────────────────────────────────────────
type EnvelopeRow = RowDataPacket & {
  id: string;
  city_code: string;
  source_packet_id: string;
  source_plan_id: string | null;
  envelope_status: string;
  payload_hash: string;
  item_hash: string | null;
  source_packet_hash: string | null;
  source_plan_hash: string | null;
  amount_snapshot_json: string;
  city_config_snapshot_hash: string | null;
  settlement_cycle_snapshot_hash: string | null;
  conflict_check_snapshot_json: string;
  frozen_by_admin_id: string | null;
  approved_by_admin_id: string | null;
  trace_id: string | null;
  created_at: Date;
  updated_at: Date;
  frozen_at: Date | null;
  approved_at: Date | null;
};

type ItemRow = RowDataPacket & {
  id: string;
  city_code: string;
  envelope_id: string;
  item_type: string;
  item_ref_id: string;
  planned_action: string | null;
  item_order: number;
  created_at: Date;
};

type AuditRow = RowDataPacket & {
  id: string;
  city_code: string;
  envelope_id: string;
  event_type: string;
  event_timestamp: Date;
  actor_admin_id: string | null;
  summary: string | null;
  trace_id: string | null;
};

// ── Public interfaces ─────────────────────────────────────────────────────────
export interface PreparationEnvelope {
  id: string;
  cityCode: string;
  sourcePacketId: string;
  sourcePlanId: string | null;
  envelopeStatus: string;
  payloadHash: string;
  itemHash: string | null;
  sourcePacketHash: string | null;
  sourcePlanHash: string | null;
  amountSnapshot: Record<string, unknown>;
  cityConfigSnapshotHash: string | null;
  settlementCycleSnapshotHash: string | null;
  conflictCheckSnapshot: Record<string, unknown>;
  frozenByAdminId: string | null;
  approvedByAdminId: string | null;
  traceId: string | null;
  createdAt: string;
  updatedAt: string;
  frozenAt: string | null;
  approvedAt: string | null;
}

export interface PreparationEnvelopeItem {
  id: string;
  cityCode: string;
  envelopeId: string;
  itemType: string;
  itemRefId: string;
  plannedAction: string | null;
  itemOrder: number;
  createdAt: string;
}

export interface PreparationEnvelopeAudit {
  id: string;
  cityCode: string;
  envelopeId: string;
  eventType: string;
  eventTimestamp: string;
  actorAdminId: string | null;
  summary: string | null;
  traceId: string | null;
}

// ── Row mappers ────────────────────────────────────────────────────────────────
const mapEnvelope = (r: EnvelopeRow): PreparationEnvelope => ({
  id: r.id,
  cityCode: r.city_code,
  sourcePacketId: r.source_packet_id,
  sourcePlanId: r.source_plan_id,
  envelopeStatus: r.envelope_status,
  payloadHash: r.payload_hash,
  itemHash: r.item_hash,
  sourcePacketHash: r.source_packet_hash,
  sourcePlanHash: r.source_plan_hash,
  amountSnapshot: JSON.parse(r.amount_snapshot_json || "{}") as Record<string, unknown>,
  cityConfigSnapshotHash: r.city_config_snapshot_hash,
  settlementCycleSnapshotHash: r.settlement_cycle_snapshot_hash,
  conflictCheckSnapshot: JSON.parse(r.conflict_check_snapshot_json || "{}") as Record<string, unknown>,
  frozenByAdminId: r.frozen_by_admin_id,
  approvedByAdminId: r.approved_by_admin_id,
  traceId: r.trace_id,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
  frozenAt: r.frozen_at?.toISOString() ?? null,
  approvedAt: r.approved_at?.toISOString() ?? null,
});

const mapItem = (r: ItemRow): PreparationEnvelopeItem => ({
  id: r.id,
  cityCode: r.city_code,
  envelopeId: r.envelope_id,
  itemType: r.item_type,
  itemRefId: r.item_ref_id,
  plannedAction: r.planned_action,
  itemOrder: r.item_order,
  createdAt: r.created_at.toISOString(),
});

const mapAudit = (r: AuditRow): PreparationEnvelopeAudit => ({
  id: r.id,
  cityCode: r.city_code,
  envelopeId: r.envelope_id,
  eventType: r.event_type,
  eventTimestamp: r.event_timestamp.toISOString(),
  actorAdminId: r.actor_admin_id,
  summary: r.summary,
  traceId: r.trace_id,
});

// ── Deterministic payload hash ─────────────────────────────────────────────────
export function computePayloadHash(
  packetId: string,
  cityCode: string,
  planHash: string | null,
  itemRefs: string[],
): string {
  const payload = `${packetId}\n${cityCode}\n${planHash ?? ""}\n${[...itemRefs].sort().join("\n")}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

// ── Helper: compute hash of readiness packet data ──────────────────────────────
function computeSourcePacketHash(packet: RowDataPacket): string {
  const packetData = JSON.stringify({
    id: packet.id,
    city_code: packet.city_code,
    intent_id: packet.intent_id,
    review_id: packet.review_id,
    packet_status: packet.packet_status,
    source_refs_json: packet.source_refs_json,
  });
  return createHash("sha256").update(packetData, "utf8").digest("hex");
}

// ── Helper: compute hash of dry-run plan data ──────────────────────────────────
function computeSourcePlanHash(plan: RowDataPacket): string | null {
  const planData = JSON.stringify({
    id: plan.id,
    plan_hash: plan.plan_hash,
    plan_status: plan.plan_status,
  });
  return createHash("sha256").update(planData, "utf8").digest("hex");
}

// ── Envelope service ───────────────────────────────────────────────────────────
class EnvelopeService {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getMysqlPool();
  }

  // ── Private read helpers ─────────────────────────────────────────────────────

  /**
   * Read a readiness packet with city scope verification.
   */
  private async getReadinessPacket(
    conn: PoolConnection | Pool,
    cityCode: string,
    packetId: string,
  ): Promise<RowDataPacket | null> {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT * FROM settlement_action_governance_readiness_packets
       WHERE id = ? AND city_code = ?`,
      [packetId, cityCode],
    );
    return rows.length === 0 ? null : rows[0];
  }

  /**
   * Find a linked dry-run plan for a packet via city-scoped lookup.
   */
  private async findLinkedPlan(
    conn: PoolConnection | Pool,
    cityCode: string,
    packetId: string,
  ): Promise<RowDataPacket | null> {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT * FROM settlement_execution_dry_run_plans
       WHERE readiness_packet_id = ? AND city_code = ?
       ORDER BY created_at DESC LIMIT 1`,
      [packetId, cityCode],
    );
    return rows.length === 0 ? null : rows[0];
  }

  /**
   * Read plan items for a given plan ID.
   */
  private async getPlanItems(
    conn: PoolConnection | Pool,
    planId: string,
    cityCode: string,
  ): Promise<RowDataPacket[]> {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT * FROM settlement_execution_dry_run_plan_items
       WHERE plan_id = ? AND city_code = ?
       ORDER BY item_order ASC`,
      [planId, cityCode],
    );
    return rows;
  }

  /**
   * Read city config for a city.
   */
  private async getCityConfig(
    conn: PoolConnection | Pool,
    cityCode: string,
  ): Promise<RowDataPacket | null> {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT * FROM city_configs WHERE city_code = ?`,
      [cityCode],
    );
    return rows.length === 0 ? null : rows[0];
  }

  /**
   * Collect statement IDs from envelope items.
   */
  private async getStatementIdsFromItems(
    conn: PoolConnection | Pool,
    envelopeId: string,
    cityCode: string,
  ): Promise<string[]> {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT item_ref_id FROM settlement_execution_preparation_items
       WHERE envelope_id = ? AND city_code = ? AND item_type = 'statement'`,
      [envelopeId, cityCode],
    );
    return rows.map((r) => r.item_ref_id as string);
  }

  // ── Source readiness validation (F1) ─────────────────────────────────────────

  /**
   * Validate source readiness: load packet, find linked plan, verify status.
   * Returns { plan, sourcePacketHash, sourcePlanHash } or throws.
   */
  private async validateSourceReadiness(
    conn: PoolConnection | Pool,
    cityCode: string,
    sourcePacketId: string,
  ): Promise<{
    plan: RowDataPacket;
    sourcePacketHash: string;
    sourcePlanHash: string | null;
  }> {
    // 1. Load readiness packet
    const packet = await this.getReadinessPacket(conn, cityCode, sourcePacketId);
    if (!packet) {
      throw new Error(`Readiness packet ${sourcePacketId} not found in city ${cityCode}`);
    }
    if (packet.packet_status !== "ready_for_future_phase_review") {
      throw new Error(
        `Readiness packet ${sourcePacketId} status is '${packet.packet_status}', expected 'ready_for_future_phase_review'`,
      );
    }

    // 2. Find linked Phase 11 dry-run plan
    const plan = await this.findLinkedPlan(conn, cityCode, sourcePacketId);
    if (!plan) {
      throw new Error(`no approved Phase 11 dry-run plan exists for this packet`);
    }

    // 3. Verify plan_status='generated'
    if (plan.plan_status !== "generated") {
      throw new Error(`plan is not in generated status`);
    }

    // 4. Compute hashes
    const sourcePacketHash = computeSourcePacketHash(packet);
    const sourcePlanHash = computeSourcePlanHash(plan);

    return { plan, sourcePacketHash, sourcePlanHash };
  }

  /**
   * Check for existing envelope. If one exists and hashes mismatch → return stale.
   */
  private async checkExistingEnvelope(
    conn: PoolConnection | Pool,
    cityCode: string,
    sourcePacketId: string,
    sourcePacketHash: string,
    sourcePlanHash: string | null,
  ): Promise<PreparationEnvelope | null> {
    const { clause, params: whereParams } = buildCityScopedWhere(cityCode, "city_code");
    const [existing] = await conn.query<EnvelopeRow[]>(
      `SELECT * FROM settlement_execution_preparation_envelopes
       WHERE source_packet_id = ? AND ${clause}
         AND envelope_status IN ('draft', 'frozen', 'approved_for_phase13_review')
       LIMIT 1`,
      [sourcePacketId, ...whereParams],
    );
    if (existing.length === 0) return null;

    const envelope = mapEnvelope(existing[0]);

    // Compare current hashes with stored hashes
    if (
      envelope.sourcePacketHash !== sourcePacketHash ||
      envelope.sourcePlanHash !== sourcePlanHash
    ) {
      // Hash mismatch: source changed → stale_or_conflict
      return {
        ...envelope,
        envelopeStatus: "stale_or_conflict",
      };
    }

    return envelope;
  }

  // ── Public methods ──────────────────────────────────────────────────────────

  /**
   * Create an envelope from a readiness packet (F1, F4).
   * Wrapped in a transaction: INSERT envelope → INSERT items → INSERT audit → commit.
   */
  async createEnvelope(
    ctx: RequestContext,
    sourcePacketId: string,
  ): Promise<PreparationEnvelope> {
    const cityCode = assertCityScopedContext(ctx);
    const traceId = ctx.traceId ?? null;
    const adminId = ctx.userId ?? null;

    return withTransaction(async (conn) => {
      // 1. Validate source readiness
      const { plan, sourcePacketHash, sourcePlanHash } =
        await this.validateSourceReadiness(conn, cityCode, sourcePacketId);

      // 2. Check for existing envelope; if hash mismatch → return stale
      const existing = await this.checkExistingEnvelope(
        conn,
        cityCode,
        sourcePacketId,
        sourcePacketHash,
        sourcePlanHash,
      );
      if (existing) {
        // If hash mismatch → stale; otherwise just return existing
        if (existing.envelopeStatus === "stale_or_conflict") {
          return existing;
        }
        return existing;
      }

      // 3. Collect item refs for payload hash
      const planItems = await this.getPlanItems(conn, plan.id as string, cityCode);
      const itemRefs: string[] = [];
      for (const pi of planItems) {
        itemRefs.push(`${pi.item_type}:${pi.item_ref_id}`);
      }

      // 4. Compute deterministic payload hash using planHash
      const payloadHash = computePayloadHash(
        sourcePacketId,
        cityCode,
        plan.plan_hash as string,
        itemRefs,
      );

      // 5. Insert envelope in draft status
      const envelopeId = genId("env");
      const now = new Date();
      const sourcePlanId: string = plan.id as string;

      await conn.query(
        `INSERT INTO settlement_execution_preparation_envelopes
         (id, city_code, source_packet_id, source_plan_id, envelope_status,
          payload_hash, source_packet_hash, source_plan_hash,
          amount_snapshot_json, city_config_snapshot_hash,
          settlement_cycle_snapshot_hash, conflict_check_snapshot_json,
          frozen_by_admin_id, approved_by_admin_id, trace_id,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, '{}', NULL, NULL, '{}', NULL, NULL, ?, ?, ?)`,
        [
          envelopeId,
          cityCode,
          sourcePacketId,
          sourcePlanId,
          payloadHash,
          sourcePacketHash,
          sourcePlanHash,
          traceId,
          now,
          now,
        ],
      );

      // 6. Populate items from plan items
      for (const pi of planItems) {
        const itemId = genId("epi");
        await conn.query(
          `INSERT INTO settlement_execution_preparation_items
           (id, city_code, envelope_id, item_type, item_ref_id,
            planned_action, item_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            cityCode,
            envelopeId,
            pi.item_type as string,
            pi.item_ref_id as string,
            (pi.planned_action ?? null) as string | null,
            (pi.item_order ?? 0) as number,
            now,
          ],
        );
      }

      // 7. Write audit event (includes trace_id)
      const auditId = genId("epa");
      await conn.query(
        `INSERT INTO settlement_execution_preparation_audit
         (id, city_code, envelope_id, event_type, event_timestamp,
          actor_admin_id, summary, trace_id)
         VALUES (?, ?, ?, 'envelope_created', ?, ?, ?, ?)`,
        [
          auditId,
          cityCode,
          envelopeId,
          now,
          adminId,
          `Envelope created from readiness packet ${sourcePacketId} with payload hash ${payloadHash}`,
          traceId,
        ],
      );

      // 8. Read back and return created envelope
      const [rows] = await conn.query<EnvelopeRow[]>(
        `SELECT * FROM settlement_execution_preparation_envelopes WHERE id = ?`,
        [envelopeId],
      );
      return mapEnvelope(rows[0]);
    });
  }

  /**
   * Freeze an envelope (F1, F2, F3, F4).
   * Wrapped in a transaction: SELECT envelope (verify draft) → UPDATE with WHERE status guard →
   * INSERT audit → commit.
   */
  async freezeEnvelope(
    ctx: RequestContext,
    envelopeId: string,
  ): Promise<PreparationEnvelope> {
    const cityCode = assertCityScopedContext(ctx);
    const traceId = ctx.traceId ?? null;
    const adminId = ctx.userId ?? null;

    return withTransaction(async (conn) => {
      const { clause, params } = buildCityScopedWhere(cityCode, "city_code");

      // 1. Load envelope
      const [rows] = await conn.query<EnvelopeRow[]>(
        `SELECT * FROM settlement_execution_preparation_envelopes
         WHERE id = ? AND ${clause}`,
        [envelopeId, ...params],
      );
      if (rows.length === 0) {
        throw new Error(`Envelope ${envelopeId} not found in city ${cityCode}`);
      }
      const envelope = rows[0];

      // 2. Verify draft status
      if (envelope.envelope_status !== "draft") {
        throw new Error(
          `Envelope ${envelopeId} status is '${envelope.envelope_status}', expected 'draft' for freeze`,
        );
      }

      // 3. Revalidate source readiness (F1.6)
      await this.validateSourceReadiness(
        conn,
        cityCode,
        envelope.source_packet_id,
      );

      // Compare current packet hash with stored
      const packet = await this.getReadinessPacket(conn, cityCode, envelope.source_packet_id);
      if (packet) {
        const currentPacketHash = computeSourcePacketHash(packet);
        if (currentPacketHash !== envelope.source_packet_hash) {
          throw new Error(
            `Source packet hash mismatch: current ${currentPacketHash} vs stored ${envelope.source_packet_hash}`,
          );
        }
      }

      // 4. Amount snapshot (F2): query worker_receivable_statements
      const statementIds = await this.getStatementIdsFromItems(conn, envelopeId, cityCode);
      let amountSnapshot: Record<string, unknown>;
      const queriedAt = new Date().toISOString();

      if (statementIds.length === 0) {
        amountSnapshot = {
          totalWorkerReceivable: 0,
          statementCount: 0,
          statementIds: [],
          queriedAt,
        };
      } else {
        try {
          const placeholders = statementIds.map(() => "?").join(", ");
          const [amountRows] = await conn.query<RowDataPacket[]>(
            `SELECT SUM(worker_receivable_amount) AS total
             FROM worker_receivable_statements
             WHERE statement_id IN (${placeholders}) AND city_code = ?`,
            [...statementIds, cityCode],
          );
          const total = amountRows[0]?.total;
          if (total === null || total === undefined) {
            throw new Error("amount snapshot unavailable");
          }
          amountSnapshot = {
            totalWorkerReceivable: Number(total),
            statementCount: statementIds.length,
            statementIds,
            queriedAt,
          };
        } catch (err) {
          throw new Error("amount snapshot unavailable");
        }
      }

      // 5. City config snapshot
      let cityConfigSnapshotHash: string | null = null;
      try {
        const cityConfig = await this.getCityConfig(conn, cityCode);
        if (cityConfig) {
          const configData = JSON.stringify(cityConfig);
          cityConfigSnapshotHash = createHash("sha256").update(configData, "utf8").digest("hex");
        }
      } catch {
        // city config snapshot optional
      }

      // 6. Settlement cycle snapshot
      let settlementCycleSnapshotHash: string | null = null;
      try {
        const [batchRows] = await conn.query<RowDataPacket[]>(
          `SELECT settlement_batch_id, status, total_gross_amount, total_worker_receivable, item_count
           FROM settlement_batches WHERE city_code = ?`,
          [cityCode],
        );
        const cycleData = JSON.stringify({
          city_code: cityCode,
          snapshot_at: queriedAt,
          envelope_id: envelopeId,
          batches: batchRows.map((b) => ({
            batch_id: b.settlement_batch_id,
            status: b.status,
            total_gross_amount: Number(b.total_gross_amount),
            total_worker_receivable: Number(b.total_worker_receivable),
            item_count: b.item_count,
          })),
        });
        settlementCycleSnapshotHash = createHash("sha256").update(cycleData, "utf8").digest("hex");
      } catch {
        // settlement cycle snapshot optional
      }

      // 7. Conflict check snapshot (F3)
      const conflictCheckSnapshot: Record<string, unknown> = {
        conflict_check_at: queriedAt,
      };

      // 7a. Amount drift check: compare current snapshot vs previous envelope snapshot
      try {
        const [prevEnvs] = await conn.query<EnvelopeRow[]>(
          `SELECT amount_snapshot_json FROM settlement_execution_preparation_envelopes
           WHERE source_packet_id = ? AND city_code = ? AND id <> ?
           ORDER BY created_at DESC LIMIT 1`,
          [envelope.source_packet_id, cityCode, envelopeId],
        );
        if (prevEnvs.length > 0) {
          const prevSnapshot = JSON.parse(prevEnvs[0].amount_snapshot_json || "{}");
          conflictCheckSnapshot.amount_drift = {
            previous_total: prevSnapshot.totalWorkerReceivable ?? null,
            current_total: amountSnapshot.totalWorkerReceivable,
          };
        } else {
          conflictCheckSnapshot.amount_drift = { note: "no previous envelope for comparison" };
        }
      } catch {
        conflictCheckSnapshot.amount_drift = { error: "drift_check_failed" };
      }

      // 7b. City config hash check
      try {
        const [prevConfig] = await conn.query<EnvelopeRow[]>(
          `SELECT city_config_snapshot_hash FROM settlement_execution_preparation_envelopes
           WHERE source_packet_id = ? AND city_code = ? AND id <> ? AND city_config_snapshot_hash IS NOT NULL
           ORDER BY created_at DESC LIMIT 1`,
          [envelope.source_packet_id, cityCode, envelopeId],
        );
        conflictCheckSnapshot.city_config_check = {
          current_hash: cityConfigSnapshotHash,
          previous_hash: prevConfig.length > 0 ? prevConfig[0].city_config_snapshot_hash : null,
        };
      } catch {
        conflictCheckSnapshot.city_config_check = { error: "config_check_failed" };
      }

      // 7c. Settlement cycle: check for cancelled batches
      try {
        const [cancelledBatches] = await conn.query<RowDataPacket[]>(
          `SELECT settlement_batch_id, status FROM settlement_batches
           WHERE city_code = ? AND status = 'cancelled'`,
          [cityCode],
        );
        conflictCheckSnapshot.settlement_cycle_check = {
          cancelled_batches: cancelledBatches.map((b) => b.settlement_batch_id),
          has_cancelled: cancelledBatches.length > 0,
        };
      } catch {
        conflictCheckSnapshot.settlement_cycle_check = { error: "cycle_check_failed" };
      }

      // 7d. Ledger voided: check ledger_accruals for voided status
      try {
        const [voidedRows] = await conn.query<RowDataPacket[]>(
          `SELECT COUNT(*) AS cnt FROM ledger_accruals
           WHERE city_code = ? AND status = 'voided'`,
          [cityCode],
        );
        conflictCheckSnapshot.ledger_voided_check = {
          voided_count: voidedRows[0]?.cnt ?? 0,
        };
      } catch {
        conflictCheckSnapshot.ledger_voided_check = { error: "ledger_check_failed" };
      }

      // 7e. Refund/reversal check — tables not yet created in Phase 12
      try {
        await conn.query(`SELECT 1 FROM refund_requests LIMIT 0`);
        conflictCheckSnapshot.refund_reversal_check = { note: "refund schema present" };
      } catch {
        conflictCheckSnapshot.refund_reversal_check = {
          status: "not_applicable",
          reason: "refund/reversal schema not yet created in Phase 12",
        };
      }

      // 7f. Duplicate envelope check
      try {
        const [dupes] = await conn.query<RowDataPacket[]>(
          `SELECT id, envelope_status FROM settlement_execution_preparation_envelopes
           WHERE source_packet_id = ? AND city_code = ? AND id <> ?
             AND envelope_status IN ('frozen', 'approved_for_phase13_review')`,
          [envelope.source_packet_id, cityCode, envelopeId],
        );
        conflictCheckSnapshot.duplicate_check = {
          duplicate_count: dupes.length,
          duplicate_ids: dupes.map((d) => d.id),
        };
      } catch {
        conflictCheckSnapshot.duplicate_check = { error: "duplicate_check_failed" };
      }

      // 8. Compute item_hash from envelope items
      const [itemRows] = await conn.query<ItemRow[]>(
        `SELECT * FROM settlement_execution_preparation_items
         WHERE envelope_id = ? AND city_code = ? ORDER BY item_order ASC`,
        [envelopeId, cityCode],
      );
      const itemData = JSON.stringify(
        itemRows.map((i) => ({
          item_type: i.item_type,
          item_ref_id: i.item_ref_id,
          planned_action: i.planned_action,
          item_order: i.item_order,
        })),
      );
      const itemHash = createHash("sha256").update(itemData, "utf8").digest("hex");

      // 9. Update envelope to frozen with WHERE status guard (immutability)
      const now = new Date();
      const [updateResult] = await conn.query(
        `UPDATE settlement_execution_preparation_envelopes
         SET envelope_status = 'frozen',
             item_hash = ?,
             amount_snapshot_json = ?,
             city_config_snapshot_hash = ?,
             settlement_cycle_snapshot_hash = ?,
             conflict_check_snapshot_json = ?,
             frozen_by_admin_id = ?,
             frozen_at = ?,
             updated_at = ?
         WHERE id = ? AND ${clause} AND envelope_status = 'draft'`,
        [
          itemHash,
          JSON.stringify(amountSnapshot),
          cityConfigSnapshotHash,
          settlementCycleSnapshotHash,
          JSON.stringify(conflictCheckSnapshot),
          adminId,
          now,
          now,
          envelopeId,
          ...params,
        ],
      );

      if ((updateResult as { affectedRows: number }).affectedRows !== 1) {
        throw new Error("envelope not in draft status or concurrently modified");
      }

      // 10. Write audit event
      const auditId = genId("epa");
      await conn.query(
        `INSERT INTO settlement_execution_preparation_audit
         (id, city_code, envelope_id, event_type, event_timestamp,
          actor_admin_id, summary, trace_id)
         VALUES (?, ?, ?, 'envelope_frozen', ?, ?, ?, ?)`,
        [
          auditId,
          cityCode,
          envelopeId,
          now,
          adminId,
          `Envelope frozen with item_hash=${itemHash}, payload_hash=${envelope.payload_hash}`,
          traceId,
        ],
      );

      // 11. Return updated envelope
      const [updatedRows] = await conn.query<EnvelopeRow[]>(
        `SELECT * FROM settlement_execution_preparation_envelopes WHERE id = ?`,
        [envelopeId],
      );
      return mapEnvelope(updatedRows[0]);
    });
  }

  /**
   * Approve an envelope for Phase 13 review (F1, F4).
   * Wrapped in a transaction: SELECT envelope (verify frozen) → UPDATE with WHERE status guard →
   * INSERT audit → commit.
   */
  async approveEnvelope(
    ctx: RequestContext,
    envelopeId: string,
  ): Promise<PreparationEnvelope> {
    const cityCode = assertCityScopedContext(ctx);
    const traceId = ctx.traceId ?? null;
    const adminId = ctx.userId ?? null;

    return withTransaction(async (conn) => {
      const { clause, params } = buildCityScopedWhere(cityCode, "city_code");

      // 1. Load envelope
      const [rows] = await conn.query<EnvelopeRow[]>(
        `SELECT * FROM settlement_execution_preparation_envelopes
         WHERE id = ? AND ${clause}`,
        [envelopeId, ...params],
      );
      if (rows.length === 0) {
        throw new Error(`Envelope ${envelopeId} not found in city ${cityCode}`);
      }
      const envelope = rows[0];

      // 2. Verify frozen status
      if (envelope.envelope_status !== "frozen") {
        throw new Error(
          `Envelope ${envelopeId} status is '${envelope.envelope_status}', expected 'frozen' for approval`,
        );
      }

      // 3. Revalidate source readiness (F1.7)
      await this.validateSourceReadiness(
        conn,
        cityCode,
        envelope.source_packet_id,
      );

      // Compare current packet hash with stored
      const packet = await this.getReadinessPacket(conn, cityCode, envelope.source_packet_id);
      if (packet) {
        const currentPacketHash = computeSourcePacketHash(packet);
        if (currentPacketHash !== envelope.source_packet_hash) {
          throw new Error(
            `Source packet hash mismatch: current ${currentPacketHash} vs stored ${envelope.source_packet_hash}`,
          );
        }
      }

      // 4. Update to approved_for_phase13_review with WHERE status guard
      const now = new Date();
      const [updateResult] = await conn.query(
        `UPDATE settlement_execution_preparation_envelopes
         SET envelope_status = 'approved_for_phase13_review',
             approved_by_admin_id = ?,
             approved_at = ?,
             trace_id = COALESCE(trace_id, ?),
             updated_at = ?
         WHERE id = ? AND ${clause} AND envelope_status = 'frozen'`,
        [adminId, now, traceId, now, envelopeId, ...params],
      );

      if ((updateResult as { affectedRows: number }).affectedRows !== 1) {
        throw new Error("envelope not in frozen status or concurrently modified");
      }

      // 5. Write audit event
      const auditId = genId("epa");
      await conn.query(
        `INSERT INTO settlement_execution_preparation_audit
         (id, city_code, envelope_id, event_type, event_timestamp,
          actor_admin_id, summary, trace_id)
         VALUES (?, ?, ?, 'envelope_approved_for_phase13_review', ?, ?, ?, ?)`,
        [
          auditId,
          cityCode,
          envelopeId,
          now,
          adminId,
          `Envelope approved for Phase 13 review`,
          traceId,
        ],
      );

      // 6. Return updated envelope
      const [updatedRows] = await conn.query<EnvelopeRow[]>(
        `SELECT * FROM settlement_execution_preparation_envelopes WHERE id = ?`,
        [envelopeId],
      );
      return mapEnvelope(updatedRows[0]);
    });
  }

  /**
   * Get an envelope by ID (city-scoped).
   */
  async getEnvelope(
    ctx: RequestContext,
    envelopeId: string,
  ): Promise<PreparationEnvelope | null> {
    const cityCode = assertCityScopedContext(ctx);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const [rows] = await this.pool.query<EnvelopeRow[]>(
      `SELECT * FROM settlement_execution_preparation_envelopes
       WHERE id = ? AND ${clause}`,
      [envelopeId, ...params],
    );
    return rows.length === 0 ? null : mapEnvelope(rows[0]);
  }

  /**
   * List envelopes, optionally filtered by source packet (city-scoped).
   */
  async listEnvelopes(
    ctx: RequestContext,
    sourcePacketId?: string,
  ): Promise<PreparationEnvelope[]> {
    const cityCode = assertCityScopedContext(ctx);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const conds = [clause];
    const qp: unknown[] = [...params];
    if (sourcePacketId) {
      conds.push("source_packet_id = ?");
      qp.push(sourcePacketId);
    }
    const [rows] = await this.pool.query<EnvelopeRow[]>(
      `SELECT * FROM settlement_execution_preparation_envelopes
       WHERE ${conds.join(" AND ")}
       ORDER BY created_at DESC LIMIT 50`,
      qp,
    );
    return rows.map(mapEnvelope);
  }

  /**
   * Get envelope items (city-scoped).
   */
  async getEnvelopeItems(
    ctx: RequestContext,
    envelopeId: string,
  ): Promise<PreparationEnvelopeItem[]> {
    const cityCode = assertCityScopedContext(ctx);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    // Verify envelope exists in this city
    const [envRows] = await this.pool.query<EnvelopeRow[]>(
      `SELECT id FROM settlement_execution_preparation_envelopes
       WHERE id = ? AND ${clause}`,
      [envelopeId, ...params],
    );
    if (envRows.length === 0) {
      return [];
    }
    const [rows] = await this.pool.query<ItemRow[]>(
      `SELECT * FROM settlement_execution_preparation_items
       WHERE envelope_id = ? AND city_code = ?
       ORDER BY item_order ASC`,
      [envelopeId, cityCode],
    );
    return rows.map(mapItem);
  }

  /**
   * Get envelope audit trail (city-scoped).
   */
  async getEnvelopeAudit(
    ctx: RequestContext,
    envelopeId: string,
  ): Promise<PreparationEnvelopeAudit[]> {
    const cityCode = assertCityScopedContext(ctx);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    // Verify envelope exists in this city
    const [envRows] = await this.pool.query<EnvelopeRow[]>(
      `SELECT id FROM settlement_execution_preparation_envelopes
       WHERE id = ? AND ${clause}`,
      [envelopeId, ...params],
    );
    if (envRows.length === 0) {
      return [];
    }
    const [rows] = await this.pool.query<AuditRow[]>(
      `SELECT * FROM settlement_execution_preparation_audit
       WHERE envelope_id = ? AND city_code = ?
       ORDER BY event_timestamp ASC`,
      [envelopeId, cityCode],
    );
    return rows.map(mapAudit);
  }
}

export const envelopeService = new EnvelopeService();
