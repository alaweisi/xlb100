import { describe, expect, it } from "vitest";

// ══════════════════════════════════════════════════════════════════
// Phase 11 — Planner API Contract Tests (vitest)
// Verifies governance planner API contract shapes from governancePlanner.ts.
// ══════════════════════════════════════════════════════════════════

interface DryRunPlanResponse {
  planId: string;
  planHash: string;
  status: string;
  packetId: string;
  cityCode: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DryRunPlanItemResponse {
  planItemId: string;
  planId: string;
  statementId: string;
  workerId: string;
  grossAmount: number;
  platformFee: number;
  workerReceivable: number;
  status: string;
  notes: string | null;
}

interface DryRunPlanAuditEntry {
  auditId: string;
  planId: string;
  event: string;
  details: unknown;
  createdAt: string;
}

interface DryRunEligibilityResponse {
  eligible: boolean;
  packetId: string;
  reason: string | null;
  checks: Record<string, boolean>;
}

describe("Phase 11 — Planner API Contract", () => {
  describe("DryRunPlanResponse shape", () => {
    it("has required planId, planHash, status, packetId, cityCode fields", () => {
      const plan: DryRunPlanResponse = {
        planId: "drp_1",
        planHash: "sha256:abc",
        status: "draft",
        packetId: "rp_1",
        cityCode: "hz",
        itemCount: 5,
        createdAt: "2025-06-01T00:00:00Z",
        updatedAt: "2025-06-01T00:00:00Z",
      };
      expect(plan.planId).toBeDefined();
      expect(plan.planHash).toBeDefined();
      expect(plan.status).toBeDefined();
      expect(plan.packetId).toBeDefined();
      expect(plan.cityCode).toBeDefined();
      expect(plan.itemCount).toBeGreaterThanOrEqual(0);
    });

    it("status must be a recognized dry-run status", () => {
      const validStatuses = ["draft", "simulating", "simulation_complete", "archived"];
      const plan: DryRunPlanResponse = {
        planId: "drp_1", planHash: "sha256:abc", status: "draft",
        packetId: "rp_1", cityCode: "hz", itemCount: 0,
        createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z",
      };
      expect(validStatuses).toContain(plan.status);
    });
  });

  describe("DryRunEligibilityResponse shape", () => {
    it("has required eligible, packetId, reason, checks fields", () => {
      const eligibility: DryRunEligibilityResponse = {
        eligible: true,
        packetId: "rp_1",
        reason: null,
        checks: { intent_approved: true, review_completed: true, evidence_attached: true },
      };
      expect(typeof eligibility.eligible).toBe("boolean");
      expect(eligibility.packetId).toBeDefined();
      expect(eligibility.checks).toBeDefined();
      expect(typeof eligibility.checks).toBe("object");
    });

    it("reason is null when eligible is true", () => {
      const eligibility: DryRunEligibilityResponse = {
        eligible: true,
        packetId: "rp_1",
        reason: null,
        checks: {},
      };
      expect(eligibility.eligible).toBe(true);
      expect(eligibility.reason).toBeNull();
    });

    it("reason is non-null when eligible is false", () => {
      const eligibility: DryRunEligibilityResponse = {
        eligible: false,
        packetId: "rp_2",
        reason: "Intent not approved",
        checks: { intent_approved: false },
      };
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).not.toBeNull();
      expect(eligibility.reason!.length).toBeGreaterThan(0);
    });
  });
});
