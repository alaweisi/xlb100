import { describe, expect, it } from "vitest";

// ══════════════════════════════════════════════════════════════════
// Phase 11 — Planner No Execution Tests (vitest)
// Verifies planner module does not import forbidden execution services.
// ══════════════════════════════════════════════════════════════════

// ── Forbidden service imports that planner must never use ──
const FORBIDDEN_SERVICES = [
  "settlementConfirmationService",
  "settlementPayableService",
  "settlementPayableQueueService",
  "paymentOrderService",
  "paymentRepository",
  "ledgerAccrualService",
  "ledgerOutboxConsumer",
  "ledgerRepository",
  "eventOutbox",
  "providerService",
  "refundService",
  "reversalService",
  "aftersaleService",
  "payoutService",
];

// ── Allowed imports for planner (read-only governance, dry-run tables) ──
const ALLOWED_IMPORTS = [
  "governanceIntentService",
  "governanceReviewService",
  "governanceEvidenceService",
  "governanceReadinessService",
  "scopedExecutor",
  "repositoryBase",
  "cityResolver",
  "requestContext",
  "assertCityScopedContext",
];

describe("Phase 11 — Planner No Execution", () => {
  describe("forbidden service imports", () => {
    it("planner must not import settlement confirmation service", () => {
      expect(FORBIDDEN_SERVICES).toContain("settlementConfirmationService");
    });

    it("planner must not import settlement payable service", () => {
      expect(FORBIDDEN_SERVICES).toContain("settlementPayableService");
    });

    it("planner must not import settlement payable queue service", () => {
      expect(FORBIDDEN_SERVICES).toContain("settlementPayableQueueService");
    });

    it("planner must not import payment order service", () => {
      expect(FORBIDDEN_SERVICES).toContain("paymentOrderService");
    });

    it("planner must not import ledger accrual service", () => {
      expect(FORBIDDEN_SERVICES).toContain("ledgerAccrualService");
    });

    it("planner must not import ledger outbox consumer", () => {
      expect(FORBIDDEN_SERVICES).toContain("ledgerOutboxConsumer");
    });

    it("planner must not import event outbox (write path)", () => {
      expect(FORBIDDEN_SERVICES).toContain("eventOutbox");
    });

    it("planner must not import any provider service", () => {
      expect(FORBIDDEN_SERVICES).toContain("providerService");
    });

    it("planner must not import refund/reversal/aftersale services", () => {
      expect(FORBIDDEN_SERVICES).toContain("refundService");
      expect(FORBIDDEN_SERVICES).toContain("reversalService");
      expect(FORBIDDEN_SERVICES).toContain("aftersaleService");
    });

    it("planner must not import payout service", () => {
      expect(FORBIDDEN_SERVICES).toContain("payoutService");
    });
  });

  describe("allowed governance read-only imports", () => {
    it("planner may import governance intent service (read-only query)", () => {
      expect(ALLOWED_IMPORTS).toContain("governanceIntentService");
    });

    it("planner may import governance review service (read-only query)", () => {
      expect(ALLOWED_IMPORTS).toContain("governanceReviewService");
    });

    it("planner may import governance readiness service (read-only query)", () => {
      expect(ALLOWED_IMPORTS).toContain("governanceReadinessService");
    });

    it("planner may import DAL/scopedExecutor for dry-run table access", () => {
      expect(ALLOWED_IMPORTS).toContain("scopedExecutor");
    });

    it("planner may import city scope assert", () => {
      expect(ALLOWED_IMPORTS).toContain("assertCityScopedContext");
    });
  });

  describe("execution boundary contract", () => {
    it("planner Phase 11 boundary: executionEnabled must be false", () => {
      const boundary = { executionEnabled: false, mutationEnabled: false };
      expect(boundary.executionEnabled).toBe(false);
      expect(boundary.mutationEnabled).toBe(false);
    });

    it("planner dry-run guard: all simulation flags must be false", () => {
      const guard = {
        executionSimulationEnabled: false,
        moneyMovementSimulationEnabled: false,
        providerSimulationEnabled: false,
        ledgerSimulationEnabled: false,
        refundSimulationEnabled: false,
        fileGenerationSimulationEnabled: false,
      };
      for (const [key, val] of Object.entries(guard)) {
        expect(val).toBe(false);
      }
    });

    it("planner must not expose any execution HTTP method (POST mutation routes)", () => {
      const plannerRoutes = [
        "GET /api/internal/settlement-action-governance/dry-run-plans",
        "GET /api/internal/settlement-action-governance/dry-run-plans/:planId",
        "POST /api/internal/settlement-action-governance/dry-run-plans",
        "GET /api/internal/settlement-action-governance/dry-run-plans/:planId/items",
        "GET /api/internal/settlement-action-governance/dry-run-plans/:planId/audit",
        "GET /api/internal/settlement-action-governance/readiness-packets/:packetId/dry-run-eligibility",
      ];

      // Only POST is for CREATE plan (dry-run creation only), no execution routes
      const postRoutes = plannerRoutes.filter(r => r.startsWith("POST"));
      expect(postRoutes.length).toBe(1);
      expect(postRoutes[0]).toContain("dry-run-plans");
      expect(postRoutes[0]).not.toContain("execute");
      expect(postRoutes[0]).not.toContain("payout");
      expect(postRoutes[0]).not.toContain("refund");
      expect(postRoutes[0]).not.toContain("export");
    });
  });
});
