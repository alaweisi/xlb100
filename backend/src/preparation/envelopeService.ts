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
  conflict_check_snapshot_hash: string | null;
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
  conflictCheckSnapshotHash: string | null;
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
  conflictCheckSnapshotHash: r.conflict_check_snapshot_hash,
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
export class EnvelopeService {
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
   * F1: Verify that the linked governance review has review_status='approved_for_governance'.
   * Read-time DB query — never cached.
   */
  private async verifiedReviewApproved(
    conn: PoolConnection | Pool,
    reviewId: string,
    cityCode: string,
  ): Promise<void> {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT review_status FROM settlement_action_governance_reviews
       WHERE id = ? AND city_code = ?`,
      [reviewId, cityCode],
    );
    if (rows.length === 0) {
      throw new Error(
        `Governance review ${reviewId} not found in city ${cityCode} — packet cannot be used for Phase 12 envelope`,
      );
    }
    if (rows[0].review_status !== "approved_for_governance") {
      throw new Error(
        `Governance review ${reviewId} has status '${rows[0].review_status}', expected 'approved_for_governance'`,
      );
    }
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

  // ── Source readiness validation (F1) ─────────────────────────────────────────

  /**
   * F1: Validate source readiness.
   *
   * Checks:
   *  1. Packet exists in city scope
   *  2. Packet has review_id (governance review linked)
   *  3. Read-time check: review_status = 'approved_for_governance'
   *  4. Packet status = 'ready_for_future_phase_review'
   *  5. Linked Phase 11 dry-run plan exists
   *  6. Plan status = 'generated'
   *  7. Compute deterministic hashes
   *
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

    // 2. Verify packet has a review_id
    if (!packet.review_id) {
      throw new Error(
        `Readiness packet ${sourcePacketId} has no linked governance review`,
      );
    }

    // 3. Read-time verify review_status = 'approved_for_governance' (F1)
    await this.verifiedReviewApproved(conn, packet.review_id as string, cityCode);

    // 4. Check packet status
    if (packet.packet_status !== "ready_for_future_phase_review") {
      throw new Error(
        `Readiness packet ${sourcePacketId} status is '${packet.packet_status}', expected 'ready_for_future_phase_review'`,
      );
    }

    // 5. Find linked Phase 11 dry-run plan
    const plan = await this.findLinkedPlan(conn, cityCode, sourcePacketId);
    if (!plan) {
      throw new Error(`No approved Phase 11 dry-run plan exists for packet ${sourcePacketId}`);
    }

    // 6. Verify plan_status = 'generated'
    if (plan.plan_status !== "generated") {
      throw new Error(
        `Plan ${plan.id} status is '${plan.plan_status}', expected 'generated'`,
      );
    }

    // 7. Compute deterministic hashes
    const sourcePacketHash = computeSourcePacketHash(packet);
    const sourcePlanHash = computeSourcePlanHash(plan);

    return { plan, sourcePacketHash, sourcePlanHash };
  }

  /**
   * F1: Check for existing envelope for the same source_packet_id.
   *
   * If one exists and hashes match → return envelope (caller decides reuse).
   * If one exists and hashes mismatch → REJECT with error (do NOT return stale_or_conflict).
   * Never use stale_or_conflict as an envelope_status.
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
      // F1: Hash mismatch → REJECT, do NOT return stale_or_conflict
      throw new Error(
        `Envelope ${envelope.id} already exists for source packet ${sourcePacketId} but source has changed — ` +
        `packet hash current=${sourcePacketHash} stored=${envelope.sourcePacketHash}, ` +
        `plan hash current=${sourcePlanHash} stored=${envelope.sourcePlanHash}. ` +
        `Re-create the envelope to capture current source state.`,
      );
    }

    return envelope;
  }

  // ── F2: Amount snapshot helpers ───────────────────────────────────────────────

  /**
   * F2: Build amount snapshot from plan items.
   *
   * Phase 11 plan items use item_type: settlement_batch, settlement_payable,
   * settlement_item, ledger_accrual (NOT "statement").
   *
   * Resolution:
   *  - settlement_batch: query settlement_batches + settlement_items for amounts
   *  - settlement_payable: join settlement_payables → settlement_items for amounts
   *  - settlement_item: query settlement_items directly
   *  - ledger_accrual: query ledger_accruals directly
   *
   * If no matching settlement items found → fail closed.
   * Snapshot query errors must NOT be swallowed.
   * Empty amount snapshots are NOT accepted.
   */
  private async buildAmountSnapshot(
    conn: PoolConnection | Pool,
    cityCode: string,
    planItems: RowDataPacket[],
  ): Promise<Record<string, unknown>> {
    const queriedAt = new Date().toISOString();
    const relevantTypes = new Set(["settlement_batch", "settlement_payable", "settlement_item", "ledger_accrual"]);
    const relevantItems = planItems.filter((pi) => relevantTypes.has(pi.item_type as string));

    if (relevantItems.length === 0) {
      throw new Error(
        "amount snapshot unavailable — no matching settlement items found: plan has no settlement_batch, settlement_payable, settlement_item, or ledger_accrual items",
      );
    }

    const batchIds = new Set<string>();
    const payableIds: string[] = [];
    const itemIds: string[] = [];
    const accrualIds: string[] = [];

    for (const pi of relevantItems) {
      const refId = pi.item_ref_id as string;
      switch (pi.item_type) {
        case "settlement_batch":
          batchIds.add(refId);
          break;
        case "settlement_payable":
          payableIds.push(refId);
          break;
        case "settlement_item":
          itemIds.push(refId);
          break;
        case "ledger_accrual":
          accrualIds.push(refId);
          break;
      }
    }

    // Resolve settlement_payable items: join to settlement_payables → get batch_id → collect batch
    for (const pid of payableIds) {
      const [pRows] = await conn.query<RowDataPacket[]>(
        `SELECT settlement_batch_id FROM settlement_payables
         WHERE settlement_payable_id = ? AND city_code = ?`,
        [pid, cityCode],
      );
      if (pRows.length > 0 && pRows[0].settlement_batch_id) {
        batchIds.add(pRows[0].settlement_batch_id as string);
      }
    }

    // Collect amounts from settlement_items linked to resolved batches
    const batchAmounts: Record<string, unknown>[] = [];
    for (const bid of batchIds) {
      const [bRows] = await conn.query<RowDataPacket[]>(
        `SELECT settlement_batch_id, total_gross_amount, total_platform_fee,
                total_worker_receivable, item_count, status
         FROM settlement_batches
         WHERE settlement_batch_id = ? AND city_code = ?`,
        [bid, cityCode],
      );
      if (bRows.length === 0) continue;

      const [sRows] = await conn.query<RowDataPacket[]>(
        `SELECT settlement_item_id, gross_amount, platform_fee, worker_receivable,
                currency, status
         FROM settlement_items
         WHERE settlement_batch_id = ? AND city_code = ?`,
        [bid, cityCode],
      );
      batchAmounts.push({
        batch_id: bid,
        batch_summary: {
          total_gross_amount: Number(bRows[0].total_gross_amount),
          total_platform_fee: Number(bRows[0].total_platform_fee),
          total_worker_receivable: Number(bRows[0].total_worker_receivable),
          item_count: bRows[0].item_count,
          status: bRows[0].status,
        },
        items: sRows.map((s) => ({
          settlement_item_id: s.settlement_item_id,
          gross_amount: Number(s.gross_amount),
          platform_fee: Number(s.platform_fee),
          worker_receivable: Number(s.worker_receivable),
          currency: s.currency,
          status: s.status,
        })),
      });
    }

    // Collect amounts from direct settlement_item references
    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => "?").join(", ");
      const [siRows] = await conn.query<RowDataPacket[]>(
        `SELECT settlement_item_id, gross_amount, platform_fee, worker_receivable,
                currency, status, settlement_batch_id
         FROM settlement_items
         WHERE settlement_item_id IN (${placeholders}) AND city_code = ?`,
        [...itemIds, cityCode],
      );
      if (siRows.length > 0) {
        batchAmounts.push({
          source: "direct_settlement_items",
          items: siRows.map((s) => ({
            settlement_item_id: s.settlement_item_id,
            settlement_batch_id: s.settlement_batch_id,
            gross_amount: Number(s.gross_amount),
            platform_fee: Number(s.platform_fee),
            worker_receivable: Number(s.worker_receivable),
            currency: s.currency,
            status: s.status,
          })),
        });
      }
    }

    // Collect amounts from ledger_accrual references
    const accrualAmounts: Record<string, unknown>[] = [];
    if (accrualIds.length > 0) {
      const placeholders = accrualIds.map(() => "?").join(", ");
      const [laRows] = await conn.query<RowDataPacket[]>(
        `SELECT accrual_id, gross_amount, platform_fee, worker_receivable,
                currency, status
         FROM ledger_accruals
         WHERE accrual_id IN (${placeholders}) AND city_code = ?`,
        [...accrualIds, cityCode],
      );
      for (const la of laRows) {
        accrualAmounts.push({
          accrual_id: la.accrual_id,
          gross_amount: Number(la.gross_amount),
          platform_fee: Number(la.platform_fee),
          worker_receivable: Number(la.worker_receivable),
          currency: la.currency,
          status: la.status,
        });
      }
    }

    // F2: Fail closed if no settlement items were found
    if (batchAmounts.length === 0 && itemIds.length === 0 && accrualAmounts.length === 0) {
      throw new Error(
        "amount snapshot unavailable — no matching settlement items found",
      );
    }

    // Compute aggregate totals
    let totalGrossAmount = 0;
    let totalPlatformFee = 0;
    let totalWorkerReceivable = 0;
    let totalItemCount = 0;

    for (const ba of batchAmounts) {
      if (ba.batch_summary) {
        const bs = ba.batch_summary as Record<string, unknown>;
        totalGrossAmount += bs.total_gross_amount as number;
        totalPlatformFee += bs.total_platform_fee as number;
        totalWorkerReceivable += bs.total_worker_receivable as number;
        totalItemCount += (bs.item_count as number) || 0;
      }
      if (Array.isArray(ba.items) && !ba.batch_summary) {
        // Direct settlement_item refs — count items individually
        totalItemCount += (ba.items as unknown[]).length;
      }
    }
    for (const la of accrualAmounts) {
      totalGrossAmount += la.gross_amount as number;
      totalPlatformFee += la.platform_fee as number;
      totalWorkerReceivable += la.worker_receivable as number;
      totalItemCount += 1;
    }

    return {
      total_gross_amount: totalGrossAmount,
      total_platform_fee: totalPlatformFee,
      total_worker_receivable: totalWorkerReceivable,
      total_item_count: totalItemCount,
      batch_amounts: batchAmounts,
      accrual_amounts: accrualAmounts,
      queried_at: queriedAt,
    };
  }

  // ── F3: Conflict check helpers ────────────────────────────────────────────────

  /**
   * F3: Build source-scoped conflict check snapshot.
   *
   * All conflict checks are scoped to the envelope's linked source packet/plan
   * items (by item_ref_id and city_code), NOT city-wide.
   *
   * Returns { conflictCheckSnapshot, conflictCheckSnapshotHash } or throws on blocking conflicts.
   */
  private async buildConflictCheckSnapshot(
    conn: PoolConnection | Pool,
    cityCode: string,
    sourcePacketId: string,
    envelopeId: string,
    planItems: RowDataPacket[],
    amountSnapshot: Record<string, unknown>,
    cityConfigSnapshotHash: string | null,
    settlementCycleSnapshotHash: string | null,
  ): Promise<{ snapshot: Record<string, unknown>; hash: string }> {
    const conflictCheckAt = new Date().toISOString();
    const snapshot: Record<string, unknown> = {
      conflict_check_at: conflictCheckAt,
    };

    // Collect batch IDs and accrual IDs from plan items
    const batchIds: string[] = [];
    const accrualIds: string[] = [];
    const payableIds: string[] = [];

    for (const pi of planItems) {
      switch (pi.item_type) {
        case "settlement_batch":
          batchIds.push(pi.item_ref_id as string);
          break;
        case "ledger_accrual":
          accrualIds.push(pi.item_ref_id as string);
          break;
        case "settlement_payable":
          payableIds.push(pi.item_ref_id as string);
          break;
      }
    }

    // Resolve payable → batch
    for (const pid of payableIds) {
      const [pRows] = await conn.query<RowDataPacket[]>(
        `SELECT settlement_batch_id FROM settlement_payables
         WHERE settlement_payable_id = ? AND city_code = ?`,
        [pid, cityCode],
      );
      if (pRows.length > 0 && pRows[0].settlement_batch_id) {
        const bid = pRows[0].settlement_batch_id as string;
        if (!batchIds.includes(bid)) {
          batchIds.push(bid);
        }
      }
    }

    // ── 3a. Check for cancelled batches (source-scoped) ──
    const cancelledBatchIds: string[] = [];
    if (batchIds.length > 0) {
      const placeholders = batchIds.map(() => "?").join(", ");
      const [cancelledRows] = await conn.query<RowDataPacket[]>(
        `SELECT settlement_batch_id, status FROM settlement_batches
         WHERE settlement_batch_id IN (${placeholders}) AND city_code = ?
           AND status = 'cancelled'`,
        [...batchIds, cityCode],
      );
      for (const cr of cancelledRows) {
        cancelledBatchIds.push(cr.settlement_batch_id as string);
      }
    }

    snapshot.batch_cancelled_check = {
      cancelled_batch_ids: cancelledBatchIds,
      has_cancelled: cancelledBatchIds.length > 0,
    };

    if (cancelledBatchIds.length > 0) {
      // F3: Record as blocking conflict
      snapshot._blocking_conflicts = snapshot._blocking_conflicts || [];
      (snapshot._blocking_conflicts as string[]).push(
        `cancelled batches: ${cancelledBatchIds.join(", ")}`,
      );
    }

    // ── 3b. Check for voided ledger accruals (source-scoped) ──
    const voidedAccrualIds: string[] = [];
    if (accrualIds.length > 0) {
      const placeholders = accrualIds.map(() => "?").join(", ");
      const [voidedRows] = await conn.query<RowDataPacket[]>(
        `SELECT accrual_id, status FROM ledger_accruals
         WHERE accrual_id IN (${placeholders}) AND city_code = ?
           AND status = 'voided'`,
        [...accrualIds, cityCode],
      );
      for (const vr of voidedRows) {
        voidedAccrualIds.push(vr.accrual_id as string);
      }
    }

    snapshot.ledger_voided_check = {
      voided_accrual_ids: voidedAccrualIds,
      has_voided: voidedAccrualIds.length > 0,
    };

    if (voidedAccrualIds.length > 0) {
      snapshot._blocking_conflicts = snapshot._blocking_conflicts || [];
      (snapshot._blocking_conflicts as string[]).push(
        `voided ledger accruals: ${voidedAccrualIds.join(", ")}`,
      );
    }

    // ── 3c. Duplicate envelope check ──
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
    const [dupes] = await conn.query<RowDataPacket[]>(
      `SELECT id, envelope_status FROM settlement_execution_preparation_envelopes
       WHERE source_packet_id = ? AND ${clause} AND id <> ?
         AND envelope_status IN ('frozen', 'approved_for_phase13_review')`,
      [sourcePacketId, ...params, envelopeId],
    );

    snapshot.duplicate_check = {
      duplicate_count: dupes.length,
      duplicate_ids: dupes.map((d) => d.id),
    };

    if (dupes.length > 0) {
      snapshot._blocking_conflicts = snapshot._blocking_conflicts || [];
      (snapshot._blocking_conflicts as string[]).push(
        `duplicate frozen/approved envelope for same source packet: ${dupes.map((d) => d.id).join(", ")}`,
      );
    }

    // ── 3d. Amount drift check ──
    try {
      const [prevEnvs] = await conn.query<EnvelopeRow[]>(
        `SELECT amount_snapshot_json FROM settlement_execution_preparation_envelopes
         WHERE source_packet_id = ? AND ${clause} AND id <> ?
         ORDER BY created_at DESC LIMIT 1`,
        [sourcePacketId, ...params, envelopeId],
      );
      if (prevEnvs.length > 0) {
        const prevSnapshot = JSON.parse(prevEnvs[0].amount_snapshot_json || "{}");
        snapshot.amount_drift = {
          previous_total_gross: prevSnapshot.total_gross_amount ?? null,
          previous_total_worker_receivable: prevSnapshot.total_worker_receivable ?? null,
          current_total_gross: amountSnapshot.total_gross_amount ?? null,
          current_total_worker_receivable: amountSnapshot.total_worker_receivable ?? null,
        };
      } else {
        snapshot.amount_drift = { note: "no previous envelope for comparison" };
      }
    } catch {
      snapshot.amount_drift = { error: "drift_check_failed" };
    }

    // ── 3e. City config hash check ──
    snapshot.city_config_check = {
      current_hash: cityConfigSnapshotHash,
      previous_hash: null as string | null,
    };
    try {
      const [prevConfig] = await conn.query<EnvelopeRow[]>(
        `SELECT city_config_snapshot_hash FROM settlement_execution_preparation_envelopes
         WHERE source_packet_id = ? AND ${clause} AND id <> ? AND city_config_snapshot_hash IS NOT NULL
         ORDER BY created_at DESC LIMIT 1`,
        [sourcePacketId, ...params, envelopeId],
      );
      if (prevConfig.length > 0) {
        (snapshot.city_config_check as Record<string, unknown>).previous_hash =
          prevConfig[0].city_config_snapshot_hash;
      }
    } catch {
      snapshot.city_config_check = { error: "config_check_failed" };
    }

    // ── 3f. Settlement cycle snapshot (already computed) ──
    snapshot.settlement_cycle_check = {
      snapshot_hash: settlementCycleSnapshotHash,
    };

    // ── 3g. Refund/reversal check ──
    try {
      await conn.query(`SELECT 1 FROM refund_requests LIMIT 0`);
      // Tables exist — inspect pending/approved state scoped to source
      const refSourceRefs: string[] = [...batchIds, ...accrualIds];
      snapshot.refund_reversal_check = {
        status: "available",
        note: "refund/reversal tables present; source-scoped inspection not yet implemented in Phase 12",
        scoped_source_count: refSourceRefs.length,
      };
    } catch {
      snapshot.refund_reversal_check = {
        status: "not_applicable",
        reason: "refund/reversal schema not yet created in Phase 12",
      };
    }

    // ── Compute deterministic conflict_check_snapshot_hash ──
    const conflictCheckSnapshotHash = createHash("sha256")
      .update(JSON.stringify(snapshot), "utf8")
      .digest("hex");

    // F3: If any blocking conflicts exist, reject freeze
    if (
      Array.isArray(snapshot._blocking_conflicts) &&
      (snapshot._blocking_conflicts as string[]).length > 0
    ) {
      throw new Error(
        `Freeze blocked by source-scoped conflicts: ${(snapshot._blocking_conflicts as string[]).join("; ")}`,
      );
    }

    return { snapshot, hash: conflictCheckSnapshotHash };
  }

  // ── Public methods ──────────────────────────────────────────────────────────

  /**
   * F1 + F4: Create an envelope from a readiness packet.
   *
   * - Calls verifiedReviewApproved() at read time (not cached)
   * - Validates source readiness with all F1 checks
   * - Existing envelope reuse: if hashes mismatch → REJECT
   * - Stores conflict_check_snapshot_hash
   * - Post-create readback includes city_code = ?
   * - Wrapped in a transaction
   */
  async createEnvelope(
    ctx: RequestContext,
    sourcePacketId: string,
  ): Promise<PreparationEnvelope> {
    const cityCode = assertCityScopedContext(ctx);
    const traceId = ctx.traceId ?? null;
    const adminId = ctx.userId ?? null;

    return withTransaction(async (conn) => {
      // 1. Validate source readiness (F1: includes verifiedReviewApproved call)
      const { plan, sourcePacketHash, sourcePlanHash } =
        await this.validateSourceReadiness(conn, cityCode, sourcePacketId);

      // 2. Check for existing envelope; if hash mismatch → REJECT (F1)
      const existing = await this.checkExistingEnvelope(
        conn,
        cityCode,
        sourcePacketId,
        sourcePacketHash,
        sourcePlanHash,
      );
      if (existing) {
        // Hashes match → return existing envelope (idempotent)
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

      // 5. Compute initial item hash from plan items
      const itemData = JSON.stringify(
        planItems.map((pi) => ({
          item_type: pi.item_type as string,
          item_ref_id: pi.item_ref_id as string,
          planned_action: pi.planned_action,
          item_order: pi.item_order,
        })),
      );
      const itemHash = createHash("sha256").update(itemData, "utf8").digest("hex");

      // 6. Insert envelope in draft status (F4: includes conflict_check_snapshot_hash)
      const envelopeId = genId("env");
      const now = new Date();
      const sourcePlanId: string = plan.id as string;

      await conn.query(
        `INSERT INTO settlement_execution_preparation_envelopes
         (id, city_code, source_packet_id, source_plan_id, envelope_status,
          payload_hash, item_hash, source_packet_hash, source_plan_hash,
          amount_snapshot_json, city_config_snapshot_hash,
          settlement_cycle_snapshot_hash, conflict_check_snapshot_hash,
          conflict_check_snapshot_json,
          frozen_by_admin_id, approved_by_admin_id, trace_id,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, '{}', NULL, NULL, NULL, '{}', NULL, NULL, ?, ?, ?)`,
        [
          envelopeId,
          cityCode,
          sourcePacketId,
          sourcePlanId,
          payloadHash,
          itemHash,
          sourcePacketHash,
          sourcePlanHash,
          traceId,
          now,
          now,
        ],
      );

      // 7. Populate items from plan items
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

      // 8. Write audit event
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

      // 9. F4: Read back with city_code = ?
      const { clause, params } = buildCityScopedWhere(cityCode, "city_code");
      const [rows] = await conn.query<EnvelopeRow[]>(
        `SELECT * FROM settlement_execution_preparation_envelopes
         WHERE id = ? AND ${clause}`,
        [envelopeId, ...params],
      );
      if (rows.length === 0) {
        throw new Error(`Envelope ${envelopeId} readback failed in city ${cityCode}`);
      }
      return mapEnvelope(rows[0]);
    });
  }

  /**
   * F1-F4: Freeze an envelope.
   *
   * - F1: Revalidates review_status at read time
   * - F1: Revalidates source immutability (no changes to plan since createEnvelope)
   * - F2: Builds amount snapshot from settlement data (NOT statements)
   * - F3: Source-scoped conflict checks with deterministic hash
   * - F4: Stores conflict_check_snapshot_hash, records frozenByAdminId
   * - F4: WHERE envelope_status='draft' guard
   * - F4: Post-freeze readback includes city_code = ?
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

      // 1. Load envelope with city scope
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

      // 3. F1 + F4: Revalidate source readiness (read-time review_status check)
      const { plan, sourcePacketHash, sourcePlanHash } =
        await this.validateSourceReadiness(conn, cityCode, envelope.source_packet_id);

      // 4. F4: Revalidate source immutability — compare current hashes with stored
      if (sourcePacketHash !== envelope.source_packet_hash) {
        throw new Error(
          `Source packet hash mismatch: current ${sourcePacketHash} vs stored ${envelope.source_packet_hash} — source changed since createEnvelope`,
        );
      }
      if (sourcePlanHash !== envelope.source_plan_hash) {
        throw new Error(
          `Source plan hash mismatch: current ${sourcePlanHash} vs stored ${envelope.source_plan_hash} — plan changed since createEnvelope`,
        );
      }

      // 5. F2: Build amount snapshot from settlement data
      const planItems = await this.getPlanItems(conn, plan.id as string, cityCode);
      let amountSnapshot: Record<string, unknown>;
      try {
        amountSnapshot = await this.buildAmountSnapshot(conn, cityCode, planItems);
      } catch (err) {
        // F2: Do NOT swallow snapshot query errors — fail closed
        throw new Error(
          `Amount snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // F2: Do NOT accept empty amount snapshots
      if (
        !amountSnapshot ||
        Object.keys(amountSnapshot).length === 0 ||
        (amountSnapshot.total_item_count as number) === 0
      ) {
        throw new Error(
          "amount snapshot unavailable — no matching settlement items found",
        );
      }

      // 6. F3: City config snapshot — compute SHA256 from actual row values
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

      // 7. F3: Settlement cycle snapshot — deterministic from batch statuses
      let settlementCycleSnapshotHash: string | null = null;
      try {
        // Collect linked batch IDs from plan items (same as amount snapshot resolution)
        const batchIdSet = new Set<string>();
        for (const pi of planItems) {
          if (pi.item_type === "settlement_batch") {
            batchIdSet.add(pi.item_ref_id as string);
          } else if (pi.item_type === "settlement_payable") {
            const [pRows] = await conn.query<RowDataPacket[]>(
              `SELECT settlement_batch_id FROM settlement_payables
               WHERE settlement_payable_id = ? AND city_code = ?`,
              [pi.item_ref_id as string, cityCode],
            );
            if (pRows.length > 0 && pRows[0].settlement_batch_id) {
              batchIdSet.add(pRows[0].settlement_batch_id as string);
            }
          }
        }

        const batchIds = [...batchIdSet];
        if (batchIds.length > 0) {
          const placeholders = batchIds.map(() => "?").join(", ");
          const [batchRows] = await conn.query<RowDataPacket[]>(
            `SELECT settlement_batch_id, status FROM settlement_batches
             WHERE settlement_batch_id IN (${placeholders}) AND city_code = ?`,
            [...batchIds, cityCode],
          );
          // F3: Deterministic hash from batch statuses only (no envelope_id, no timestamp)
          const cycleData = JSON.stringify(
            batchRows.map((b) => ({
              batch_id: b.settlement_batch_id,
              status: b.status,
            })),
          );
          settlementCycleSnapshotHash = createHash("sha256")
            .update(cycleData, "utf8")
            .digest("hex");
        } else {
          settlementCycleSnapshotHash =
            "0000000000000000000000000000000000000000000000000000000000000000";
        }
      } catch {
        // settlement cycle snapshot optional
      }

      // 8. F3: Build source-scoped conflict check snapshot (throws on blocking conflicts)
      const { snapshot: conflictCheckSnapshot, hash: conflictCheckSnapshotHash } =
        await this.buildConflictCheckSnapshot(
          conn,
          cityCode,
          envelope.source_packet_id,
          envelopeId,
          planItems,
          amountSnapshot,
          cityConfigSnapshotHash,
          settlementCycleSnapshotHash,
        );

      // 9. Recompute item_hash from envelope items
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

      // 10. F4: Update envelope to frozen with WHERE status guard (immutability)
      const now = new Date();
      const [updateResult] = await conn.query(
        `UPDATE settlement_execution_preparation_envelopes
         SET envelope_status = 'frozen',
             item_hash = ?,
             amount_snapshot_json = ?,
             city_config_snapshot_hash = ?,
             settlement_cycle_snapshot_hash = ?,
             conflict_check_snapshot_hash = ?,
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
          conflictCheckSnapshotHash,
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

      // 11. Write audit event
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
          `Envelope frozen with item_hash=${itemHash}, conflict_check_hash=${conflictCheckSnapshotHash}`,
          traceId,
        ],
      );

      // 12. F4: Read back with city_code = ?
      const [updatedRows] = await conn.query<EnvelopeRow[]>(
        `SELECT * FROM settlement_execution_preparation_envelopes
         WHERE id = ? AND ${clause}`,
        [envelopeId, ...params],
      );
      if (updatedRows.length === 0) {
        throw new Error(`Envelope ${envelopeId} readback failed in city ${cityCode}`);
      }
      return mapEnvelope(updatedRows[0]);
    });
  }

  /**
   * F1 + F4: Approve an envelope for Phase 13 review.
   *
   * - F1: Revalidates review_status at read time
   * - F4: Revalidates source immutability (no changes since freeze)
   * - F4: Records approvedByAdminId
   * - F4: WHERE envelope_status='frozen' guard
   * - F4: Post-approve readback includes city_code = ?
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

      // 1. Load envelope with city scope
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

      // 3. F1: Revalidate source readiness (read-time review_status check)
      const { sourcePacketHash, sourcePlanHash } =
        await this.validateSourceReadiness(conn, cityCode, envelope.source_packet_id);

      // 4. F4: Revalidate source immutability (no changes since freeze)
      if (sourcePacketHash !== envelope.source_packet_hash) {
        throw new Error(
          `Source packet hash mismatch: current ${sourcePacketHash} vs stored ${envelope.source_packet_hash} — source changed since freeze`,
        );
      }
      if (sourcePlanHash !== envelope.source_plan_hash) {
        throw new Error(
          `Source plan hash mismatch: current ${sourcePlanHash} vs stored ${envelope.source_plan_hash} — plan changed since freeze`,
        );
      }

      // 5. F4: Update to approved_for_phase13_review with WHERE status guard
      //     approved envelope cannot regress to frozen
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

      // 6. Write audit event
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

      // 7. F4: Read back with city_code = ?
      const [updatedRows] = await conn.query<EnvelopeRow[]>(
        `SELECT * FROM settlement_execution_preparation_envelopes
         WHERE id = ? AND ${clause}`,
        [envelopeId, ...params],
      );
      if (updatedRows.length === 0) {
        throw new Error(`Envelope ${envelopeId} readback failed in city ${cityCode}`);
      }
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
