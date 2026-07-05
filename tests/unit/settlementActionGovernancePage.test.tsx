// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettlementActionGovernancePage } from "@xlb/admin-pages/SettlementActionGovernancePage";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock("@xlb/api-client", () => ({
  createApiClient: () => ({ get: mockGet }),
  settlementApi: { create: () => ({ listStatementAudit: () => mockGet("listStatementAudit"), getReviewSummary: () => mockGet("getReviewSummary"), getSettlementAuditSummary: () => mockGet("getSettlementAuditSummary"), scanReconciliationGaps: () => mockGet("scanReconciliationGaps") }) },
}));

const mockOnBack = vi.fn();

describe("Phase 10A — Settlement Action Governance Foundation", () => {
  beforeEach(() => { mockGet.mockReset(); mockOnBack.mockReset(); });

  describe("unit — rendering", () => {
    it("renders governance shell title", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.getByText("Settlement Action Governance")).toBeTruthy(); });
    it("renders Governance Only and Execution Disabled subtitle", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.getByText(/Governance Only/)).toBeTruthy(); expect(screen.getAllByText(/Execution Disabled/).length).toBeGreaterThanOrEqual(1); });
    it("renders 10B-10F dedicated content sections", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); expect(screen.getByText("Intent Contract — Phase 10B")).toBeTruthy(); expect(screen.getByText("Governance Persistence — Phase 10C")).toBeTruthy(); expect(screen.getByText("Review Workflow — Phase 10D")).toBeTruthy(); expect(screen.getByText("Evidence Bundle / Audit Trail — Phase 10E")).toBeTruthy(); expect(screen.getByText("Readiness Packet / Dry-run Guard — Phase 10F")).toBeTruthy(); });
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
    it("shows Phase 10A-10F as Completed, Phase 11 as Forbidden", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); const completed = screen.getAllByText("Completed"); expect(completed.length).toBeGreaterThanOrEqual(6); expect(screen.getByText("Forbidden")).toBeTruthy(); });
  });

  describe("security — no enabled mutation controls", () => {
    it("no enabled payout/refund/reversal/mutation buttons", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); const enabled = [...screen.queryAllByRole("button")].filter(b => !(b as HTMLButtonElement).disabled && !/Back/i.test(b.textContent||"")).map(b => b.textContent); expect(enabled.length).toBe(0); });
  });

  describe("integration — disabled guard is no-op", () => {
    it("clicking disabled buttons does not trigger API", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); screen.getAllByText(/Execution disabled/).forEach(b => fireEvent.click(b)); expect(mockGet).not.toHaveBeenCalled(); });
    it("clicking back calls onBack", () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); fireEvent.click(screen.getAllByText("← Back to Console")[0]); expect(mockOnBack).toHaveBeenCalled(); });
  });

  describe("contract — no forbidden executable semantics", () => {
    const forbidden = ["Execute payout","Pay now","Withdraw","Execute refund","Reverse ledger","Commit settlement","Generate export file"];
    forbidden.forEach(label => { it(`no enabled "${label}"`, () => { render(<SettlementActionGovernancePage onBack={mockOnBack} />); const found = screen.queryAllByText(new RegExp(label,"i")).filter(el => el instanceof HTMLButtonElement && !el.disabled); expect(found.length).toBe(0); }); });
  });
});
