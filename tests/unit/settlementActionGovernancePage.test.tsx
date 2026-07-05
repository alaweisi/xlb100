// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettlementActionGovernancePage } from "@xlb/admin-pages/SettlementActionGovernancePage";

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));
vi.mock("@xlb/api-client", () => ({
  createApiClient: () => ({ get: mockGet, post: mockPost }),
  settlementApi: {
    create: () => ({
      listStatementAudit: () => mockGet("listStatementAudit"),
      getReviewSummary: () => mockGet("getReviewSummary"),
      getSettlementAuditSummary: () => mockGet("getSettlementAuditSummary"),
      scanReconciliationGaps: () => mockGet("scanReconciliationGaps"),
    }),
  },
  governancePlannerApi: {
    create: () => ({
      listSettlementDryRunPlans: () => mockGet("listSettlementDryRunPlans"),
      createSettlementDryRunPlan: () => mockPost("createSettlementDryRunPlan"),
      getSettlementDryRunPlan: () => mockGet("getSettlementDryRunPlan"),
      getSettlementDryRunPlanItems: () => mockGet("getSettlementDryRunPlanItems"),
      getSettlementDryRunPlanAudit: () => mockGet("getSettlementDryRunPlanAudit"),
      getReadinessPacketDryRunEligibility: () => mockGet("getReadinessPacketDryRunEligibility"),
    }),
  },
}));

const mockOnBack = vi.fn();

const renderGovernance = async (subView?: string) => {
  render(<SettlementActionGovernancePage onBack={mockOnBack} subView={subView} />);
  await waitFor(() => {
    if (subView === "plans") {
      expect(screen.getAllByRole("heading", { name: /Dry-run Plans/ }).length).toBeGreaterThan(0);
      return;
    }
    expect(screen.getByText("Settlement Action Governance")).toBeTruthy();
  });
};

describe("Phase 10A Settlement Action Governance Foundation", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockOnBack.mockReset();
    mockGet.mockResolvedValue({ ok: true, plans: [] });
    mockPost.mockResolvedValue({ ok: true, plan: {} });
  });

  describe("unit rendering", () => {
    it("renders governance shell title", async () => {
      await renderGovernance();
      expect(screen.getByText("Settlement Action Governance")).toBeTruthy();
    });

    it("renders Governance Only and Execution Disabled subtitle", async () => {
      await renderGovernance();
      expect(screen.getByText(/Governance Only/)).toBeTruthy();
      expect(screen.getAllByText(/Execution Disabled/).length).toBeGreaterThanOrEqual(1);
    });

    it("renders 10B-10F dedicated content sections", async () => {
      await renderGovernance();
      expect(screen.getByRole("heading", { name: /Intent Contract/ })).toBeTruthy();
      expect(screen.getByText(/Governance Persistence/)).toBeTruthy();
      expect(screen.getByText(/Review Workflow/)).toBeTruthy();
      expect(screen.getByRole("heading", { name: /Evidence Bundle \/ Audit Trail/ })).toBeTruthy();
      expect(screen.getByRole("heading", { name: /Readiness Packet \/ Dry-run Guard/ })).toBeTruthy();
    });

    it("renders Phase 11 section", async () => {
      await renderGovernance();
      expect(screen.getByRole("heading", { name: /Dry-run Planner/ })).toBeTruthy();
    });

    it("renders View Dry-run Plans button", async () => {
      await renderGovernance();
      expect(screen.getByText("View Dry-run Plans")).toBeTruthy();
    });

    it("renders Generate Dry-run Plan button", async () => {
      await renderGovernance();
      expect(screen.getByText("Generate Dry-run Plan")).toBeTruthy();
    });

    it("renders Execution Boundary section", async () => {
      await renderGovernance();
      expect(screen.getByText(/Execution Boundary/)).toBeTruthy();
    });

    it("renders back button", async () => {
      await renderGovernance();
      expect(screen.getAllByRole("button", { name: /Back to Console/i }).length).toBeGreaterThan(0);
    });

    it("does not display No Persistence text", async () => {
      await renderGovernance();
      expect(screen.queryByText(/No Persistence/)).toBeNull();
    });

    it("does not display no backend interaction text", async () => {
      await renderGovernance();
      expect(screen.queryByText(/no backend interaction/)).toBeNull();
    });
  });

  describe("unit governance boundary banner", () => {
    it("displays no-payout / no-refund / no-mutation", async () => {
      await renderGovernance();
      expect(screen.getByText(/does not execute payouts/)).toBeTruthy();
      expect(screen.getByText(/does not execute refunds/)).toBeTruthy();
      expect(screen.getByText(/does not mutate settlement/)).toBeTruthy();
    });
  });

  describe("unit intent draft shell fields are disabled", () => {
    it("all inputs are disabled and readonly", async () => {
      await renderGovernance();
      const inputs = screen.getAllByRole("textbox");
      expect(inputs.length).toBeGreaterThanOrEqual(4);
      for (const input of inputs) {
        expect((input as HTMLInputElement).disabled).toBe(true);
      }
    });
  });

  describe("unit forbidden action guard", () => {
    it("all 6 execution buttons are disabled", async () => {
      await renderGovernance();
      const btns = screen.getAllByText(/Execution disabled/);
      expect(btns.length).toBe(6);
      for (const button of btns) {
        expect((button as HTMLButtonElement).disabled).toBe(true);
      }
    });
  });

  describe("unit phase boundary card", () => {
    it("shows Phase 10A-10F as Completed", async () => {
      await renderGovernance();
      const completed = screen.getAllByText("Completed");
      expect(completed.length).toBeGreaterThanOrEqual(6);
    });

    it("shows Phase 11 row in boundary table", async () => {
      await renderGovernance();
      const rows = screen.getAllByRole("row");
      const phase11 = rows.find((row) => row.textContent?.includes("Phase 11"));
      expect(phase11).toBeTruthy();
    });
  });

  describe("security no enabled mutation controls", () => {
    it("no enabled payout/refund/reversal/mutation buttons except governance navigation", async () => {
      await renderGovernance();
      const enabled = [...screen.queryAllByRole("button")].filter((button) =>
        !(button as HTMLButtonElement).disabled &&
        !/Back/i.test(button.textContent || "") &&
        !/View Dry-run Plans/i.test(button.textContent || "") &&
        !/Generate Dry-run Plan/i.test(button.textContent || "")
      );
      expect(enabled.length).toBe(0);
    });
  });

  describe("security forbidden execute/payout/refund/download/export buttons", () => {
    const forbidden = ["Execute", "Payout", "Refund", "Reverse", "Download", "Export"];
    forbidden.forEach((label) => {
      it(`no enabled button containing "${label}"`, async () => {
        await renderGovernance();
        const enabled = [...screen.queryAllByRole("button")].filter(
          (button) =>
            !(button as HTMLButtonElement).disabled &&
            new RegExp(label, "i").test(button.textContent || ""),
        );
        expect(enabled.length).toBe(0);
      });
    });
  });

  describe("integration disabled guard is no-op", () => {
    it("clicking disabled buttons does not trigger API", async () => {
      await renderGovernance();
      screen.getAllByText(/Execution disabled/).forEach((button) => fireEvent.click(button));
      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("clicking back calls onBack", async () => {
      await renderGovernance();
      const backButtons = screen.getAllByRole("button", { name: /Back to Console/i });
      fireEvent.click(backButtons[0]);
      expect(mockOnBack).toHaveBeenCalled();
    });
  });

  describe("contract no forbidden executable semantics", () => {
    const forbidden = [
      "Execute payout",
      "Pay now",
      "Withdraw",
      "Execute refund",
      "Reverse ledger",
      "Commit settlement",
      "Generate export file",
    ];
    forbidden.forEach((label) => {
      it(`no enabled "${label}"`, async () => {
        await renderGovernance();
        const found = screen
          .queryAllByText(new RegExp(label, "i"))
          .filter((element) => element instanceof HTMLButtonElement && !element.disabled);
        expect(found.length).toBe(0);
      });
    });
  });

  describe("Phase 11 dry-run plans sub-view", () => {
    it("renders without error with subView=plans", async () => {
      await renderGovernance("plans");
      expect(screen.getByText(/does not execute payouts/)).toBeTruthy();
    });

    it("shows governance boundary banner in plans sub-view", async () => {
      await renderGovernance("plans");
      expect(screen.getByText(/does not execute payouts/)).toBeTruthy();
    });

    it("shows empty state when no plans", async () => {
      mockGet.mockResolvedValue({ ok: true, plans: [] });
      await renderGovernance("plans");
      expect(await screen.findByText(/No dry-run plans found/)).toBeTruthy();
    });

    it("renders plans in table when data available", async () => {
      mockGet.mockResolvedValue({
        ok: true,
        plans: [{
          planId: "p1",
          planHash: "abc123",
          status: "draft",
          packetId: "pkt1",
          cityCode: "hangzhou",
          itemCount: 5,
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
        }],
      });
      await renderGovernance("plans");
      expect(await screen.findByText("abc123")).toBeTruthy();
      expect(screen.getByText("draft")).toBeTruthy();
      expect(screen.getByText("5")).toBeTruthy();
    });

    it("shows execution boundary in plans sub-view", async () => {
      await renderGovernance("plans");
      expect(screen.getByText(/Execution Boundary/)).toBeTruthy();
    });

    it("no execute/payout/refund/download/export buttons in plans sub-view", async () => {
      await renderGovernance("plans");
      const forbidden = ["Execute", "Payout", "Refund", "Download", "Export"];
      for (const label of forbidden) {
        const found = screen
          .queryAllByText(new RegExp(label, "i"))
          .filter((element) => element instanceof HTMLButtonElement && !(element as HTMLButtonElement).disabled);
        expect(found.length).toBe(0);
      }
    });
  });

  describe("Phase 11 generate dry-run plan", () => {
    it("Generate Dry-run Plan button is enabled", async () => {
      await renderGovernance();
      const button = screen.getByText("Generate Dry-run Plan") as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it("does not show Execute, Payout, Refund, Reverse buttons", async () => {
      await renderGovernance();
      const forbidden = ["Execute", "Payout", "Refund", "Reverse"];
      for (const label of forbidden) {
        const found = screen
          .queryAllByText(new RegExp(label, "i"))
          .filter((element) => element instanceof HTMLButtonElement && !(element as HTMLButtonElement).disabled);
        expect(found.length).toBe(0);
      }
    });
  });
});
