import { describe, expect, it } from "vitest";
import { assertSettlementConfirmable, assertSettlementPayableReady, canConfirmSettlement, canMarkSettlementPayable } from "../../backend/src/settlement/settlementStateMachine.js";

describe("settlementStateMachine", () => {
  it("allows only prepared to enter confirmation", () => {
    expect(canConfirmSettlement("prepared")).toBe(true);
    expect(canConfirmSettlement("confirmed")).toBe(false);
    expect(canConfirmSettlement("cancelled")).toBe(false);
    expect(() => assertSettlementConfirmable("prepared")).not.toThrow();
    expect(() => assertSettlementConfirmable("cancelled")).toThrow(/cannot be confirmed/);
  });

  it("allows only confirmed to enter payable readiness", () => {
    expect(canMarkSettlementPayable("confirmed")).toBe(true);
    expect(canMarkSettlementPayable("prepared")).toBe(false);
    expect(canMarkSettlementPayable("cancelled")).toBe(false);
    expect(() => assertSettlementPayableReady("confirmed")).not.toThrow();
    expect(() => assertSettlementPayableReady("prepared")).toThrow(/cannot be marked payable/);
  });
});
