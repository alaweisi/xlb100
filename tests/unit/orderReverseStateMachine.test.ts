import { describe, expect, it } from "vitest";
import {
  assertOrderReverseTransition,
  InvalidOrderReverseTransitionError,
} from "../../backend/src/order/reverse/orderReverseStateMachine.js";

describe("order reverse state machine", () => {
  it("allows review then apply", () => {
    expect(() => assertOrderReverseTransition("requested", "approved")).not.toThrow();
    expect(() => assertOrderReverseTransition("approved", "applied")).not.toThrow();
  });

  it("keeps rejected and applied requests terminal", () => {
    expect(() => assertOrderReverseTransition("rejected", "approved")).toThrow(InvalidOrderReverseTransitionError);
    expect(() => assertOrderReverseTransition("applied", "approved")).toThrow(InvalidOrderReverseTransitionError);
  });
});
