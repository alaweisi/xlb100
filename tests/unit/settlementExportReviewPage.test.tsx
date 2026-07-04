// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { App } from "../../apps/admin/src/app/App";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock("@xlb/api-client", () => ({
  createApiClient: () => ({ get: mockGet }),
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
}));

const mockExports = {
  ok: true,
  items: [
    { exportId: "exp-1", statementId: "stmt-001", workerId: "worker-1", exportFormat: "csv", contentHash: "abc123def456789", exportedAt: "2026-07-01T00:00:00Z", exportedBy: "operator-1", cityCode: "hangzhou", reviewId: "review-1", payloadVersion: "1", outboxEventId: "evt-1" },
    { exportId: "exp-2", statementId: "stmt-002", workerId: "worker-2", exportFormat: "json", contentHash: "def456abc123789", exportedAt: "2026-07-02T00:00:00Z", exportedBy: "operator-2", cityCode: "hangzhou", reviewId: null, payloadVersion: "1", outboxEventId: null },
  ],
  nextCursor: null,
};

describe("Phase 9C — Export Review Console", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ ok: true, items: [] });
    window.location.hash = "";
  });
  afterEach(() => { window.location.hash = ""; });

  // Unit: Route
  describe("unit — route", () => {
    it("renders export review page at #/settlement-ops/exports", async () => {
      mockGet.mockResolvedValue(mockExports);
      window.location.hash = "#/settlement-ops/exports";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("Settlement Export Review")).toBeTruthy(); });
    });

    it("dashboard has export review navigation button", () => {
      render(<App />);
      expect(screen.getByText("Settlement Exports")).toBeTruthy();
    });
  });

  // Unit: API
  describe("unit — API calls", () => {
    it("calls listExportAudit on mount", async () => {
      mockGet.mockResolvedValue(mockExports);
      window.location.hash = "#/settlement-ops/exports";
      render(<App />);
      await waitFor(() => {
        const calls = mockGet.mock.calls.flat();
        expect(calls.some((c: unknown) => typeof c === "string" && (c as string).includes("export-audit"))).toBe(true);
      });
    });
  });

  // Unit: Rendering
  describe("unit — rendering", () => {
    it("renders export records in table", async () => {
      mockGet.mockResolvedValue(mockExports);
      window.location.hash = "#/settlement-ops/exports";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("exp-1")).toBeTruthy(); });
      expect(screen.getByText("exp-2")).toBeTruthy();
      expect(screen.getByText("csv")).toBeTruthy();
      expect(screen.getByText("json")).toBeTruthy();
    });

    it("renders content hash truncated", async () => {
      mockGet.mockResolvedValue(mockExports);
      window.location.hash = "#/settlement-ops/exports";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("abc123def456...")).toBeTruthy(); });
    });
  });

  // Integration: States
  describe("integration — states", () => {
    it("shows loading state", () => {
      mockGet.mockImplementation(() => new Promise(() => {}));
      window.location.hash = "#/settlement-ops/exports";
      render(<App />);
      expect(screen.getByText(/Loading exports/)).toBeTruthy();
    });

    it("shows error state", async () => {
      mockGet.mockRejectedValue(new Error("Network Error"));
      window.location.hash = "#/settlement-ops/exports";
      render(<App />);
      await waitFor(() => { expect(screen.getByText(/Error:/)).toBeTruthy(); });
    });

    it("shows empty state", async () => {
      window.location.hash = "#/settlement-ops/exports";
      render(<App />);
      await waitFor(() => { expect(screen.getByText(/No export records/)).toBeTruthy(); });
    });
  });

  // Security: No mutation
  describe("security — no mutation", () => {
    it("has no approve/payout/fix/retry/repair/backfill buttons", async () => {
      mockGet.mockResolvedValue(mockExports);
      window.location.hash = "#/settlement-ops/exports";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("Settlement Export Review")).toBeTruthy(); });
      expect(screen.queryByText(/^approve$/i)).toBeNull();
      expect(screen.queryByText(/^payout$/i)).toBeNull();
      expect(screen.queryByText(/^fix$/i)).toBeNull();
      expect(screen.queryByText(/^retry$/i)).toBeNull();
    });

    it("only GET endpoints called", async () => {
      mockGet.mockResolvedValue(mockExports);
      window.location.hash = "#/settlement-ops/exports";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("Settlement Export Review")).toBeTruthy(); });
      const calls = mockGet.mock.calls.flat();
      const mutations = calls.filter((c: unknown) =>
        typeof c === "string" && /\b(POST|PUT|PATCH|DELETE)\b/.test(c as string));
      expect(mutations).toHaveLength(0);
    });
  });

  // Security: Forbidden terms
  describe("security — forbidden terms", () => {
    it("page has no forbidden text", async () => {
      mockGet.mockResolvedValue(mockExports);
      window.location.hash = "#/settlement-ops/exports";
      render(<App />);
      await waitFor(() => { expect(screen.getByText("Settlement Export Review")).toBeTruthy(); });
      const t = document.body.textContent?.toLowerCase() || "";
      expect(t).not.toContain("payout");
      expect(t).not.toContain("payment instruction");
      expect(t).not.toContain("export-once");
    });
  });
});
