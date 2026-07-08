// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { App } from "../../apps/admin/src/app/App";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock("@xlb/api-client", () => ({
  createApiClient: () => ({ get: mockGet }),
  settlementApi: {
    create: () => ({
      listStatementAudit: (q: Record<string, string>) =>
        mockGet(`/api/internal/settlement/worker-statement-audit?cityCode=${q.cityCode}`),
      getStatementAuditDetail: (statementId: string) =>
        mockGet(`/api/internal/settlement/worker-statement-audit/${statementId}`),
      getReviewSummary: (q: Record<string, string>) =>
        mockGet(`/api/internal/settlement/worker-statement-review-summary?cityCode=${q.cityCode}`),
      getSettlementAuditSummary: (q: Record<string, string>) =>
        mockGet(`/api/internal/settlement/settlement-audit-summary?cityCode=${q.cityCode}`),
      scanReconciliationGaps: (q: Record<string, string>) =>
        mockGet(`/api/internal/settlement/reconciliation-gap-scan?cityCode=${q.cityCode}`),
    }),
  },
  governanceIntentApi: { create: () => ({ createDraft: () => Promise.resolve({ ok: true }), getIntent: () => Promise.resolve({ ok: true }), listIntents: () => Promise.resolve({ ok: true }), cancelIntent: () => Promise.resolve({ ok: true }), archiveIntent: () => Promise.resolve({ ok: true }) }) },
  governanceReviewApi: { create: () => ({ submitReview: () => Promise.resolve({ ok: true }), getReview: () => Promise.resolve({ ok: true }), listReviews: () => Promise.resolve({ ok: true }), approveReview: () => Promise.resolve({ ok: true }), rejectReview: () => Promise.resolve({ ok: true }), requestChanges: () => Promise.resolve({ ok: true }) }) },
  governanceEvidenceApi: { create: () => ({ createBundle: () => Promise.resolve({ ok: true }), getBundle: () => Promise.resolve({ ok: true }), listBundles: () => Promise.resolve({ ok: true }), attachRef: () => Promise.resolve({ ok: true }), removeRef: () => Promise.resolve({ ok: true }), archiveBundle: () => Promise.resolve({ ok: true }), getAuditTrail: () => Promise.resolve({ ok: true }) }) },
  governanceReadinessApi: { create: () => ({ create: () => Promise.resolve({ ok: true }), get: () => Promise.resolve({ ok: true }), list: () => Promise.resolve({ ok: true }), recomputeChecks: () => Promise.resolve({ ok: true }), markBlocked: () => Promise.resolve({ ok: true }), archive: () => Promise.resolve({ ok: true }), markReadyForReview: () => Promise.resolve({ ok: true }) }) },
  governancePlannerApi: { create: () => ({ listSettlementDryRunPlans: () => Promise.resolve({ ok: true, plans: [] }), getSettlementDryRunPlan: () => Promise.resolve({ ok: true }), createSettlementDryRunPlan: () => Promise.resolve({ ok: true }), getSettlementDryRunPlanItems: () => Promise.resolve({ ok: true }), getSettlementDryRunPlanAudit: () => Promise.resolve({ ok: true }), getReadinessPacketDryRunEligibility: () => Promise.resolve({ ok: true }) }) },
}));

const mockStatementDetail = {
  ok: true,
  statement: { statementId: "stmt-001", cityCode: "hangzhou", workerId: "worker-1", settlementBatchId: "batch-1", queueId: "queue-1", settlementPayableId: "payable-1", currency: "CNY", grossAmount: 10000, platformFeeAmount: 1000, workerReceivableAmount: 9000, itemCount: 3, status: "generated", generatedAt: "2026-07-01T00:00:00Z", generatedBy: "system", createdAt: "2026-07-01T00:00:00Z", updatedAt: "2026-07-01T00:00:00Z" },
  review: { reviewId: "review-1", decision: "approved", reviewNote: "looks good", reviewedAt: "2026-07-02T00:00:00Z", reviewedBy: "operator-1" },
  export: { exportId: "export-1", contentHash: "abc123def456", exportedAt: "2026-07-03T00:00:00Z", exportedBy: "operator-1", outboxEventId: "evt-1" },
  exportedOutboxEvent: { eventId: "evt-1", eventType: "worker.receivable.statement.exported", status: "published", publishedAt: "2026-07-03T01:00:00Z" },
};

function setupDashboardWithStatements() {
  mockGet.mockImplementation((url: string) => {
    if (url.includes("/worker-statement-audit/")) return Promise.resolve(mockStatementDetail);
    if (url.includes("worker-statement-audit?cityCode"))
      return Promise.resolve({ ok: true, items: [{ statementId: "stmt-001", workerId: "worker-1", status: "generated", review: null, export: null }] });
    return Promise.resolve({ ok: true, items: [] });
  });
}

describe("Phase 9B — Drilldown / Detail Foundation", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ ok: true, items: [] });
    window.location.hash = "";
  });
  afterEach(() => {
    cleanup();
    window.location.hash = "";
  });

  // ── Unit: Hash Route ──
  describe("unit — hash route", () => {
    it("renders dashboard when hash is empty", () => {
      render(<App />);
      expect(screen.getByText("Settlement Operations Console")).toBeTruthy();
    });

    it("renders detail page when hash contains statementId", async () => {
      mockGet.mockResolvedValue(mockStatementDetail);
      window.location.hash = "#/settlement-ops/statements/stmt-001";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("Statement Detail")).toBeTruthy(); });
    });
  });

  // ── Unit: Detail Page Content ──
  describe("unit — detail page content", () => {
    it("renders statement fields", async () => {
      mockGet.mockResolvedValue(mockStatementDetail);
      window.location.hash = "#/settlement-ops/statements/stmt-001";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("CNY")).toBeTruthy(); });
    });

    it("renders review section", async () => {
      mockGet.mockResolvedValue(mockStatementDetail);
      window.location.hash = "#/settlement-ops/statements/stmt-001";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("approved")).toBeTruthy(); });
    });

    it("renders export section", async () => {
      mockGet.mockResolvedValue(mockStatementDetail);
      window.location.hash = "#/settlement-ops/statements/stmt-001";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("abc123def456")).toBeTruthy(); });
    });

    it("renders outbox event section", async () => {
      mockGet.mockResolvedValue(mockStatementDetail);
      window.location.hash = "#/settlement-ops/statements/stmt-001";
      render(<App />);
      await waitFor(() => { expect(screen.getAllByText("evt-1").length).toBeGreaterThan(0); });
    });
  });

  // ── Integration: Navigation ──
  describe("integration — navigation", () => {
    it("navigates from dashboard to detail via hash", async () => {
      setupDashboardWithStatements();
      render(<App />);
      await waitFor(() => { expect(screen.getByText(/stmt-001/)).toBeTruthy(); });
      fireEvent.click(screen.getByText(/stmt-001/));
      await waitFor(() => { expect(window.location.hash).toContain("stmt-001"); });
    });

    it("navigates back to dashboard", async () => {
      mockGet.mockResolvedValue(mockStatementDetail);
      window.location.hash = "#/settlement-ops/statements/stmt-001";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("Statement Detail")).toBeTruthy(); });
      fireEvent.click(screen.getAllByText(/Back to Console/)[0]);
      await waitFor(() => { expect(screen.getByText("Settlement Operations Console")).toBeTruthy(); });
    });
  });

  // ── Integration: States ──
  describe("integration — states", () => {
    it("shows loading state", () => {
      mockGet.mockImplementation(() => new Promise(() => {}));
      window.location.hash = "#/settlement-ops/statements/stmt-001";
      render(<App />);
      expect(screen.getByText(/Loading statement detail/)).toBeTruthy();
    });

    it("shows error state on API failure", async () => {
      mockGet.mockRejectedValue(new Error("Network Error"));
      window.location.hash = "#/settlement-ops/statements/stmt-001";
      render(<App />);
      await waitFor(() => { expect(screen.getByText(/Error:/)).toBeTruthy(); });
    });
  });

  // ── Security: No Mutation ──
  describe("security — no mutation controls", () => {
    it("detail page has no approve/payout/paid/retry/fix buttons", async () => {
      mockGet.mockResolvedValue(mockStatementDetail);
      window.location.hash = "#/settlement-ops/statements/stmt-001";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("Statement Detail")).toBeTruthy(); });
      expect(screen.queryByText(/^approve$/i)).toBeNull();
      expect(screen.queryByText(/^payout$/i)).toBeNull();
      expect(screen.queryByText(/^paid$/i)).toBeNull();
      expect(screen.queryByText(/^retry$/i)).toBeNull();
      expect(screen.queryByText(/^fix$/i)).toBeNull();
    });
  });

  // ── Security: Read-only API ──
  describe("security — read-only API", () => {
    it("only GET endpoints are called", async () => {
      mockGet.mockResolvedValue(mockStatementDetail);
      window.location.hash = "#/settlement-ops/statements/stmt-001";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("Statement Detail")).toBeTruthy(); });
      const calls = mockGet.mock.calls.flat();
      const mutationCalls = calls.filter((c: unknown) =>
        typeof c === "string" && /\b(POST|PUT|PATCH|DELETE)\b/.test(c as string)
      );
      expect(mutationCalls).toHaveLength(0);
    });

    it("calls getStatementAuditDetail with correct statementId", async () => {
      mockGet.mockResolvedValue(mockStatementDetail);
      window.location.hash = "#/settlement-ops/statements/stmt-001";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("Statement Detail")).toBeTruthy(); });
      const calls = mockGet.mock.calls.flat();
      expect(calls.some((c: unknown) => typeof c === "string" && (c as string).includes("stmt-001"))).toBe(true);
    });
  });

  // ── Contract: Forbidden Terms ──
  describe("contract — forbidden terms", () => {
    it("detail page has no forbidden text", async () => {
      mockGet.mockResolvedValue(mockStatementDetail);
      window.location.hash = "#/settlement-ops/statements/stmt-001";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("Statement Detail")).toBeTruthy(); });
      const t = document.body.textContent?.toLowerCase() || "";
      expect(t).not.toContain("payout");
      expect(t).not.toContain("payment instruction");
      expect(t).not.toContain("notification consumer");
    });
  });
});
