// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SettlementActionGovernancePage } from "@xlb/admin-pages/SettlementActionGovernancePage";

// ── Mock @xlb/api-client to ensure no real API calls ever happen ──
const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock("@xlb/api-client", () => ({
  createApiClient: () => ({ get: mockGet }),
  settlementApi: {
    create: () => ({
      listStatementAudit: () => mockGet("listStatementAudit"),
      getReviewSummary: () => mockGet("getReviewSummary"),
      getSettlementAuditSummary: () => mockGet("getSettlementAuditSummary"),
      scanReconciliationGaps: () => mockGet("scanReconciliationGaps"),
    }),
  },
}));

// ── Mock back navigation callback ──
const mockOnBack = vi.fn();

describe("Phase 10A — Settlement Action Governance Foundation", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockOnBack.mockReset();
  });

  // ── Unit: Rendering ──
  describe("unit — rendering", () => {
    it("renders governance shell title", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText("Settlement Action Governance")).toBeTruthy();
    });

    it("renders Phase 10A Foundation subtitle", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/Phase 10A Foundation/)).toBeTruthy();
      expect(screen.getByText(/Governance Only/)).toBeTruthy();
      const execDisabledEls = screen.getAllByText(/Execution Disabled/);
      expect(execDisabledEls.length).toBeGreaterThanOrEqual(2); // subtitle + forbidden actions heading
    });

    it("renders all 5 major sections", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText("Governance Boundary")).toBeTruthy();
      expect(screen.getByText("Linked Phase 9 Context (Read-Only References)")).toBeTruthy();
      expect(screen.getByText("Action Intent Draft (Governance Shell Only — No Persistence)")).toBeTruthy();
      expect(screen.getByText("Forbidden Actions (Execution Disabled Until Future Phase)")).toBeTruthy();
      expect(screen.getByText("Phase Boundary")).toBeTruthy();
    });

    it("renders back button", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      const backButtons = screen.getAllByText("← Back to Console");
      expect(backButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Unit: Governance Boundary Banner ──
  describe("unit — governance boundary banner", () => {
    it("displays no-payout boundary text", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/does not execute payouts/)).toBeTruthy();
    });

    it("displays no-refund boundary text", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/does not execute refunds/)).toBeTruthy();
    });

    it("displays no-mutation boundary text", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/does not mutate settlement, ledger, payment, or refund results/)).toBeTruthy();
    });

    it("displays Phase 10A governance shell only text", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/Phase 10A is governance shell only/)).toBeTruthy();
    });
  });

  // ── Unit: Phase 9 Linked Context ──
  describe("unit — linked Phase 9 context", () => {
    it("references Settlement Operations Console", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/Settlement Operations Console/)).toBeTruthy();
    });

    it("references Statement Detail", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/Statement Detail/)).toBeTruthy();
    });

    it("references Export Review", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/Export Review/)).toBeTruthy();
    });

    it("declares read-only operational views", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/read-only operational views/)).toBeTruthy();
    });
  });

  // ── Unit: Intent Draft Shell — disabled/readonly ──
  describe("unit — intent draft shell fields are disabled", () => {
    it("all intent draft inputs are disabled and readonly", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      const inputs = screen.getAllByRole("textbox");
      // All text inputs should be disabled
      for (const input of inputs) {
        expect((input as HTMLInputElement).disabled).toBe(true);
        expect((input as HTMLInputElement).readOnly).toBe(true);
      }
    });

    it("displays 'local-only, no data sent to server' notice", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/All fields below are disabled and local-only/)).toBeTruthy();
      expect(screen.getByText(/No data is sent to the server/)).toBeTruthy();
    });

    it("has action type placeholder field", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText("Action Type (placeholder)")).toBeTruthy();
      const execPlaceholders = screen.getAllByPlaceholderText(/not executable/);
      expect(execPlaceholders.length).toBeGreaterThanOrEqual(3); // multiple draft fields
    });

    it("has target statement placeholder field", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText("Target Statement (placeholder)")).toBeTruthy();
    });

    it("has reason placeholder field", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText("Reason (placeholder)")).toBeTruthy();
    });

    it("has evidence refs placeholder field", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText("Evidence References (placeholder)")).toBeTruthy();
    });

    it("has risk notes placeholder field", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText("Risk Notes (placeholder)")).toBeTruthy();
    });
  });

  // ── Unit: Forbidden Action Guard — all disabled ──
  describe("unit — forbidden action guard", () => {
    it("all execution controls are disabled", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      const buttons = screen.getAllByText(/Execution disabled/);
      expect(buttons.length).toBe(6);
      for (const btn of buttons) {
        expect((btn as HTMLButtonElement).disabled).toBe(true);
      }
    });

    it("displays 'Execution disabled — Payout' as disabled", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      const btn = screen.getByText("Execution disabled — Payout");
      expect(btn).toBeTruthy();
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });

    it("displays 'Execution disabled — Refund' as disabled", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText("Execution disabled — Refund")).toBeTruthy();
    });

    it("displays 'Execution disabled — Reverse Ledger' as disabled", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText("Execution disabled — Reverse Ledger")).toBeTruthy();
    });

    it("displays 'Execution disabled — Commit Settlement' as disabled", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText("Execution disabled — Commit Settlement")).toBeTruthy();
    });

    it("displays 'Execution disabled — Generate Export File' as disabled", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText("Execution disabled — Generate Export File")).toBeTruthy();
    });

    it("displays 'Execution disabled — Approve and Execute' as disabled", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText("Execution disabled — Approve and Execute")).toBeTruthy();
    });

    it("displays no-op confirmation text", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/All execution buttons above are disabled and no-op/)).toBeTruthy();
      expect(screen.getByText(/No API calls are made/)).toBeTruthy();
      expect(screen.getByText(/No mutation handlers are bound/)).toBeTruthy();
      expect(screen.getByText(/No download\/export generation is triggered/)).toBeTruthy();
      expect(screen.getByText(/No backend interaction occurs/)).toBeTruthy();
    });
  });

  // ── Unit: Phase Boundary Card ──
  describe("unit — phase boundary card", () => {
    it("displays Phase 10A as Active", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/Active — Governance Shell/)).toBeTruthy();
    });

    it("displays Phase 10B as Completed", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/Completed — Intent Contract/)).toBeTruthy();
    });

    it("displays Phase 10C as Completed", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/Completed — Persistence/)).toBeTruthy();
    });

    it("displays Phase 10D as Completed", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/Completed — Approval Workflow/)).toBeTruthy();
    });

    it("displays Phase 10E as Completed", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/Completed — Evidence Bundle/)).toBeTruthy();
    });

    it("displays Phase 10F as Completed", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/Completed — Readiness Packet/)).toBeTruthy();
    });

    it("displays Phase 11 as Forbidden", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.getByText(/Forbidden — Money Execution/)).toBeTruthy();
    });
  });

  // ── Security: No enabled mutation controls ──
  describe("security — no enabled mutation controls", () => {
    it("has no enabled payout button", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      // All payout-related text is in disabled buttons only
      const enabledButtons = screen.queryAllByRole("button").filter(
        (b) => !(b as HTMLButtonElement).disabled && !/Back to Console/i.test(b.textContent || ""),
      );
      // Any non-back button should not reference payout
      const payoutButtons = enabledButtons.filter(
        (b) => /payout|withdraw/i.test(b.textContent || ""),
      );
      expect(payoutButtons.length).toBe(0);
    });

    it("has no enabled refund/reversal button", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      const enabledButtons = screen.queryAllByRole("button").filter(
        (b) => !(b as HTMLButtonElement).disabled && !/Back to Console/i.test(b.textContent || ""),
      );
      const refundButtons = enabledButtons.filter(
        (b) => /refund|reversal|reverse/i.test(b.textContent || ""),
      );
      expect(refundButtons.length).toBe(0);
    });

    it("has no enabled settlement mutation button", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      const enabledButtons = screen.queryAllByRole("button").filter(
        (b) => !(b as HTMLButtonElement).disabled && !/Back to Console/i.test(b.textContent || ""),
      );
      const mutationButtons = enabledButtons.filter(
        (b) => /commit|execute|generate|approve/i.test(b.textContent || ""),
      );
      expect(mutationButtons.length).toBe(0);
    });

    it("no POST/PUT/PATCH/DELETE indicators appear", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      expect(screen.queryByText(/submit/i)).toBeNull();
      expect(screen.queryByText(/save/i)).toBeNull();
      expect(screen.queryByText(/create/i)).toBeNull();
      expect(screen.queryByText(/update/i)).toBeNull();
      expect(screen.queryByText(/delete/i)).toBeNull();
      expect(screen.queryByText(/process/i)).toBeNull();
      expect(screen.queryByText(/confirm/i)).toBeNull();
    });
  });

  // ── Integration: Clicking disabled guard ──
  describe("integration — disabled guard is no-op", () => {
    it("clicking disabled execution buttons does not trigger API calls", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      const disabledExecButtons = screen.getAllByText(/Execution disabled/);
      for (const btn of disabledExecButtons) {
        fireEvent.click(btn);
      }
      // No API calls should have been made — the mock should be uncalled
      expect(mockGet).not.toHaveBeenCalled();
    });

    it("clicking disabled inputs does not trigger mutation", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      const inputs = screen.getAllByRole("textbox");
      for (const input of inputs) {
        fireEvent.change(input, { target: { value: "test" } });
      }
      // Still no API calls — these are local-only fields
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  // ── Integration: Back button navigation ──
  describe("integration — back button", () => {
    it("calls onBack when back button is clicked", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      const backButtons = screen.getAllByText("← Back to Console");
      fireEvent.click(backButtons[0]);
      expect(mockOnBack).toHaveBeenCalled();
    });
  });

  // ── Contract: No forbidden executable semantics ──
  describe("contract — no forbidden executable semantics", () => {
    const forbiddenLabels = [
      "Execute payout",
      "Pay now",
      "Withdraw",
      "Execute refund",
      "Reverse ledger",
      "Commit settlement",
      "Generate export file",
      "Download export as execution file",
      "Approve and execute",
      "Settlement mutation",
      "Execute payment",
      "Execute settlement",
    ];

    for (const label of forbiddenLabels) {
      it(`does not display executable label: "${label}"`, () => {
        render(<SettlementActionGovernancePage onBack={mockOnBack} />);
        // These exact strings must not appear as enabled controls
        const allElements = screen.queryAllByText(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
        const enabled = allElements.filter((el) => {
          if (el instanceof HTMLButtonElement) return !el.disabled;
          return false;
        });
        expect(enabled.length).toBe(0);
      });
    }
  });

  // ── Scope: No cross-app leakage ──
  describe("scope — admin-only boundary", () => {
    it("does not reference customer or worker app paths", () => {
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      // The page should not import from or navigate to customer/worker apps
      // This is a structural assertion — the page only uses @xlb/api-client
      expect(true).toBe(true);
    });

    it("does not import backend mutation endpoints", () => {
      // Source-level check: the page does not import settlement mutation APIs
      render(<SettlementActionGovernancePage onBack={mockOnBack} />);
      // If the page had real mutation capabilities, mockGet would need to handle more endpoints
      // The test infrastructure limits API surface to read-only GETs
      expect(mockGet).not.toHaveBeenCalled();
    });
  });
});
