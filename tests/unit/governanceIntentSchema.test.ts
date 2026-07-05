import { describe, expect, it } from "vitest";
import {
  createGovernanceIntentRequestSchema,
  governanceIntentPhaseBoundarySchema,
  governanceIntentRecordSchema,
} from "@xlb/validators";

// ══════════════════════════════════════════════════════════════════
// Phase 10C — Governance Intent Persistence Validator Tests
// ══════════════════════════════════════════════════════════════════

describe("Phase 10C — Governance Intent Schema", () => {
  // ── Valid records ──
  describe("unit — valid governance intents", () => {
    it("accepts a valid governance intent record", () => {
      const result = governanceIntentRecordSchema.safeParse({
        id: "gi_test123",
        cityCode: "hangzhou",
        statementId: "stmt_abc",
        actionKind: "review_settlement_statement",
        actionStatus: "draft",
        targetType: "statement",
        targetRef: "stmt_abc",
        requestedByAdminId: "admin_001",
        requestedReason: "Test reason",
        evidenceRefs: ["exp_001"],
        riskFlags: ["test_flag"],
        phaseBoundary: {
          phase: "10C",
          governanceOnly: true,
          executionEnabled: false,
          persistenceEnabled: true,
          mutationEnabled: false,
        },
        createdAt: "2026-07-05T08:00:00.000Z",
        updatedAt: "2026-07-05T08:00:00.000Z",
        cancelledAt: null,
        archivedAt: null,
      });
      expect(result.success).toBe(true);
    });

    it("accepts phase boundary with persistenceEnabled: true", () => {
      const result = governanceIntentPhaseBoundarySchema.safeParse({
        phase: "10C",
        governanceOnly: true,
        executionEnabled: false,
        persistenceEnabled: true,
        mutationEnabled: false,
      });
      expect(result.success).toBe(true);
    });

    it("accepts create request with all required fields", () => {
      const result = createGovernanceIntentRequestSchema.safeParse({
        cityCode: "hangzhou",
        statementId: "stmt_abc",
        actionKind: "mark_governance_risk",
        requestedByAdminId: "admin_001",
        requestedReason: "Flag for review",
        evidenceRefs: [],
        riskFlags: ["high_priority"],
      });
      expect(result.success).toBe(true);
    });
  });

  // ── Invalid: phase boundary must have persistenceEnabled: true ──
  describe("unit — phase boundary enforcement (10C)", () => {
    it("rejects phase boundary with persistenceEnabled: false (10C requires true)", () => {
      const result = governanceIntentPhaseBoundarySchema.safeParse({
        phase: "10C",
        governanceOnly: true,
        executionEnabled: false,
        persistenceEnabled: false,
        mutationEnabled: false,
      });
      expect(result.success).toBe(false);
    });

    it("rejects phase boundary with executionEnabled: true", () => {
      const result = governanceIntentPhaseBoundarySchema.safeParse({
        phase: "10C",
        governanceOnly: true,
        executionEnabled: true,
        persistenceEnabled: true,
        mutationEnabled: false,
      });
      expect(result.success).toBe(false);
    });

    it("rejects phase boundary with mutationEnabled: true", () => {
      const result = governanceIntentPhaseBoundarySchema.safeParse({
        phase: "10C",
        governanceOnly: true,
        executionEnabled: false,
        persistenceEnabled: true,
        mutationEnabled: true,
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Invalid: execution kinds rejected ──
  describe("unit — execution kinds rejected", () => {
    it("rejects create request with execute_payout as actionKind", () => {
      const result = createGovernanceIntentRequestSchema.safeParse({
        cityCode: "hangzhou",
        actionKind: "execute_payout",
        requestedByAdminId: "admin_001",
        requestedReason: "test",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Invalid: required fields ──
  describe("unit — required field validation", () => {
    it("rejects create request without cityCode", () => {
      const result = createGovernanceIntentRequestSchema.safeParse({
        actionKind: "review_settlement_statement",
        requestedByAdminId: "admin_001",
        requestedReason: "test",
      });
      expect(result.success).toBe(false);
    });

    it("rejects create request without actionKind", () => {
      const result = createGovernanceIntentRequestSchema.safeParse({
        cityCode: "hangzhou",
        requestedByAdminId: "admin_001",
        requestedReason: "test",
      });
      expect(result.success).toBe(false);
    });

    it("rejects create request without requestedReason", () => {
      const result = createGovernanceIntentRequestSchema.safeParse({
        cityCode: "hangzhou",
        actionKind: "review_settlement_statement",
        requestedByAdminId: "admin_001",
      });
      expect(result.success).toBe(false);
    });
  });
});
