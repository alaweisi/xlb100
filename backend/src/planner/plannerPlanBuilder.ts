import { createHash } from "node:crypto";
import type { RowDataPacket, Pool } from "mysql2/promise";
import { randomBytes } from "node:crypto";
import type { RequestContext } from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { getMysqlPool } from "../dal/mysqlPool.js";

// ── ID generation ────────────────────────────────────────────────────────────
const genId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;

// ── Row type helpers ─────────────────────────────────────────────────────────
type PlanRow = RowDataPacket & {
  id: string; city_code: string; readiness_packet_id: string;
  governance_intent_id: string | null; governance_review_id: string | null;
  plan_status: string; plan_hash: string; source_refs_json: string;
  created_by_admin_id: string | null; trace_id: string | null;
  created_at: Date; updated_at: Date;
};

type PlanItemRow = RowDataPacket & {
  id: string; city_code: string; plan_id: string;
  item_type: string; item_ref_id: string;
  planned_action: string | null; item_order: number | null;
  created_at: Date;
};

interface PlanItemInsert {
  id: string; city_code: string; plan_id: string;
  item_type: string; item_ref_id: string;
  planned_action: string | null; item_order: number | null;
  created_at: Date;
}

type AuditRow = RowDataPacket & {
  id: string; city_code: string; plan_id: string;
  event_type: string; event_timestamp: Date;
  actor_admin_id: string | null; summary: string | null;
};

export interface DryRunPlan {
  id: string; cityCode: string; readinessPacketId: string;
  governanceIntentId: string | null; governanceReviewId: string | null;
  planStatus: string; planHash: string; sourceRefs: string[];
  createdByAdminId: string | null; traceId: string | null;
  createdAt: string; updatedAt: string;
}

export interface DryRunPlanItem {
  id: string; cityCode: string; planId: string;
  itemType: string; itemRefId: string;
  plannedAction: string | null; itemOrder: number | null;
  createdAt: string;
}

export interface DryRunPlanAudit {
  id: string; cityCode: string; planId: string;
  eventType: string; eventTimestamp: string;
  actorAdminId: string | null; summary: string | null;
}

// ── Row mappers ──────────────────────────────────────────────────────────────
const mapPlan = (r: PlanRow): DryRunPlan => ({
  id: r.id, cityCode: r.city_code, readinessPacketId: r.readiness_packet_id,
  governanceIntentId: r.governance_intent_id, governanceReviewId: r.governance_review_id,
  planStatus: r.plan_status, planHash: r.plan_hash,
  sourceRefs: JSON.parse(r.source_refs_json) as string[],
  createdByAdminId: r.created_by_admin_id, traceId: r.trace_id,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});

const mapItem = (r: PlanItemRow): DryRunPlanItem => ({
  id: r.id, cityCode: r.city_code, planId: r.plan_id,
  itemType: r.item_type, itemRefId: r.item_ref_id,
  plannedAction: r.planned_action, itemOrder: r.item_order,
  createdAt: r.created_at.toISOString(),
});

const mapAudit = (r: AuditRow): DryRunPlanAudit => ({
  id: r.id, cityCode: r.city_code, planId: r.plan_id,
  eventType: r.event_type, eventTimestamp: r.event_timestamp.toISOString(),
  actorAdminId: r.actor_admin_id, summary: r.summary,
});

// ── Deterministic plan hash ──────────────────────────────────────────────────
export function computePlanHash(
  packetId: string,
  cityCode: string,
  itemRefs: string[],
): string {
  const payload = `${packetId}\n${cityCode}\n${[...itemRefs].sort().join("\n")}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

// ── Plan builder ─────────────────────────────────────────────────────────────
export class PlannerPlanBuilder {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getMysqlPool();
  }

  /**
   * Read a readiness packet and verify it is in ready_for_future_phase_review status.
   * Returns the packet row data.
   */
  async getReadinessPacket(
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
   * Verify linked governance review is approved.
   */
  async verifyReviewApproved(reviewId: string): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT review_status FROM settlement_action_governance_reviews
       WHERE id = ?`,
      [reviewId],
    );
    if (rows.length === 0) return false;
    return rows[0].review_status === "approved_for_governance";
  }

  /**
   * Find settlement batches linked to a readiness packet via sourceRefs.
   * Source refs may contain batch IDs, statement IDs, etc.
   * We scan settlement_batches filtered to the city.
   */
  async findLinkedBatches(
    cityCode: string,
    sourceRefs: string[],
  ): Promise<string[]> {
    if (sourceRefs.length === 0) return [];
    // sourceRefs may contain settlement batch IDs or statement IDs
    // Try to find batches by batch ID or by statement -> batch linkage
    const batchIds = new Set<string>();

    // Direct batch references
    for (const ref of sourceRefs) {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        `SELECT settlement_batch_id FROM settlement_batches
         WHERE settlement_batch_id = ? AND city_code = ?`,
        [ref, cityCode],
      );
      if (rows.length > 0) {
        batchIds.add(rows[0].settlement_batch_id);
      }
    }

    // Also try statement IDs to find linked batches via payables
    for (const ref of sourceRefs) {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        `SELECT DISTINCT settlement_batch_id FROM settlement_payables
         WHERE city_code = ?
         AND settlement_payable_id IN (
           SELECT settlement_payable_id FROM worker_receivable_statements
           WHERE statement_id = ? AND city_code = ?
         )`,
        [cityCode, ref, cityCode],
      );
      for (const r of rows) {
        batchIds.add(r.settlement_batch_id);
      }
    }

    return [...batchIds];
  }

  /**
   * Get batch details (items, payables, ledger accruals).
   */
  async getBatchDetails(
    cityCode: string,
    batchId: string,
  ): Promise<{
    items: RowDataPacket[];
    payable: RowDataPacket | null;
    accruals: RowDataPacket[];
  }> {
    const [items] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM settlement_items
       WHERE settlement_batch_id = ? AND city_code = ?`,
      [batchId, cityCode],
    );

    const [payables] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM settlement_payables
       WHERE settlement_batch_id = ? AND city_code = ?`,
      [batchId, cityCode],
    );

    // Read ledger accruals linked to this batch's items
    const [accruals] = await this.pool.query<RowDataPacket[]>(
      `SELECT la.* FROM ledger_accruals la
       INNER JOIN settlement_items si ON si.accrual_id = la.accrual_id
       WHERE si.settlement_batch_id = ? AND si.city_code = ?`,
      [batchId, cityCode],
    );

    return {
      items,
      payable: payables.length > 0 ? payables[0] : null,
      accruals,
    };
  }

  /**
   * Build planned items for a batch.
   * Generates items for: settlement_batch, settlement_payable, ledger_accrual, etc.
   */
  buildPlanItems(
    cityCode: string,
    planId: string,
    batchId: string,
    batchDetails: {
      items: RowDataPacket[];
      payable: RowDataPacket | null;
      accruals: RowDataPacket[];
    },
  ): { itemRows: PlanItemInsert[]; itemRefs: string[] } {
    const itemRows: PlanItemInsert[] = [];
    const itemRefs: string[] = [];
    let order = 0;

    // 1. Settlement batch item
    const batchItemId = genId("dpi");
    itemRows.push({
      id: batchItemId,
      city_code: cityCode,
      plan_id: planId,
      item_type: "settlement_batch",
      item_ref_id: batchId,
      planned_action: `verify settlement batch ${batchId} status=confirmed`,
      item_order: order++,
      created_at: new Date(),
    });
    itemRefs.push(`settlement_batch:${batchId}`);

    // 2. Settlement payable item
    if (batchDetails.payable) {
      const payableId = batchDetails.payable.settlement_payable_id as string;
      const pItemId = genId("dpi");
      itemRows.push({
        id: pItemId,
        city_code: cityCode,
        plan_id: planId,
        item_type: "settlement_payable",
        item_ref_id: payableId,
        planned_action: `verify payable ${payableId} status=payable`,
        item_order: order++,
        created_at: new Date(),
      });
      itemRefs.push(`settlement_payable:${payableId}`);
    }

    // 3. Settlement items (individual)
    for (const si of batchDetails.items) {
      const siId = si.settlement_item_id as string;
      const sItemId = genId("dpi");
      itemRows.push({
        id: sItemId,
        city_code: cityCode,
        plan_id: planId,
        item_type: "settlement_item",
        item_ref_id: siId,
        planned_action: `verify settlement item ${siId} status=confirmed`,
        item_order: order++,
        created_at: new Date(),
      });
      itemRefs.push(`settlement_item:${siId}`);
    }

    // 4. Ledger accruals
    for (const acc of batchDetails.accruals) {
      const accId = acc.accrual_id as string;
      const aItemId = genId("dpi");
      itemRows.push({
        id: aItemId,
        city_code: cityCode,
        plan_id: planId,
        item_type: "ledger_accrual",
        item_ref_id: accId,
        planned_action: `verify ledger accrual ${accId} status=accrued`,
        item_order: order++,
        created_at: new Date(),
      });
      itemRefs.push(`ledger_accrual:${accId}`);
    }

    return { itemRows, itemRefs };
  }

  /**
   * Generate a deterministic dry-run plan for a readiness packet.
   * Idempotent: same packet → same plan_hash → skip re-generation.
   */
  async generatePlan(
    ctx: RequestContext,
    packetId: string,
  ): Promise<{ plan: DryRunPlan; items: DryRunPlanItem[] }> {
    const cityCode = assertCityScopedContext(ctx);
    const conn = await this.pool.getConnection();

    try {
      // 1. Verify readiness packet exists and status
      const packet = await this.getReadinessPacket(cityCode, packetId);
      if (!packet) {
        throw new Error(`Readiness packet ${packetId} not found in city ${cityCode}`);
      }
      if (packet.packet_status !== "ready_for_future_phase_review") {
        throw new Error(
          `Readiness packet ${packetId} status is '${packet.packet_status}', expected 'ready_for_future_phase_review'`,
        );
      }

      // 2. Verify sourceRefs present
      const sourceRefs: string[] = JSON.parse(
        (packet.source_refs_json as string) || "[]",
      );
      if (!sourceRefs || sourceRefs.length === 0) {
        throw new Error(`Readiness packet ${packetId} has no sourceRefs`);
      }

      // 3. Verify linked review approved (if present)
      if (packet.review_id) {
        const approved = await this.verifyReviewApproved(packet.review_id);
        if (!approved) {
          throw new Error(
            `Governance review ${packet.review_id} is not in 'approved_for_governance' status`,
          );
        }
      }

      // 4. Find linked settlement batches
      const batchIds = await this.findLinkedBatches(cityCode, sourceRefs);
      if (batchIds.length === 0) {
        throw new Error(
          `No settlement batches found for readiness packet ${packetId} sourceRefs`,
        );
      }

      // 5. Pre-compute item refs (for plan_hash) and store batch details
      const allItemRefs: string[] = [];
      const batchDetailsList: { batchId: string; details: { items: RowDataPacket[]; payable: RowDataPacket | null; accruals: RowDataPacket[] } }[] = [];

      for (const batchId of batchIds) {
        const details = await this.getBatchDetails(cityCode, batchId);
        batchDetailsList.push({ batchId, details });

        // Compute refs for plan_hash without building full items
        allItemRefs.push(`settlement_batch:${batchId}`);
        if (details.payable) {
          allItemRefs.push(`settlement_payable:${details.payable.settlement_payable_id}`);
        }
        for (const si of details.items) {
          allItemRefs.push(`settlement_item:${si.settlement_item_id}`);
        }
        for (const acc of details.accruals) {
          allItemRefs.push(`ledger_accrual:${acc.accrual_id}`);
        }
      }

      // 6. Compute deterministic plan_hash
      const planHash = computePlanHash(packetId, cityCode, allItemRefs);

      // 7. Check idempotency — existing plan with same hash?
      const [existing] = await this.pool.query<PlanRow[]>(
        `SELECT * FROM settlement_execution_dry_run_plans
         WHERE readiness_packet_id = ? AND city_code = ? AND plan_hash = ?`,
        [packetId, cityCode, planHash],
      );
      if (existing.length > 0) {
        // Already exists — return existing
        const plan = mapPlan(existing[0]);
        const [items] = await this.pool.query<PlanItemRow[]>(
          `SELECT * FROM settlement_execution_dry_run_plan_items
           WHERE plan_id = ? ORDER BY item_order ASC`,
          [plan.id],
        );
        return { plan, items: items.map(mapItem) };
      }

      // 8. Atomic insert: plan + items + audit
      const planId = genId("drp");
      const now = new Date();
      const traceId = ctx.traceId ?? null;
      const adminId = ctx.userId ?? null;

      // Now build items with the real planId
      const allItemRows: PlanItemInsert[] = [];
      for (const { batchId, details } of batchDetailsList) {
        const { itemRows } = this.buildPlanItems(cityCode, planId, batchId, details);
        allItemRows.push(...itemRows);
      }

      await conn.beginTransaction();

      try {
        // Insert plan
        await conn.query(
          `INSERT INTO settlement_execution_dry_run_plans
           (id, city_code, readiness_packet_id, governance_intent_id,
            governance_review_id, plan_status, plan_hash, source_refs_json,
            created_by_admin_id, trace_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'generated', ?, ?, ?, ?, ?, ?)`,
          [
            planId,
            cityCode,
            packetId,
            packet.intent_id ?? null,
            packet.review_id ?? null,
            planHash,
            JSON.stringify(sourceRefs),
            adminId,
            traceId,
            now,
            now,
          ],
        );

        // Insert items
        for (const item of allItemRows) {
          await conn.query(
            `INSERT INTO settlement_execution_dry_run_plan_items
             (id, city_code, plan_id, item_type, item_ref_id,
              planned_action, item_order, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id,
              item.city_code,
              item.plan_id,
              item.item_type,
              item.item_ref_id,
              item.planned_action,
              item.item_order,
              item.created_at,
            ],
          );
        }

        // Insert audit
        const auditId = genId("dpa");
        await conn.query(
          `INSERT INTO settlement_execution_dry_run_plan_audit
           (id, city_code, plan_id, event_type, event_timestamp,
            actor_admin_id, summary)
           VALUES (?, ?, ?, 'plan_generated', ?, ?, ?)`,
          [
            auditId,
            cityCode,
            planId,
            now,
            adminId,
            `Dry-run plan generated from readiness packet ${packetId} with ${allItemRows.length} items`,
          ],
        );

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      }

      // 9. Return generated plan
      const [planRows] = await this.pool.query<PlanRow[]>(
        `SELECT * FROM settlement_execution_dry_run_plans WHERE id = ?`,
        [planId],
      );
      const [itemRows] = await this.pool.query<PlanItemRow[]>(
        `SELECT * FROM settlement_execution_dry_run_plan_items
         WHERE plan_id = ? ORDER BY item_order ASC`,
        [planId],
      );

      return {
        plan: mapPlan(planRows[0]),
        items: itemRows.map(mapItem),
      };
    } finally {
      conn.release();
    }
  }

  /**
   * Get a plan by ID (city-scoped).
   */
  async getPlan(
    cityCode: string,
    planId: string,
  ): Promise<DryRunPlan | null> {
    const [rows] = await this.pool.query<PlanRow[]>(
      `SELECT * FROM settlement_execution_dry_run_plans
       WHERE id = ? AND city_code = ?`,
      [planId, cityCode],
    );
    return rows.length === 0 ? null : mapPlan(rows[0]);
  }

  /**
   * List plans, optionally filtered by intent.
   */
  async listPlans(
    cityCode: string,
    intentId?: string,
  ): Promise<DryRunPlan[]> {
    let query = `SELECT * FROM settlement_execution_dry_run_plans
                 WHERE city_code = ?`;
    const params: unknown[] = [cityCode];
    if (intentId) {
      query += ` AND governance_intent_id = ?`;
      params.push(intentId);
    }
    query += ` ORDER BY created_at DESC LIMIT 50`;
    const [rows] = await this.pool.query<PlanRow[]>(query, params);
    return rows.map(mapPlan);
  }

  /**
   * Get plan items.
   */
  async getPlanItems(
    cityCode: string,
    planId: string,
  ): Promise<DryRunPlanItem[]> {
    const [rows] = await this.pool.query<PlanItemRow[]>(
      `SELECT * FROM settlement_execution_dry_run_plan_items
       WHERE plan_id = ? AND city_code = ?
       ORDER BY item_order ASC`,
      [planId, cityCode],
    );
    return rows.map(mapItem);
  }

  /**
   * Get plan audit trail.
   */
  async getPlanAudit(
    cityCode: string,
    planId: string,
  ): Promise<DryRunPlanAudit[]> {
    const [rows] = await this.pool.query<AuditRow[]>(
      `SELECT * FROM settlement_execution_dry_run_plan_audit
       WHERE plan_id = ? AND city_code = ?
       ORDER BY event_timestamp ASC`,
      [planId, cityCode],
    );
    return rows.map(mapAudit);
  }
}
