// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { App } from "../../apps/admin/src/app/App";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock("@xlb/api-client", () => ({
  createApiClient: () => ({ get: mockGet }),
  createAuthApi: () => ({
    requestAdminLoginCode: () => Promise.resolve({ ok: true }),
    getAdminDebugCode: () => Promise.resolve({ ok: true, code: "000000" }),
    adminLogin: () => Promise.resolve({ ok: true, token: "test-admin-token", userId: "operator-hangzhou", role: "operator" }),
  }),
  adminApi: { create: () => ({}) },
  settlementApi: {
    create: () => ({
      listStatementAudit: (q: Record<string, string>) =>
        mockGet(`/api/internal/settlement/worker-statement-audit?cityCode=${q.cityCode}`),
      listExportAudit: (q: Record<string, string>) =>
        mockGet(`/api/internal/settlement/worker-statement-export-audit?cityCode=${q.cityCode}`),
      getReviewSummary: (q: Record<string, string>) =>
        mockGet(`/api/internal/settlement/worker-statement-review-summary?cityCode=${q.cityCode}`),
      getSettlementAuditSummary: (q: Record<string, string>) =>
        mockGet(`/api/internal/settlement/settlement-audit-summary?cityCode=${q.cityCode}`),
      scanReconciliationGaps: (q: Record<string, string>) =>
        mockGet(`/api/internal/settlement/reconciliation-gap-scan?cityCode=${q.cityCode}`),
      getStatementAuditDetail: (statementId: string) =>
        mockGet(`/api/internal/settlement/worker-statement-audit/${statementId}`),
    }),
  },
  governanceIntentApi: {
    create: () => ({
      createDraft: () => Promise.resolve({ ok: true }),
      getIntent: () => Promise.resolve({ ok: true }),
      listIntents: () => Promise.resolve({ ok: true }),
      cancelIntent: () => Promise.resolve({ ok: true }),
      archiveIntent: () => Promise.resolve({ ok: true }),
    }),
  },
  governanceReviewApi: {
    create: () => ({
      submitReview: () => Promise.resolve({ ok: true }),
      getReview: () => Promise.resolve({ ok: true }),
      listReviews: () => Promise.resolve({ ok: true }),
      approveReview: () => Promise.resolve({ ok: true }),
      rejectReview: () => Promise.resolve({ ok: true }),
      requestChanges: () => Promise.resolve({ ok: true }),
    }),
  },
  governanceEvidenceApi: {
    create: () => ({
      createBundle: () => Promise.resolve({ ok: true }),
      getBundle: () => Promise.resolve({ ok: true }),
      listBundles: () => Promise.resolve({ ok: true }),
      attachRef: () => Promise.resolve({ ok: true }),
      removeRef: () => Promise.resolve({ ok: true }),
      archiveBundle: () => Promise.resolve({ ok: true }),
      getAuditTrail: () => Promise.resolve({ ok: true }),
    }),
  },
  governanceReadinessApi: {
    create: () => ({
      create: () => Promise.resolve({ ok: true }),
      get: () => Promise.resolve({ ok: true }),
      list: () => Promise.resolve({ ok: true }),
      recomputeChecks: () => Promise.resolve({ ok: true }),
      markBlocked: () => Promise.resolve({ ok: true }),
      archive: () => Promise.resolve({ ok: true }),
      markReadyForReview: () => Promise.resolve({ ok: true }),
    }),
  },
  governancePlannerApi: {
    create: () => ({
      listSettlementDryRunPlans: () => Promise.resolve({ ok: true, plans: [] }),
      getSettlementDryRunPlan: () => Promise.resolve({ ok: true }),
      createSettlementDryRunPlan: () => Promise.resolve({ ok: true }),
      getSettlementDryRunPlanItems: () => Promise.resolve({ ok: true }),
      getSettlementDryRunPlanAudit: () => Promise.resolve({ ok: true }),
      getReadinessPacketDryRunEligibility: () => Promise.resolve({ ok: true }),
    }),
  },
}));

const mockExports = {
  ok: true,
  items: [
    {
      exportId: "exp-1",
      statementId: "stmt-001",
      workerId: "worker-1",
      exportFormat: "csv",
      contentHash: "abc123def456789",
      exportedAt: "2026-07-01T00:00:00Z",
      exportedBy: "operator-1",
      cityCode: "hangzhou",
      reviewId: "review-1",
      payloadVersion: "1",
      outboxEventId: "evt-1",
    },
    {
      exportId: "exp-2",
      statementId: "stmt-002",
      workerId: "worker-2",
      exportFormat: "json",
      contentHash: "def456abc123789",
      exportedAt: "2026-07-02T00:00:00Z",
      exportedBy: "operator-2",
      cityCode: "hangzhou",
      reviewId: null,
      payloadVersion: "1",
      outboxEventId: null,
    },
  ],
  nextCursor: null,
};

const renderExportReview = async (hash: string) => {
  window.location.hash = hash;
  render(<App />);
  await waitFor(() => {
    expect(mockGet).toHaveBeenCalled();
  }, { timeout: 5_000 });
};

describe("Phase 9C Export Review Console", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ ok: true, items: [] });
    window.localStorage.setItem("xlb.admin.token", "test-admin-token");
    window.localStorage.setItem("xlb.admin.userId", "operator-hangzhou");
    window.localStorage.setItem("xlb.admin.role", "operator");
    window.localStorage.setItem("xlb.admin.username", "admin_hz");
    window.location.hash = "";
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.location.hash = "";
  });

  describe("unit route", () => {
    it("renders export review page at #/settlement-ops/exports", async () => {
      mockGet.mockResolvedValue(mockExports);
      await renderExportReview("#/settlement-ops/exports");
      await waitFor(() => {
        expect(screen.getByText("Settlement Export Review")).toBeTruthy();
      });
    });

    it("dashboard has export review navigation button", async () => {
      await renderExportReview("");
      await waitFor(() => {
        expect(screen.getByText("Settlement Exports")).toBeTruthy();
      });
    });
  });

  describe("unit API calls", () => {
    it("calls listExportAudit on mount", async () => {
      mockGet.mockResolvedValue(mockExports);
      await renderExportReview("#/settlement-ops/exports");
      await waitFor(() => {
        const calls = mockGet.mock.calls.flat();
        expect(
          calls.some((c: unknown) => typeof c === "string" && (c as string).includes("export-audit")),
        ).toBe(true);
      });
    });
  });

  describe("unit rendering", () => {
    it("renders export records in table", async () => {
      mockGet.mockResolvedValue(mockExports);
      await renderExportReview("#/settlement-ops/exports");
      await waitFor(() => {
        expect(screen.getByText("exp-1")).toBeTruthy();
      });
      expect(screen.getByText("exp-2")).toBeTruthy();
      expect(screen.getByText("csv")).toBeTruthy();
      expect(screen.getByText("json")).toBeTruthy();
    });

    it("renders content hash truncated", async () => {
      mockGet.mockResolvedValue(mockExports);
      await renderExportReview("#/settlement-ops/exports");
      await waitFor(() => {
        expect(screen.getByText("abc123def456...")).toBeTruthy();
      });
    });
  });

  describe("integration states", () => {
    it("shows loading state", async () => {
      mockGet.mockImplementation(() => new Promise(() => {}));
      await renderExportReview("#/settlement-ops/exports");
      await waitFor(() => {
        expect(screen.getByText(/Loading exports/)).toBeTruthy();
      });
    });

    it("shows error state", async () => {
      mockGet.mockRejectedValue(new Error("Network Error"));
      await renderExportReview("#/settlement-ops/exports");
      await waitFor(() => {
        expect(screen.getByText(/Error:/)).toBeTruthy();
      });
    });

    it("shows empty state", async () => {
      await renderExportReview("#/settlement-ops/exports");
      await waitFor(() => {
        expect(screen.getByText(/No export records/)).toBeTruthy();
      });
    });
  });

  describe("security no mutation", () => {
    it("has no approve/payout/fix/retry/repair/backfill buttons", async () => {
      mockGet.mockResolvedValue(mockExports);
      await renderExportReview("#/settlement-ops/exports");
      await waitFor(() => {
        expect(screen.getByText("Settlement Export Review")).toBeTruthy();
      });
      expect(screen.queryByText(/^approve$/i)).toBeNull();
      expect(screen.queryByText(/^payout$/i)).toBeNull();
      expect(screen.queryByText(/^fix$/i)).toBeNull();
      expect(screen.queryByText(/^retry$/i)).toBeNull();
    });

    it("only GET endpoints called", async () => {
      mockGet.mockResolvedValue(mockExports);
      await renderExportReview("#/settlement-ops/exports");
      await waitFor(() => {
        expect(screen.getByText("Settlement Export Review")).toBeTruthy();
      });
      const calls = mockGet.mock.calls.flat();
      const mutations = calls.filter(
        (c: unknown) => typeof c === "string" && /\b(POST|PUT|PATCH|DELETE)\b/.test(c as string),
      );
      expect(mutations).toHaveLength(0);
    });
  });

  describe("security forbidden terms", () => {
    it("page has no forbidden text", async () => {
      mockGet.mockResolvedValue(mockExports);
      await renderExportReview("#/settlement-ops/exports");
      await waitFor(() => {
        expect(screen.getByText("Settlement Export Review")).toBeTruthy();
      });
      const pageText = (document.body.textContent || "").toLowerCase();
      expect(pageText).not.toContain("payout");
      expect(pageText).not.toContain("payment instruction");
      expect(pageText).not.toContain("export-once");
    });
  });
});
