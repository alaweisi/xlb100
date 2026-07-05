// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettlementActionGovernancePage } from "@xlb/admin-pages/SettlementActionGovernancePage";

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));
vi.mock("@xlb/api-client", () => ({
  createApiClient: () => ({ get: mockGet, post: mockPost }),
  settlementApi: { create: () => ({ listStatementAudit: () => mockGet("listStatementAudit"), getReviewSummary: () => mockGet("getReviewSummary"), getSettlementAuditSummary: () => mockGet("getSettlementAuditSummary"), scanReconciliationGaps: () => mockGet("scanReconciliationGaps") }) },
  governancePlannerApi: { create: () => ({ listSettlementDryRunPlans: () => mockGet("listSettlementDryRunPlans"), createSettlementDryRunPlan: () => mockPost("createSettlementDryRunPlan"), getSettlementDryRunPlan: () => mockGet("getSettlementDryRunPlan"), getSettlementDryRunPlanItems: () => mockGet("getSettlementDryRunPlanItems"), getSettlementDryRunPlanAudit: () => mockGet("getSettlementDryRunPlanAudit"), getReadinessPacketDryRunEligibility: () => mockGet("getReadinessPacketDryRunEligibility") }) },
}));

const mockOnBack = vi.fn();

describe("Phase 10A — Settlement Action Governance Foundation", () => {
  beforeEach(() => { mockGet.mockReset(); mockPost.mockReset(); mockOnBack.mockReset();
    mockGet.mockResolvedValue({ ok: true, plans: [] });
    mockPost.mockResolvedValue({ ok: true, plan: {} });
  });

  describe("unit — rendering", () => {
    it("renders governance shell title", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.getByText("Settlement Action Governance")).toBeTruthy(); });
    it("renders Governance Only and Execution Disabled subtitle", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.getByText(/Governance Only/)).toBeTruthy(); expect(screen.getAllByText(/Execution Disabled/).length).toBeGreaterThanOrEqual(1); });
    it("renders 10B-10F dedicated content sections", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.getByText("Intent Contract — Phase 10B")).toBeTruthy(); expect(screen.getByText("Governance Persistence — Phase 10C")).toBeTruthy(); expect(screen.getByText("Review Workflow — Phase 10D")).toBeTruthy(); expect(screen.getByText("Evidence Bundle / Audit Trail — Phase 10E")).toBeTruthy(); expect(screen.getByText("Readiness Packet / Dry-run Guard — Phase 10F")).toBeTruthy(); });
    it("renders Phase 11 section", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.getByText("Phase 11 — Dry-run Planner")).toBeTruthy(); });
    it("renders View Dry-run Plans button", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.getByText("View Dry-run Plans")).toBeTruthy(); });
    it("renders Generate Dry-run Plan button", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.getByText("Generate Dry-run Plan")).toBeTruthy(); });
    it("renders Execution Boundary section", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.getByText("Execution Boundary — All Disabled")).toBeTruthy(); });
    it("renders back button", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.getAllByText("← Back to Console").length).toBeGreaterThanOrEqual(1); });
    it("does not display No Persistence text", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.queryByText(/No Persistence/)).toBeNull(); });
    it("does not display no backend interaction text", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.queryByText(/no backend interaction/)).toBeNull(); });
  });

  describe("unit — governance boundary banner", () => {
    it("displays no-payout / no-refund / no-mutation", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.getByText(/does not execute payouts/)).toBeTruthy(); expect(screen.getByText(/does not execute refunds/)).toBeTruthy(); expect(screen.getByText(/does not mutate settlement/)).toBeTruthy(); });
  });

  describe("unit — intent draft shell fields are disabled", () => {
    it("all inputs are disabled and readonly", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); const inputs = screen.getAllByRole("textbox"); expect(inputs.length).toBeGreaterThanOrEqual(4); for (const i of inputs) { expect((i as HTMLInputElement).disabled).toBe(true); } });
  });

  describe("unit — forbidden action guard", () => {
    it("all 6 execution buttons are disabled", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); const btns = screen.getAllByText(/Execution disabled/); expect(btns.length).toBe(6); for (const b of btns) { expect((b as HTMLButtonElement).disabled).toBe(true); } });
  });

  describe("unit — phase boundary card", () => {
    it("shows Phase 10A-10F as Completed", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); const completed = screen.getAllByText("Completed"); expect(completed.length).toBeGreaterThanOrEqual(6); });
    it("shows Phase 11 row in boundary table", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); const rows = screen.getAllByRole("row"); const phase11 = rows.find(r => r.textContent?.includes("Phase 11")); expect(phase11).toBeTruthy(); });
  });

  describe("security — no enabled mutation controls", () => {
    it("no enabled payout/refund/reversal/mutation buttons except governance navigation", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); const enabled = [...screen.queryAllByRole("button")].filter(b => !(b as HTMLButtonElement).disabled && !/Back/i.test(b.textContent||"") && !/View Dry-run Plans/i.test(b.textContent||"") && !/Generate Dry-run Plan/i.test(b.textContent||"")).map(b => b.textContent); expect(enabled.length).toBe(0); });
  });

  describe("security — no execute/payout/refund/download/export buttons", () => {
    const forbidden = ["Execute", "Payout", "Refund", "Reverse", "Download", "Export"];
    forbidden.forEach(label => {
      it(`no enabled button containing "${label}"`, () => {
        render(<SettlementActionGovernancePage onBack={mockOnBack} />);
        const enabled = [...screen.queryAllByRole("button")].filter(b => !(b as HTMLButtonElement).disabled && new RegExp(label, "i").test(b.textContent || ""));
        expect(enabled.length).toBe(0);
      });
    });
  });

  describe("integration — disabled guard is no-op", () => {
    it("clicking disabled buttons does not trigger API", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); screen.getAllByText(/Execution disabled/).forEach(b => fireEvent.click(b)); expect(mockGet).not.toHaveBeenCalled(); expect(mockPost).not.toHaveBeenCalled(); });
    it("clicking back calls onBack", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); fireEvent.click(screen.getAllByText("← Back to Console")[0]); expect(mockOnBack).toHaveBeenCalled(); });
  });

  describe("contract — no forbidden executable semantics", () => {
    const forbidden = ["Execute payout","Pay now","Withdraw","Execute refund","Reverse ledger","Commit settlement","Generate export file"];
    forbidden.forEach(label => { it(`no enabled "${label}"`, () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); const found = screen.queryAllByText(new RegExp(label,"i")).filter(el => el instanceof HTMLButtonElement && !el.disabled); expect(found.length).toBe(0); }); });
  });

  describe("Phase 11 — dry-run plans sub-view", () => {
    it("renders without error with subView=plans", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} subView="plans" />);
      expect(screen.getByText(/does not execute payouts/)).toBeTruthy();
    });

    it("shows governance boundary banner in plans sub-view", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} subView="plans" />);
      expect(screen.getByText(/does not execute payouts/)).toBeTruthy();
    });

    it("shows empty state when no plans", async () => {
      mockGet.mockResolvedValue({ ok: true, plans: [] });
      render(<SettlementActionGovernancePage onBack={mockOnBack} subView="plans" />);
      expect(await screen.findByText(/No dry-run plans found/)).toBeTruthy();
    });

    it("renders plans in table when data available", async () => {
      mockGet.mockResolvedValue({
        ok: true,
        plans: [{ planId: "p1", planHash: "abc123", status: "draft", packetId: "pkt1", cityCode: "hangzhou", itemCount: 5, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" }],
      });
      render(<SettlementActionGovernancePage onBack={mockOnBack} subView="plans" />);
      expect(await screen.findByText("abc123")).toBeTruthy();
      expect(screen.getByText("draft")).toBeTruthy();
      expect(screen.getByText("5")).toBeTruthy();
    });

    it("shows execution boundary in plans sub-view", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} subView="plans" />);
      expect(screen.getByText("Execution Boundary — All Disabled")).toBeTruthy();
    });

    it("no execute/payout/refund/download/export buttons in plans sub-view", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} subView="plans" />);
      const forbidden = ["Execute", "Payout", "Refund", "Download", "Export"];
      for (const label of forbidden) {
        const found = screen.queryAllByText(new RegExp(label, "i")).filter(el => el instanceof HTMLButtonElement && !(el as HTMLButtonElement).disabled);
        expect(found.length).toBe(0);
      }
    });
  });

  describe("Phase 11 — generate dry-run plan", () => {
    it("Generate Dry-run Plan button is enabled", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      const btn = screen.getByText("Generate Dry-run Plan") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it("does not show Execute, Payout, Refund, Reverse buttons", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      const forbidden = ["Execute", "Payout", "Refund", "Reverse"];
      for (const label of forbidden) {
        const found = screen.queryAllByText(new RegExp(label, "i")).filter(el => el instanceof HTMLButtonElement && !(el as HTMLButtonElement).disabled);
        expect(found.length).toBe(0);
      }
    });
  });
});
