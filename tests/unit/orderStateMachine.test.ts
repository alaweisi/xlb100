import { describe, it, expect } from "vitest";
import {
  assertOrderTransition,
  canTransitionOrder,
  InvalidOrderTransitionError,
} from "../../backend/src/order/orderStateMachine.js";

describe("orderStateMachine", () => {
  it("allows draft to pending_payment", () => {
    expect(canTransitionOrder("draft", "pending_payment")).toBe(true);
  });

  it("allows pending_payment to paid", () => {
    expect(canTransitionOrder("pending_payment", "paid")).toBe(true);
  });

  it("allows pending_payment to cancelled", () => {
    expect(canTransitionOrder("pending_payment", "cancelled")).toBe(true);
  });

  it("forbids paid to pending_payment", () => {
    expect(canTransitionOrder("paid", "pending_payment")).toBe(false);
    expect(() => assertOrderTransition("paid", "pending_payment")).toThrow(
      InvalidOrderTransitionError,
    );
  });

  it("forbids paid to cancelled", () => {
    expect(canTransitionOrder("paid", "cancelled")).toBe(false);
  });
});
