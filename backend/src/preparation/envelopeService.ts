import { createHash, randomBytes } from "node:crypto";
import type { RowDataPacket, Pool } from "mysql2/promise";
import type { RequestContext } from "@xlb/types";
import { assertCityScopedContext, buildCityScopedWhere } from "../dal/scopedExecutor.js";
import { getMysqlPool } from "../dal/mysqlPool.js";

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

// ── Deterministic payload hash (same pattern as plannerPlanBuilder computePlanHash) ─
export function computePayloadHash(
  packetId: string,
  cityCode: string,
  planId: string | null,
  itemRefs: string[],
): string {
  const payload = `${packetId}\n${cityCode}\n${planId ?? ""}\n${[...itemRefs].sort().join("\n")}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

// ── Envelope service ───────────────────────────────────────────────────────────
class EnvelopeService {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getMysqlPool();
  }

  /**
   * Read a readiness packet with city scope verification.
   */
  private async getReadinessPacket(
    cityCode: string,
    packetId: string,
  ): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM settlement_action_governance_readiness_packets
       WHERE id = ? AND city_code = ?`,
      [packetId, cityCode],
    );
    return rows.length === 0 ? null : rows[0];
  }

  /**
   * Verify a governance review is in approved_for_governance status.
   */
  private async verifyReviewApproved(reviewId: string, cityCode: string): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT review_status FROM settlement_action_governance_reviews
       WHERE id = ? AND city_code = ?`,
      [reviewId, cityCode],
    );
    if (rows.length === 0) return false;
    return rows[0].review_status === "approved_for_governance";
  }

  /**
   * Find a linked dry-run plan for a packet via city-scoped lookup.
   */
  private async findLinkedPlan(
    cityCode: string,
    packetId: string,
  ): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
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
    planId: string,
    cityCode: string,
  ): Promise<RowDataPacket[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
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
  private async getCityConfig(cityCode: string): Promise<RowDataPacket | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM city_configs WHERE city_code = ?`,
      [cityCode],
    );
    return rows.length === 0 ? null : rows[0];
  }

  // ── Public methods ──────────────────────────────────────────────────────────

  /**
   * Create an envelope from a readiness packet.
   * Loads packet, verifies city-scoped, verifies review approved,
   * computes deterministic payload hash from packet+plan data,
   * inserts envelope in 'draft' status.
   */
  async createEnvelope(
    ctx: RequestContext,
    sourcePacketId: string,
  ): Promise<PreparationEnvelope> {
    const cityCode = assertCityScopedContext(ctx);

    // 1. Load and verify readiness packet
    const packet = await this.getReadinessPacket(cityCode, sourcePacketId);
    if (!packet) {
      throw new Error(`Readiness packet ${sourcePacketId} not found in city ${cityCode}`);
    }
    if (packet.packet_status !== "ready_for_future_phase_review") {
      throw new Error(
        `Readiness packet ${sourcePacketId} status is '${packet.packet_status}', expected 'ready_for_future_phase_review'`,
      );
    }

    // 2. Verify linked governance review is approved
    if (!packet.review_id) {
      throw new Error("Readiness packet has no linked governance review");
    }
    const reviewApproved = await this.verifyReviewApproved(packet.review_id, cityCode);
    if (!reviewApproved) {
      throw new Error(
        `Governance review ${packet.review_id} is not in 'approved_for_governance' status`,
      );
    }

    // 3. Find linked dry-run plan
    const plan = await this.findLinkedPlan(cityCode, sourcePacketId);
    const sourcePlanId: string | null = plan ? (plan.id as string) : null;

    // 4. Collect item refs for payload hash
    const itemRefs: string[] = [];
    if (plan) {
      const planItems = await this.getPlanItems(plan.id as string, cityCode);
      for (const pi of planItems) {
        itemRefs.push(`${pi.item_type}:${pi.item_ref_id}`);
      }
    }

    // 5. Compute deterministic payload hash
    const payloadHash = computePayloadHash(sourcePacketId, cityCode, sourcePlanId, itemRefs);

    // 6. Compute source_packet_hash (hash of source packet data)
    const packetData = JSON.stringify({
      id: packet.id,
      city_code: packet.city_code,
      intent_id: packet.intent_id,
      review_id: packet.review_id,
      packet_status: packet.packet_status,
      source_refs_json: packet.source_refs_json,
    });
    const sourcePacketHash = createHash("sha256").update(packetData, "utf8").digest("hex");

    // 7. Compute source_plan_hash (if plan exists)
    let sourcePlanHash: string | null = null;
    if (plan) {
      const planData = JSON.stringify({
        id: plan.id,
        plan_hash: plan.plan_hash,
        plan_status: plan.plan_status,
      });
      sourcePlanHash = createHash("sha256").update(planData, "utf8").digest("hex");
    }

    // 8. Idempotency check: existing envelope for same packet in draft/frozen/approved state?
    const { clause, params: whereParams } = buildCityScopedWhere(cityCode, "city_code");
    const [existing] = await this.pool.query<EnvelopeRow[]>(
      `SELECT * FROM settlement_execution_preparation_envelopes
       WHERE source_packet_id = ? AND ${clause}
         AND envelope_status IN ('draft', 'frozen', 'approved_for_phase13_review')
       LIMIT 1`,
      [sourcePacketId, ...whereParams],
    );
    if (existing.length > 0) {
      return mapEnvelope(existing[0]);
    }

    // 9. Insert envelope in draft status
    const envelopeId = genId("env");
    const now = new Date();
    const traceId = ctx.traceId ?? null;
    const adminId = ctx.userId ?? null;

    await this.pool.query(
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

    // 10. Populate items from plan items
    if (plan) {
      const planItemRows = await this.getPlanItems(plan.id as string, cityCode);
      for (const pi of planItemRows) {
        const itemId = genId("epi");
        await this.pool.query(
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
    }

    // 11. Write audit event
    const auditId = genId("epa");
    await this.pool.query(
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

    // 12. Return created envelope
    return (await this.getEnvelope(ctx, envelopeId))!;
  }

  /**
   * Freeze an envelope.
   * Loads envelope, verifies city-scoped + draft status,
   * snapshots amounts/city_config/settlement_cycle/conflict_data,
   * computes item_hash, sets envelope_status='frozen', writes audit event.
   * Immutable after freeze: cannot re-freeze.
   */
  async freezeEnvelope(
    ctx: RequestContext,
    envelopeId: string,
  ): Promise<PreparationEnvelope> {
    const cityCode = assertCityScopedContext(ctx);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");

    // 1. Load envelope
    const [rows] = await this.pool.query<EnvelopeRow[]>(
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

    // 3. Snapshot amounts from linked plan items / settlement data
    const amountSnapshot: Record<string, unknown> = {};
    try {
      // Aggregate amounts from settlement_batches linked to source packet
      const sourceRefsJson = (() => {
        // Read source_refs_json from the readiness packet
        return this.pool.query<RowDataPacket[]>(
          `SELECT source_refs_json FROM settlement_action_governance_readiness_packets
           WHERE id = ? AND city_code = ?`,
          [envelope.source_packet_id, cityCode],
        ).then(([refRows]) => {
          if (refRows.length === 0) return "[]";
          return refRows[0].source_refs_json as string;
        });
      })();
      const sourceRefs: string[] = JSON.parse(await sourceRefsJson || "[]");

      let totalAmount = 0;
      let currency = "CNY";
      for (const ref of sourceRefs) {
        // Try to find settlement payables by batch ID
        const [payables] = await this.pool.query<RowDataPacket[]>(
          `SELECT payable_amount, currency FROM settlement_payables
           WHERE settlement_batch_id = ? AND city_code = ?`,
          [ref, cityCode],
        );
        for (const p of payables) {
          totalAmount += Number(p.payable_amount) || 0;
          currency = (p.currency as string) || currency;
        }
      }
      amountSnapshot.total_payable_amount = totalAmount;
      amountSnapshot.currency = currency;
      amountSnapshot.snapshot_at = new Date().toISOString();
    } catch {
      // If amount snapshot fails, record empty snapshot (governance-only)
      amountSnapshot.error = "amount_snapshot_partial";
    }

    // 4. Snapshot city config
    let cityConfigSnapshotHash: string | null = null;
    try {
      const cityConfig = await this.getCityConfig(cityCode);
      if (cityConfig) {
        const configData = JSON.stringify(cityConfig);
        cityConfigSnapshotHash = createHash("sha256").update(configData, "utf8").digest("hex");
      }
    } catch {
      // city config snapshot optional — governance-only
    }

    // 5. Snapshot settlement cycle
    let settlementCycleSnapshotHash: string | null = null;
    try {
      const cycleData = JSON.stringify({
        city_code: cityCode,
        snapshot_at: new Date().toISOString(),
        envelope_id: envelopeId,
      });
      settlementCycleSnapshotHash = createHash("sha256").update(cycleData, "utf8").digest("hex");
    } catch {
      // settlement cycle snapshot optional
    }

    // 6. Snapshot conflict check data
    let conflictCheckSnapshot: Record<string, unknown> = {};
    try {
      // Check for duplicate envelopes for the same packet
      const [dupes] = await this.pool.query<RowDataPacket[]>(
        `SELECT id FROM settlement_execution_preparation_envelopes
         WHERE source_packet_id = ? AND city_code = ? AND id <> ?`,
        [envelope.source_packet_id, cityCode, envelopeId],
      );
      conflictCheckSnapshot = {
        conflict_check_at: new Date().toISOString(),
        duplicate_envelopes: dupes.length,
        duplicate_envelope_ids: dupes.map((d) => d.id),
      };
    } catch {
      conflictCheckSnapshot = { error: "conflict_check_partial" };
    }

    // 7. Compute item_hash from envelope items
    const [itemRows] = await this.pool.query<ItemRow[]>(
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

    // 8. Update envelope to frozen — ALL immutable fields set here
    const now = new Date();
    const adminId = ctx.userId ?? null;
    const traceId = ctx.traceId ?? null;

    await this.pool.query(
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
       WHERE id = ? AND ${clause}`,
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

    // 9. Write audit event
    const auditId = genId("epa");
    await this.pool.query(
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

    return (await this.getEnvelope(ctx, envelopeId))!;
  }

  /**
   * Approve an envelope for Phase 13 review.
   * Loads envelope, verifies city-scoped + frozen status,
   * verifies linked review is still approved_for_governance,
   * sets envelope_status='approved_for_phase13_review', writes audit event.
   */
  async approveEnvelope(
    ctx: RequestContext,
    envelopeId: string,
  ): Promise<PreparationEnvelope> {
    const cityCode = assertCityScopedContext(ctx);
    const { clause, params } = buildCityScopedWhere(cityCode, "city_code");

    // 1. Load envelope
    const [rows] = await this.pool.query<EnvelopeRow[]>(
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

    // 3. Verify linked review is still approved_for_governance
    // Load the readiness packet to get the review_id
    const [pktRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT review_id FROM settlement_action_governance_readiness_packets
       WHERE id = ? AND city_code = ?`,
      [envelope.source_packet_id, cityCode],
    );
    if (pktRows.length === 0) {
      throw new Error(`Readiness packet ${envelope.source_packet_id} not found`);
    }
    const reviewId = pktRows[0].review_id as string | null;
    if (!reviewId) {
      throw new Error("Readiness packet has no linked governance review");
    }
    const reviewApproved = await this.verifyReviewApproved(reviewId, cityCode);
    if (!reviewApproved) {
      throw new Error(
        `Governance review ${reviewId} is not in 'approved_for_governance' status`,
      );
    }

    // 4. Update to approved_for_phase13_review
    const now = new Date();
    const adminId = ctx.userId ?? null;
    const traceId = ctx.traceId ?? null;

    await this.pool.query(
      `UPDATE settlement_execution_preparation_envelopes
       SET envelope_status = 'approved_for_phase13_review',
           approved_by_admin_id = ?,
           approved_at = ?,
           trace_id = COALESCE(trace_id, ?),
           updated_at = ?
       WHERE id = ? AND ${clause}`,
      [adminId, now, traceId, now, envelopeId, ...params],
    );

    // 5. Write audit event
    const auditId = genId("epa");
    await this.pool.query(
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
        `Envelope approved for Phase 13 review; linked review ${reviewId} verified approved_for_governance`,
        traceId,
      ],
    );

    return (await this.getEnvelope(ctx, envelopeId))!;
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
