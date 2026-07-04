import { describe, expect, it } from "vitest";
import { assertSettlementConfirmable, canConfirmSettlement } from "../../backend/src/settlement/settlementStateMachine.js";

describe("settlementStateMachine", () => {
  it("allows only prepared to enter confirmation", () => {
    expect(canConfirmSettlement("prepared")).toBe(true);
    expect(canConfirmSettlement("confirmed")).toBe(false);
    expect(canConfirmSettlement("cancelled")).toBe(false);
    expect(() => assertSettlementConfirmable("prepared")).not.toThrow();
    expect(() => assertSettlementConfirmable("cancelled")).toThrow(/cannot be confirmed/);
  });
});
