import type { RequestContext } from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { PlannerPlanBuilder, type DryRunPlan, type DryRunPlanItem, type DryRunPlanAudit } from "./plannerPlanBuilder.js";

/**
 * Planner Service — wraps PlannerPlanBuilder with city-scoped context handling.
 *
 * All methods verify city-scoped context and delegate to the builder.
 * This service WRITES only to Phase 11 planner tables.
 * It does NOT import any write service from settlement/payment/ledger/refund/reversal.
 */
class PlannerService {
  private builder: PlannerPlanBuilder;

  constructor() {
    this.builder = new PlannerPlanBuilder();
  }

  /**
   * Generate a deterministic dry-run plan from a readiness packet.
   * Idempotent: same packet → same plan_hash → returns existing plan.
   */
  async generateDryRunPlan(
    ctx: RequestContext,
    packetId: string,
  ): Promise<{ plan: DryRunPlan; items: DryRunPlanItem[] }> {
    assertCityScopedContext(ctx);
    return this.builder.generatePlan(ctx, packetId);
  }

  /**
   * Read a single plan by ID (city-scoped).
   */
  async getPlan(
    ctx: RequestContext,
    planId: string,
  ): Promise<DryRunPlan | null> {
    const cityCode = assertCityScopedContext(ctx);
    return this.builder.getPlan(cityCode, planId);
  }

  /**
   * List plans, optionally filtered by governance intent (city-scoped).
   */
  async listPlans(
    ctx: RequestContext,
    intentId?: string,
  ): Promise<DryRunPlan[]> {
    const cityCode = assertCityScopedContext(ctx);
    return this.builder.listPlans(cityCode, intentId);
  }

  /**
   * Get plan items (city-scoped).
   */
  async getPlanItems(
    ctx: RequestContext,
    planId: string,
  ): Promise<DryRunPlanItem[]> {
    const cityCode = assertCityScopedContext(ctx);
    return this.builder.getPlanItems(cityCode, planId);
  }

  /**
   * Get plan audit trail (city-scoped).
   */
  async getPlanAudit(
    ctx: RequestContext,
    planId: string,
  ): Promise<DryRunPlanAudit[]> {
    const cityCode = assertCityScopedContext(ctx);
    return this.builder.getPlanAudit(cityCode, planId);
  }
}

export const plannerService = new PlannerService();
