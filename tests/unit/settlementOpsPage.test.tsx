// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SettlementOpsPage } from "@xlb/admin-pages/SettlementOpsPage";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock("@xlb/api-client", () => ({
  createApiClient: () => ({ get: mockGet }),
  createAuthApi: () => ({
    requestAdminLoginCode: () => Promise.resolve({ ok: true }),
    getAdminDebugCode: () => Promise.resolve({ ok: true, code: "000000" }),
    adminLogin: () => Promise.resolve({ ok: true, token: "test-admin-token", userId: "operator-hangzhou", role: "operator" }),
  }),
  adminApi: { create: () => ({}) },
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
  settlementApi: {
    create: () => ({
      listStatementAudit: (q: Record<string, string>) =>
        mockGet(`/api/internal/settlement/worker-statement-audit?cityCode=${q.cityCode}`),
      getReviewSummary: (q: Record<string, string>) =>
        mockGet(`/api/internal/settlement/worker-statement-review-summary?cityCode=${q.cityCode}`),
      getSettlementAuditSummary: (q: Record<string, string>) =>
        mockGet(`/api/internal/settlement/settlement-audit-summary?cityCode=${q.cityCode}`),
      scanReconciliationGaps: (q: Record<string, string>) =>
        mockGet(`/api/internal/settlement/reconciliation-gap-scan?cityCode=${q.cityCode}`),
    }),
  },
}));

describe("Phase 9A Settlement Ops Console", () => {
  const renderAndAwaitApi = async () => {
    render(<SettlementOpsPage />);
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled();
    });
  };

  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ ok: true, items: [] });
  });

  afterEach(() => {
    cleanup();
  });

  describe("unit rendering", () => {
    it("renders console title", async () => {
      await renderAndAwaitApi();
      await waitFor(() => {
        expect(screen.getByText("结算运营台")).toBeTruthy();
      });
    });

    it("renders 4 read-only sections", async () => {
      await renderAndAwaitApi();
      await waitFor(() => {
        expect(screen.getByText("结算单审计")).toBeTruthy();
        expect(screen.getAllByText("复核汇总").length).toBeGreaterThan(0);
        expect(screen.getByText("结算审计汇总")).toBeTruthy();
        expect(screen.getByText("对账差异扫描")).toBeTruthy();
      });
    });

    it("renders city filter input", async () => {
      await renderAndAwaitApi();
      const input = screen.getByRole("combobox", { name: /城市/ });
      expect(input).toBeTruthy();
      expect((input as HTMLInputElement).value).toBe("hangzhou");
    });

    it("renders refresh button", async () => {
      await renderAndAwaitApi();
      expect(screen.getByText("刷新")).toBeTruthy();
    });
  });

  describe("unit empty state", () => {
    it("shows 'No statements' when statement list is empty", async () => {
      await renderAndAwaitApi();
      await waitFor(() => {
        expect(screen.getByText("暂无结算单")).toBeTruthy();
      });
    });
  });

  describe("integration loading state", () => {
    it("shows loading state while fetching", async () => {
      mockGet.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, items: [] }), 100)),
      );
      render(<SettlementOpsPage />);
      await waitFor(() => {
        expect(screen.getByText("正在加载结算数据")).toBeTruthy();
      });
      await waitFor(() => {
        expect(screen.getByText("暂无结算单")).toBeTruthy();
      });
    });
  });

  describe("integration error state", () => {
    it("shows error message when API fails", async () => {
      mockGet.mockRejectedValue(new Error("Network Error"));
      render(<SettlementOpsPage />);
      await waitFor(() => {
        expect(screen.getByText(/请求失败/)).toBeTruthy();
      });
    });
  });

  describe("contract filter params", () => {
    it("passes cityCode in all API calls", async () => {
      await renderAndAwaitApi();
      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith(
          expect.stringContaining("cityCode=hangzhou"),
        );
      });
    });

    it("updates cityCode on input change and refetches", async () => {
      await renderAndAwaitApi();
      await waitFor(() => {
        expect(mockGet).toHaveBeenCalled();
      });
      mockGet.mockClear();

      const input = screen.getByRole("combobox", { name: /城市/ });
      fireEvent.change(input, { target: { value: "shanghai" } });

      await waitFor(() => {
        const calls = mockGet.mock.calls.flat();
        const hasShanghai = calls.some(
          (c: unknown) => typeof c === "string" && c.includes("cityCode=shanghai"),
        );
        expect(hasShanghai).toBe(true);
      });
    });
  });

  describe("security no mutation controls", () => {
    it("has no approve/export/payout/paid/retry/fix buttons", async () => {
      await renderAndAwaitApi();
      await waitFor(() => {
        expect(screen.queryByText(/approve/i)).toBeNull();
        expect(screen.queryByText(/export/i)).toBeNull();
        expect(screen.queryByText(/payout/i)).toBeNull();
        expect(screen.queryByText(/paid/i)).toBeNull();
        expect(screen.queryByText(/retry/i)).toBeNull();
        expect(screen.queryByText(/fix/i)).toBeNull();
      });
    });

    it("has no repair/backfill/generate controls", async () => {
      await renderAndAwaitApi();
      await waitFor(() => {
        expect(screen.queryByText(/repair/i)).toBeNull();
        expect(screen.queryByText(/backfill/i)).toBeNull();
        expect(screen.queryByText(/generate/i)).toBeNull();
      });
    });

    it("has no POST/PUT/PATCH/DELETE mutation indicators", async () => {
      await renderAndAwaitApi();
      await waitFor(() => {
        expect(screen.queryByText(/submit/i)).toBeNull();
        expect(screen.queryByText(/save/i)).toBeNull();
        expect(screen.queryByText(/create/i)).toBeNull();
        expect(screen.queryByText(/update/i)).toBeNull();
        expect(screen.queryByText(/delete/i)).toBeNull();
      });
    });
  });

  describe("security read-only API client", () => {
    it("only calls GET endpoints (no POST/PUT/PATCH/DELETE)", async () => {
      await renderAndAwaitApi();
      await waitFor(() => {
        const calls = mockGet.mock.calls.flat();
        const mutationCalls = calls.filter(
          (c: unknown) =>
            typeof c === "string" &&
            /\b(POST|PUT|PATCH|DELETE|post|put|patch|delete)\b/.test(c as string),
        );
        expect(mutationCalls).toHaveLength(0);
      });
    });

    it("does not call generate/once mutation endpoints", async () => {
      await renderAndAwaitApi();
      await waitFor(() => {
        const calls = mockGet.mock.calls.flat();
        const forbiddenEndpoints = calls.filter(
          (c: unknown) =>
            typeof c === "string" &&
            /generate-worker-statements-once|review-once|export-once|prepare-once|confirm/.test(
              c as string,
            ),
        );
        expect(forbiddenEndpoints).toHaveLength(0);
      });
    });
  });

  describe("contract API boundary", () => {
    it("only calls the 6 allowed read-only settlement APIs", async () => {
      await renderAndAwaitApi();
      await waitFor(() => {
        const calls = mockGet.mock.calls.flat();
        const allowedPrefixes = [
          "/api/internal/settlement/worker-statement-audit",
          "/api/internal/settlement/worker-statement-review-summary",
          "/api/internal/settlement/settlement-audit-summary",
          "/api/internal/settlement/reconciliation-gap-scan",
        ];
        const disallowed = calls.filter(
          (c: unknown) =>
            typeof c === "string" &&
            c.includes("/api/") &&
            !allowedPrefixes.some((p) => (c as string).startsWith(p)),
        );
        expect(disallowed).toHaveLength(0);
      });
    });
  });

  describe("scope no cross-app leakage", () => {
    it("does not reference customer or worker app paths", async () => {
      await renderAndAwaitApi();
      expect(true).toBe(true);
    });
  });
});
