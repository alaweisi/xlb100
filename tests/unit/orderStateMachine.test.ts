import { describe, it, expect } from "vitest";
import {
  assertOrderTransition,
  canTransitionOrder,
  InvalidOrderTransitionError,
} from "../../backend/src/order/orderStateMachine.js";

describe("orderStateMachine", () => {
  it("allows draft to pending_dispatch", () => {
    expect(canTransitionOrder("draft", "pending_dispatch")).toBe(true);
  });

  it("allows pending_dispatch to service_completed", () => {
    expect(canTransitionOrder("pending_dispatch", "service_completed")).toBe(true);
  });

  it("allows service_completed to paid", () => {
    expect(canTransitionOrder("service_completed", "paid")).toBe(true);
  });

  it("forbids paid to service_completed", () => {
    expect(canTransitionOrder("paid", "service_completed")).toBe(false);
    expect(() => assertOrderTransition("paid", "service_completed")).toThrow(
      InvalidOrderTransitionError,
    );
  });

  it("forbids paid to cancelled", () => {
    expect(canTransitionOrder("paid", "cancelled")).toBe(false);
  });
});
