import { describe, expect, it } from "vitest";
import {
  settlementActionIntentSchema,
  governanceActionKindSchema,
  governanceActionStatusSchema,
  phaseBoundarySchema,
} from "@xlb/validators";

// ══════════════════════════════════════════════════════════════════
// Phase 10B — Settlement Action Intent Validator Tests
// ══════════════════════════════════════════════════════════════════

const validIntent = {
  intentId: "intent_001",
  cityCode: "hangzhou",
  statementId: "stmt_abc123",
  actionKind: "review_settlement_statement" as const,
  actionStatus: "draft" as const,
  targetType: "statement",
  targetRef: "stmt_abc123",
  requestedByAdminId: "admin_001",
  requestedReason: "Review settlement statement for accuracy",
  evidenceRefs: ["exp_001", "rev_002"],
  riskFlags: ["high_value"],
  phaseBoundary: {
    phase: "10B",
    governanceOnly: true as const,
    executionEnabled: false as const,
    persistenceEnabled: false as const,
    mutationEnabled: false as const,
  },
  createdAt: "2026-07-05T08:00:00.000Z",
  updatedAt: "2026-07-05T08:00:00.000Z",
};

describe("Phase 10B — Settlement Action Intent Schema", () => {
  // ── Unit: Valid governance intents ──
  describe("unit — valid governance intents", () => {
    it("accepts a valid governance intent with all fields", () => {
      const result = settlementActionIntentSchema.safeParse(validIntent);
      expect(result.success).toBe(true);
    });

    it("accepts intent with null statementId (using targetRef instead)", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        statementId: null,
        targetRef: "batch_xyz",
      });
      expect(result.success).toBe(true);
    });

    it("accepts all allowed action_kind values", () => {
      const allowedKinds = [
        "review_settlement_statement",
        "prepare_payout_review",
        "prepare_refund_review",
        "prepare_reversal_review",
        "request_evidence_review",
        "mark_governance_risk",
      ];
      for (const kind of allowedKinds) {
        const result = governanceActionKindSchema.safeParse(kind);
        expect(result.success).toBe(true);
      }
    });

    it("accepts all allowed action_status values", () => {
      const allowedStatuses = ["draft", "ready_for_review", "blocked", "cancelled", "archived"];
      for (const status of allowedStatuses) {
        const result = governanceActionStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      }
    });

    it("accepts phase boundary with all governance-only flags", () => {
      const result = phaseBoundarySchema.safeParse({
        phase: "10B",
        governanceOnly: true,
        executionEnabled: false,
        persistenceEnabled: false,
        mutationEnabled: false,
      });
      expect(result.success).toBe(true);
    });

    it("accepts intent with targetType null", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        targetType: null,
      });
      expect(result.success).toBe(true);
    });
  });

  // ── Unit: Validation failures ──
  describe("unit — validation failures", () => {
    it("rejects intent without cityCode", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        cityCode: undefined,
      });
      expect(result.success).toBe(false);
    });

    it("rejects intent with __global__ cityCode", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        cityCode: "__global__",
      });
      expect(result.success).toBe(false);
    });

    it("rejects intent with both statementId and targetRef null", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        statementId: null,
        targetRef: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects intent without requestedByAdminId", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        requestedByAdminId: undefined,
      });
      expect(result.success).toBe(false);
    });

    it("rejects intent without requestedReason", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        requestedReason: undefined,
      });
      expect(result.success).toBe(false);
    });

    it("rejects intent with empty requestedReason", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        requestedReason: "",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Unit: Forbidden execution kinds ──
  describe("unit — forbidden execution kinds rejected", () => {
    const forbiddenKinds = [
      "execute_payout",
      "pay_now",
      "withdraw",
      "execute_refund",
      "reverse_ledger",
      "mutate_settlement",
      "commit_settlement",
      "generate_export_file",
    ];

    for (const kind of forbiddenKinds) {
      it(`rejects forbidden action_kind: "${kind}"`, () => {
        const result = governanceActionKindSchema.safeParse(kind);
        expect(result.success).toBe(false);
      });
    }
  });

  // ── Unit: Forbidden execution statuses ──
  describe("unit — forbidden execution statuses rejected", () => {
    const forbiddenStatuses = ["paid", "refunded", "reversed", "executed", "settled"];

    for (const status of forbiddenStatuses) {
      it(`rejects forbidden action_status: "${status}"`, () => {
        const result = governanceActionStatusSchema.safeParse(status);
        expect(result.success).toBe(false);
      });
    }
  });

  // ── Unit: Phase boundary enforcement ──
  describe("unit — phase boundary enforcement", () => {
    it("rejects phase boundary with executionEnabled: true", () => {
      const result = phaseBoundarySchema.safeParse({
        phase: "10B",
        governanceOnly: true,
        executionEnabled: true,
        persistenceEnabled: false,
        mutationEnabled: false,
      });
      expect(result.success).toBe(false);
    });

    it("rejects phase boundary with persistenceEnabled: true", () => {
      const result = phaseBoundarySchema.safeParse({
        phase: "10B",
        governanceOnly: true,
        executionEnabled: false,
        persistenceEnabled: true,
        mutationEnabled: false,
      });
      expect(result.success).toBe(false);
    });

    it("rejects phase boundary with mutationEnabled: true", () => {
      const result = phaseBoundarySchema.safeParse({
        phase: "10B",
        governanceOnly: true,
        executionEnabled: false,
        persistenceEnabled: false,
        mutationEnabled: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejects phase boundary with governanceOnly: false", () => {
      const result = phaseBoundarySchema.safeParse({
        phase: "10B",
        governanceOnly: false,
        executionEnabled: false,
        persistenceEnabled: false,
        mutationEnabled: false,
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Unit: Evidence refs and risk flags ──
  describe("unit — evidence refs and risk flags", () => {
    it("accepts empty evidenceRefs array", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        evidenceRefs: [],
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty riskFlags array", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        riskFlags: [],
      });
      expect(result.success).toBe(true);
    });

    it("rejects intent with extra unknown fields", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        payoutAmount: 100,
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Security: No execution semantics ──
  describe("security — no execution semantics", () => {
    it("does not accept execute_payout in actionKind", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        actionKind: "execute_payout",
      });
      // Fails because execute_payout is not in the enum AND caught by superRefine
      expect(result.success).toBe(false);
    });

    it("does not accept paid status in actionStatus", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        actionStatus: "paid",
      });
      expect(result.success).toBe(false);
    });

    it("does not accept mutation-enabled phase boundary", () => {
      const result = settlementActionIntentSchema.safeParse({
        ...validIntent,
        phaseBoundary: {
          phase: "10B",
          governanceOnly: true,
          executionEnabled: false,
          persistenceEnabled: false,
          mutationEnabled: true,
        },
      });
      expect(result.success).toBe(false);
    });
  });
});
